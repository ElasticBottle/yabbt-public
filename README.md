# Yet another basic backup tool

Tiny snapshot/restore prototype for any directory.

`snapshot` archives one or more local paths into a `.tar.gz` and saves it to backend of choice (currently supports local and s3)

> Everything below is for development. To use the cli directly, simply clone and run ./backup to get started

## Install

```bash
bun install
```

## Snapshot to Local Storage

```bash
mkdir -p /tmp/snapshot-demo/workdir
echo "hello" > /tmp/snapshot-demo/workdir/hello.txt

bun run src/index.ts snapshot \
  --session-id demo-session \
  --backend local \
  --base-backup-path /tmp/snapshot-demo/store \
  --from-path /tmp/snapshot-demo/workdir
```

This creates:

```text
/tmp/snapshot-demo/store/sessions/demo-session/latest.json
/tmp/snapshot-demo/store/sessions/demo-session/<snapshot-id>/archive_<snapshot-id>.tar.gz.manifest.json
/tmp/snapshot-demo/store/sessions/demo-session/<snapshot-id>/archive_<snapshot-id>.tar.gz
```

## Restore from Local Storage

```bash
bun run src/index.ts restore \
  --session-id demo-session \
  --backend local \
  --base-backup-path /tmp/snapshot-demo/store \
  --restore-path /tmp/snapshot-demo/restored \
  --clean
```

By default, restore uses the session's `latest.json`. To restore a specific snapshot:

```bash
bun run src/index.ts restore \
  --session-id demo-session \
  --backend local \
  --base-backup-path /tmp/snapshot-demo/store \
  --snapshot-id 20260518-123456789 \
  --restore-path /tmp/snapshot-demo/restored
```

## S3-Compatible Backend

For S3-compatible providers, configure the AWS SDK environment variables:

```bash
export AWS_ACCESS_KEY_ID=<access-key-id>
export AWS_SECRET_ACCESS_KEY=<secret-access-key>
# Optionally
export AWS_REGION=us-east-2
export AWS_ENDPOINT_URL=<optional-override>
```

Create a snapshot for a given session ID

```bash
bun run src/index.ts snapshot \
  --session-id demo-session \
  --backend s3 \
  --base-backup-path s3://my-bucket/snapshots \
  --from-path /workspace
```

Restore a session

```bash
bun run src/index.ts restore \
  --session-id demo-session \
  --backend s3 \
  --base-backup-path s3://my-bucket/snapshots \
  --restore-path /workspace \
  --clean
```

For Cloudflare R2, add the `CLOUDFLARE_COMPAT` flag.

```bash
AWS_S3_ENDPOINT=$CLOUDFLARE_R2_ENDPOINT \
AWS_ACCESS_KEY_ID=$CLOUDFLARE_R2_ACCESS_KEY \
AWS_SECRET_ACCESS_KEY=$CLOUDFLARE_R2_SECRET_KEY \
CLOUDFLARE_COMPAT=true \
bun run ./src/index.ts snapshot \
  -b s3 \
  --session-id worker-1 \
  --bbp "s3://{your-cloudflare-bucket}" \
  --fp "./src"
```

## Runtime Assumptions

This prototype currently shells out to `tar -czf` and `tar -xzf`.

`tar` is present on almost every normal Linux distribution and base image we are likely to use here. It is not a formal guarantee for extremely minimal or distroless images.

If we need to run in a distroless image, we will have to either add `tar`/`gzip` to the sandbox image or switch to a library-based archive implementation.

## Useful Flags

```text
--session-id, --sid          Stable ID used to find previous snapshots
--backend, -b                local | s3
--base-backup-path, --bbp    Local directory, or s3://bucket/prefix for S3
--from-path, --fp            Path to include in the snapshot. Can be repeated.
--restore-path, --rp         Restore destination directory
--snapshot-id                Restore a specific snapshot instead of latest
--clean, -c                  Empty target directory before restoring
```
