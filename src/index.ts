#!/usr/bin/env bun

import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { resolve } from "node:path";
import { restore } from "./lib/restore";
import { snapshot } from "./lib/snapshot";
import * as Backend from "./service/backend";

const backendOption = Options.choice("backend", ["local", "s3"] as const).pipe(
  Options.withAlias("b"),
  Options.withDescription("Storage backend to use.")
);
const sessionIdOption = Options.text("session-id").pipe(
  Options.withAlias("sid"),
  Options.withDescription("Stable ID used to group snapshots."));
const baseBackupPathOption = Options.text("base-backup-path").pipe(
  Options.withAlias("bbp"),
  Options.withDescription("The base path where snapshots are saved. For local directories, it's the relative path to where the command was ran from. For s3 it's s3://bucket/prefix.")
);

const snapshotCommand = Command.make(
  "snapshot",
  {
    backend: backendOption,
    sessionId: sessionIdOption,
    baseBackupPath: baseBackupPathOption,
    paths: Options.text("from-path").pipe(
      Options.withAlias("fp"),
      Options.atLeast(1),
      Options.withDescription("Path to include in the snapshot. Use  this flag multiple times to specify multiple paths.")
    ),
  },
  (options) =>
    Effect.provide(snapshot({
      sessionId: options.sessionId,
      paths: [...options.paths].map((path) => resolve(path)),
    }), Backend.layer(options))
).pipe(Command.withDescription("Create a snapshot archive and update latest.json."));

const restoreCommand = Command.make(
  "restore",
  {
    backend: backendOption,
    sessionId: sessionIdOption,
    baseBackupPath: baseBackupPathOption,
    restorePath: Options.text("restore-path").pipe(
      Options.withAlias('rp'),
      Options.withDescription("Directory to restore into.")),
    snapshotId: Options.text("snapshot-id").pipe(
      Options.withDefault(undefined),
      Options.withDescription("Restore a specific snapshot instead of latest.")
    ),
    clean: Options.boolean("clean").pipe(
      Options.withAlias("c"),
      Options.withDefault(false),
      Options.withDescription("Empty the target directory before extracting.")
    ),
  },
  (options) =>
    Effect.provide(
      restore({
        sessionId: options.sessionId,
        restorePath: resolve(options.restorePath),
        snapshotId: options.snapshotId,
        clean: options.clean,
      }),
      Backend.layer(options)
    )
).pipe(Command.withDescription("Restore latest or named snapshot into a target directory."));

const command = Command.make("backup").pipe(
  Command.withDescription("Snapshot and restore sandbox work directories."),
  Command.withSubcommands([snapshotCommand, restoreCommand])
);

const cli = Command.run(command, {
  name: "Snapshot",
  version: "0.0.1",
});

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
