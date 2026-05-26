import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import type { UnknownException } from "effect/Cause";

export function writeJson(path: string, value: unknown): Effect.Effect<void, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, `${JSON.stringify(value, null, 2)}\n`);
  });
}

export function readJson<T>(path: string): Effect.Effect<T, PlatformError | UnknownException, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(path, "utf8");
    return yield* Effect.try(() => JSON.parse(content) as T);
  });
}