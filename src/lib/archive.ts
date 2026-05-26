import { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Effect } from "effect";
import type { UnknownException } from "effect/Cause";
import { basename, dirname } from "node:path";

export function createTarball(
  entries: string[],
  archivePath: string
): Effect.Effect<void, UnknownException> {
  const args = ["-czf", archivePath];
  for (const entry of entries) {
    args.push("-C", dirname(entry), basename(entry));
  }
  return run({ command: "tar", args, timeoutMs: 120000 });
}

export function extractTarball(archivePath: string, target: string): Effect.Effect<void, UnknownException> {
  return run({ command: "tar", args: ["-xzf", archivePath, "-C", target], timeoutMs: 120000 });
}

export function sha256File(path: string): Effect.Effect<Buffer, PlatformError | UnknownException, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const data = yield* fileSystem.readFile(path);
    const bytes = new Uint8Array(data);
    const digest = yield* Effect.tryPromise(() => crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer));
    return Buffer.from(digest)
  });
}

function run({ command, args, timeoutMs }: { command: string; args: string[]; timeoutMs: number; }): Effect.Effect<void, UnknownException> {
  return Effect.tryPromise(async () => {
    const proc = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => {
      proc.kill();
    }, timeoutMs);

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timeout);

    if (exitCode !== 0) {
      throw new Error(
        [
          `Command failed: ${command} ${args.join(" ")}`,
          `exit_code=${exitCode}`,
          stdout ? `stdout:\n${stdout}` : "",
          stderr ? `stderr:\n${stderr}` : "",
        ]
          .filter(item => !!item)
          .join("\n")
      );
    }
  });
}
