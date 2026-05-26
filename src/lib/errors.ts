import { Data } from "effect";

export class SnapshotError extends Data.TaggedError("SnapshotError")<{
  message: string;
}> { }