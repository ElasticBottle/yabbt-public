import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Clock, Effect } from "effect";
import type { UnknownException } from "effect/Cause";
import { join } from "node:path";
import { createTarball } from "./archive";
import { withTempDirectory } from "./fs";
import { writeJson } from "./json";
import { getArchiveFileName, getArchiveKey, getLatestJSONKey, type LatestJSON } from "../service/backend/utils";
import { Backend } from "../service/backend";


export function snapshot(
  options: {
    sessionId: string;
    paths: string[];
  }
): Effect.Effect<void, PlatformError | UnknownException, Backend | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const backend = yield* Backend;
    const snapshotId = (yield* Clock.currentTimeMillis).toString()

    yield* withTempDirectory("snapshot-", (tempDir) => Effect.gen(function* () {
      yield* Effect.logInfo("snapshot.start");

      const archiveName = getArchiveFileName(snapshotId);
      const archivePath = join(tempDir, archiveName);
      yield* Effect.annotateLogsScoped({ archivePath });

      yield* Effect.logInfo("snapshot.create_archive.start");
      yield* createTarball(options.paths, archivePath)
      yield* Effect.logInfo("snapshot.create_archive.complete");

      const archiveKey = getArchiveKey(snapshotId, options.sessionId);
      yield* Effect.annotateLogsScoped({ archiveKey });
      yield* Effect.logInfo("snapshot.upload_files.start");
      yield* backend.putFiles([
        {
          localPath: archivePath,
          backupPath: archiveKey,
          metadata: { pathCount: options.paths.length.toString(), paths: JSON.stringify(options.paths) },
          storeChecksum: true
        },
      ])
      yield* Effect.logInfo("snapshot.upload_files.complete");

      const latestPath = join(tempDir, "latest.json");
      const latestKey = getLatestJSONKey(options.sessionId);
      yield* Effect.annotateLogsScoped({ latestKey });
      yield* writeJson(latestPath, {
        version: 1,
        snapshotId,
        archiveKey,
      } satisfies LatestJSON);
      yield* Effect.logInfo("snapshot.update_latest.start");
      yield* backend.putFile({
        localPath: latestPath,
        backupPath: latestKey,
        storeChecksum: true,
      })
      yield* Effect.logInfo("snapshot.update_latest.complete");
      yield* Effect.logInfo("snapshot.complete");
    })).pipe(
      Effect.withLogSpan("snapshot"),
      Effect.annotateLogs({
        sessionId: options.sessionId,
        snapshotId,
        paths: options.paths,
      }),
      Effect.scoped
    );
  });
}
