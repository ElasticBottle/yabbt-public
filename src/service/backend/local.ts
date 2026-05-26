import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { basename, dirname, join, resolve } from "node:path";
import { Backend, type BackendMetadata, type BackendPutFile, retryPolicy } from ".";
import { sha256File } from "../../lib/archive";
import { SnapshotError } from "../../lib/errors";
import { withTempDirectory } from "../../lib/fs";
import { readJson, writeJson } from "../../lib/json";

const localTempPrefix = "snapshot-backend-local-";

function localMetadata(file: BackendPutFile, checksum?: string): BackendMetadata | undefined {
  const metadata = {
    ...(file.metadata ? file.metadata : {}),
    ...(checksum ? { checksum, checksumAlgorithm: "sha256" } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function layerLocal(baseBackupPath: string): Layer.Layer<Backend, SnapshotError, FileSystem.FileSystem> {
  return Layer.effect(
    Backend,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const root = resolve(baseBackupPath);

      const putFileOnce = (file: BackendPutFile) => withTempDirectory(localTempPrefix, (tempDir) =>
        Effect.gen(function* () {
          const tempDestination = join(tempDir, basename(file.backupPath));
          const destination = join(root, file.backupPath);
          yield* Effect.logInfo({ tempDestination, destination })

          yield* fs.copyFile(file.localPath, tempDestination);
          yield* fs.makeDirectory(dirname(destination), { recursive: true });
          yield* fs.rename(tempDestination, destination);

          const checkSum = yield* sha256File(file.localPath)
          const metadata = localMetadata(file, file.storeChecksum ? checkSum.toString("hex") : undefined);
          if (metadata) {
            yield* writeJson(`${destination}.metadata.json`, metadata)
          }
        })
      );


      return {
        putFile: (file: BackendPutFile) => putFileOnce(file).pipe(Effect.retry(retryPolicy)),
        putFiles(files) {
          return Effect.forEach(files, putFileOnce, { concurrency: "unbounded", discard: true }).pipe(Effect.retry(retryPolicy));
        },
        getFile(key, localPath) {
          return Effect.gen(function* () {
            const source = join(root, key);
            const data = yield* fs.readFile(source);
            yield* fs.writeFile(localPath, data);
            const metadata = yield* readJson<BackendMetadata>(`${source}.metadata.json`);
            if (metadata.checksum) {
              const actualSha256 = yield* sha256File(localPath);
              if (actualSha256.toString('hex') !== metadata.checksum) {
                return yield* new SnapshotError({
                  message: `Archive checksum mismatch for ${key}: expected ${metadata.checksum}, got ${actualSha256}`,
                });
              }
            }
            return metadata;
          }).pipe(Effect.retry(retryPolicy));
        },
      };
    })
  );
}
