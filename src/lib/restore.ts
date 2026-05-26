import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import type { UnknownException } from "effect/Cause";
import { join } from "node:path";
import { extractTarball } from "./archive";
import { SnapshotError } from "./errors";
import { emptyDirectory, withTempDirectory } from "./fs";
import { readJson } from "./json";
import { getArchiveFileName, getArchiveKey, getLatestJSONKey, type LatestJSON } from "../service/backend/utils";
import { Backend } from "../service/backend";



export function restore(
  options: {
    sessionId: string;
    restorePath: string;
    snapshotId?: string;
    clean: boolean;
  }
): Effect.Effect<void, SnapshotError | PlatformError | UnknownException, Backend | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const backend = yield* Backend;
    const fs = yield* FileSystem.FileSystem;

    yield* withTempDirectory("onboarding-restore-", (tempDir) => Effect.gen(function* () {
      yield* Effect.logInfo("restore.start");
      let snapshotId = options.snapshotId;
      if (!snapshotId) {
        const latestPath = join(tempDir, "latest.json");
        const latestKey = getLatestJSONKey(options.sessionId);
        yield* Effect.annotateLogsScoped({ latestKey });
        yield* Effect.logInfo("restore.download_latest.start");
        yield* backend.getFile(latestKey, latestPath);
        yield* Effect.logInfo("restore.download_latest.complete");
        const latest = yield* readJson<LatestJSON>(latestPath);
        snapshotId = latest.snapshotId;
      }

      const archiveName = getArchiveFileName(snapshotId);
      const archivePath = join(tempDir, archiveName);
      yield* Effect.annotateLogsScoped({ archivePath });
      const archiveKey = getArchiveKey(snapshotId, options.sessionId);
      yield* Effect.annotateLogsScoped({ archiveKey });

      yield* Effect.logInfo("restore.download_archive.start");
      yield* backend.getFile(archiveKey, archivePath);
      yield* Effect.logInfo("restore.download_archive.complete");

      yield* fs.makeDirectory(options.restorePath, { recursive: true });
      if (options.clean) {
        yield* Effect.logInfo("restore.clean_restore_path.start");
        yield* emptyDirectory(options.restorePath);
        yield* Effect.logInfo("restore.clean_restore_path.complete");
      }
      yield* Effect.logInfo("restore.extract_archive.start");
      yield* extractTarball(archivePath, options.restorePath);
      yield* Effect.logInfo("restore.extract_archive.complete");

      yield* Effect.logInfo("restore.complete");
    })).pipe(
      Effect.withLogSpan("restore"),
      Effect.annotateLogs({
        sessionId: options.sessionId,
        snapshotId: options.snapshotId ?? "latest",
        restorePath: options.restorePath,
        clean: options.clean,
      }),
      Effect.scoped
    );
  });
}
