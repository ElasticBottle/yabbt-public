import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import { join } from "node:path";

export function emptyDirectory(path: string): Effect.Effect<void, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(path);
    yield* Effect.all(
      entries.map((entry) => fs.remove(join(path, entry), { force: true, recursive: true })),
      { concurrency: 8 }
    );
  });
}

export function withTempDirectory<A, E, R>(
  prefix: string,
  use: (path: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | PlatformError, R | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.acquireUseRelease(
      fs.makeTempDirectory({ prefix }),
      use,
      (path) => fs.remove(path, { force: true, recursive: true }).pipe(Effect.catchAll(() => Effect.void))
    );
  });
}