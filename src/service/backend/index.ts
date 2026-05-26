import type { PlatformError } from "@effect/platform/Error";
import { FileSystem } from "@effect/platform";
import { Context, Effect, Layer, Schedule } from "effect";
import type { ConfigError } from "effect/ConfigError";
import type { UnknownException } from "effect/Cause";
import type { SnapshotError } from "../../lib/errors";
import { layerLocal } from "./local";
import { layerS3 } from "./s3";

export type BackendMetadata = { pathCount?: string, paths?: string, checksum?: string, checksumAlgorithm?: string } & Record<string, string>;
export type BackendPutFile = {
  /**
  * The path on disk to the file we want to backup
  */
  localPath: string;
  /**
   * This is the path relative to the base-backup-path 
   */
  backupPath: string;
  metadata?: BackendMetadata;
  storeChecksum?: boolean
};

export class Backend extends Context.Tag("snapshot/Backend")<
  Backend,
  {
    readonly putFile: (file: BackendPutFile) => Effect.Effect<void, PlatformError | UnknownException, FileSystem.FileSystem>;
    readonly putFiles: (files: ReadonlyArray<BackendPutFile>) => Effect.Effect<void, PlatformError | UnknownException, FileSystem.FileSystem>;
    readonly getFile: (key: string, localPath: string) => Effect.Effect<BackendMetadata | undefined, PlatformError | UnknownException | SnapshotError, FileSystem.FileSystem>;
  }
>() { }

export const retryPolicy = Schedule.exponential("1 second").pipe(Schedule.intersect(Schedule.recurs(2)));

export function layer(options: {
  backend: "local" | "s3";
  baseBackupPath: string;
}): Layer.Layer<Backend, ConfigError | SnapshotError | UnknownException, FileSystem.FileSystem> {
  switch (options.backend) {
    case "local":
      return layerLocal(options.baseBackupPath);
    case "s3":
      return layerS3(options.baseBackupPath);
    default:
      const _never: never = options.backend
      throw new Error("Unexpected backend option")
  }
}


