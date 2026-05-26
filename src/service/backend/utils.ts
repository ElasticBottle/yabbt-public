export type LatestJSON = {
  version: 1;
  snapshotId: string,
  archiveKey: string,
};

export function getArchiveFileName(snapshotId: string): string {
  return `archive_${snapshotId}.tar.gz`;
}

export function getArchiveKey(snapshotId: string, sessionId: string): string {
  return [sessionId, snapshotId, getArchiveFileName(snapshotId)].join("/");
}

export function getLatestJSONKey(sessionId: string): string {
  return [sessionId, "latest.json"].join("/");
}
