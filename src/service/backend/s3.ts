import {
  ChecksumAlgorithm,
  ChecksumMode,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Config, Effect, Layer, Option, Redacted } from "effect";
import type { ConfigError } from "effect/ConfigError";
import type { UnknownException } from "effect/Cause";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { Backend, type BackendPutFile, retryPolicy } from ".";
import { SnapshotError } from "../../lib/errors";
import { sha256File } from "../../lib/archive";
import { createHash } from "node:crypto";

const s3Credentials = Effect.gen(function* () {
  const accessKeyId = yield* Config.string("AWS_ACCESS_KEY_ID");
  const secretAccessKey = yield* Config.redacted("AWS_SECRET_ACCESS_KEY");
  const region = yield* Config.string("AWS_REGION").pipe(Config.withDefault("us-east-1"));
  const endpoint = yield* Config.string("AWS_S3_ENDPOINT").pipe(Config.option);

  const isCloudflare = yield* Config.boolean("CLOUDFLARE_COMPAT").pipe(Config.withDefault(false))

  return { accessKeyId, secretAccessKey: isCloudflare ? createHash("sha256").update(Redacted.value(secretAccessKey)).digest("hex") : Redacted.value(secretAccessKey), region, endpoint: Option.getOrUndefined(endpoint) };
});

export function layerS3(store: string): Layer.Layer<Backend, ConfigError | SnapshotError | UnknownException> {
  return Layer.effect(
    Backend,
    Effect.gen(function* () {
      const s3Store = yield* parseS3Store(store);
      const { region, endpoint, ...credentials } = yield* s3Credentials;
      const client = new S3Client({
        region,
        endpoint,
        credentials
      });

      const putFileOnce = (file: BackendPutFile) => Effect.gen(function* () {
        const checksum = file.storeChecksum ? yield* sha256File(file.localPath) : undefined;
        const { size } = yield* Effect.tryPromise(() => stat(file.localPath));
        yield* Effect.tryPromise(async () => {
          await client.send(new PutObjectCommand({
            Bucket: s3Store.bucket,
            Key: s3Key(s3Store.prefix, file.backupPath),
            Body: createReadStream(file.localPath),
            ContentLength: size,
            Metadata: file.metadata,
            ChecksumSHA256: checksum ? checksum.toString("base64") : undefined,
            ChecksumAlgorithm: checksum ? ChecksumAlgorithm.SHA256 : undefined,
          }));
        });
      });

      return {
        putFile(file) {
          return putFileOnce(file).pipe(Effect.retry(retryPolicy));
        },
        putFiles(files) {
          return Effect.forEach(files, putFileOnce, { concurrency: "unbounded", discard: true }).pipe(Effect.retry(retryPolicy));
        },
        getFile(key: string, localPath: string) {
          return Effect.tryPromise(async () => {
            const response = await client.send(new GetObjectCommand({
              Bucket: s3Store.bucket,
              Key: s3Key(s3Store.prefix, key),
              ChecksumMode: ChecksumMode.ENABLED,
            }));
            if (!response.Body) {
              throw new Error(`S3 object has no body: ${key}`);
            }
            const bytes = await response.Body.transformToByteArray();
            await writeFile(localPath, bytes);
            return { ...response.Metadata, ...(response.ChecksumSHA256 ? { checksum: response.ChecksumSHA256, checksumAlgorithm: "sha256" } : {}) };
          }).pipe(Effect.retry(retryPolicy));
        },
      };
    })
  );
}

function parseS3Store(store: string): Effect.Effect<{ bucket: string; prefix: string }, SnapshotError> {
  return Effect.gen(function* () {
    if (!store.startsWith("s3://")) {
      return yield* new SnapshotError({ message: "--base-backup-path must start with s3:// when --backend s3 is used" });
    }

    const withoutScheme = store.slice("s3://".length);
    const [bucket, ...prefixParts] = withoutScheme.split("/");
    if (!bucket) {
      return yield* new SnapshotError({ message: "S3 base-backup-path must include a bucket, for example s3://my-bucket/snapshots" });
    }
    // regex to trim and trailing // starting slashes
    return { bucket, prefix: (prefixParts.join("/").replace(/^\/+|\/+$/g, "")) };
  });
}

function s3Key(storePrefix: string, key: string): string {
  return [storePrefix, key].filter(Boolean).join("/");
}
