# Mystery File Vending Machine

A small peer-to-peer file exchange for friends. Each computer runs a Node.js app, contributes chosen files, and draws a random file from another computer. Files stream on demand; your personal folders are never indexed.

## Run locally

Requires Node.js 22 or newer. No dependencies or build step.

```sh
npm start
```

Open http://127.0.0.1:3000. Without configured peers, local test mode lets you vend your own uploaded files. Before you contribute anything, the machine offers three built-in text surprises. Uploading your first file replaces those starters with your real contributions. Contributions, removal, and downloads work locally. Set `DEMO=false` to disable built-in surprises.

## Connect friends with Tailscale

1. Install and connect Tailscale on each computer in the same trusted tailnet.
2. Generate a shared token with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and share it privately with participants.
3. On each computer start the app with the same token and the other computers' Serve URLs:

```sh
MACHINE_NAME='My laptop' PEER_TOKEN='your-shared-token' PEERS='https://friend.tailnet-name.ts.net' npm start
```

4. In another terminal expose the local service to your tailnet:

```sh
tailscale serve --bg 3000
```

5. Add this machine's Serve URL to your friend's `PEERS`, and restart their app. Separate multiple peer origins with commas. Each person opens **http://127.0.0.1:3000 on their own computer** to contribute or draw. Serve exposes authenticated `/peer/*` routes for machine-to-machine exchange; operator controls are local only. Do not use Funnel.

Tailscale Serve setup: https://tailscale.com/docs/features/tailscale-serve

The app does not configure Tailscale, change your ACLs, or automatically discover other machines. A Tailscale connection is needed for real cross-computer transfers.

## Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local server port |
| `HOST` | `127.0.0.1` | Listen address; keep loopback when using Serve |
| `MACHINE_NAME` | `My machine` | Friendly machine name |
| `PEER_TOKEN` | unset | Shared authentication token, required with peers |
| `PEERS` | unset | Comma-separated HTTP(S) peer origins |
| `DEMO` | enabled only without peers | `false` disables starter files |
| `DATA_DIR` | `./data` | Stored contributions and metadata |

Only deliberately contributed files are shared. Supported extensions: PNG, JPEG, GIF, WebP, TXT, Markdown, MP3, OGG, WAV, MP4, PDF. Maximum 20 MB per file and 1,000 contributions per machine. File extensions are restricted; contents are **not scanned**. Share with people you trust. Downloads are attachments and are never executed or rendered inline.

Uploads stream to temporary files, then commit to local storage. Peer catalog and download routes require the shared token. Draws use Node's cryptographic random selection. Connected mode excludes this instance's own catalog. Standalone local test mode draws from your own contributions so you can verify the complete upload-to-download flow. Download tickets expire after five minutes; a restart clears them. Collection history lives in the browser session; local activity lives in server memory. Contributions persist in `DATA_DIR` until removed.

## Verify

```sh
npm test
```

Integration tests use isolated temporary data and loopback servers to cover upload/removal, authentication, real peer streaming, exclusion of own files, offline peers, unknown download tickets, and input limits. They do not require Tailscale.
