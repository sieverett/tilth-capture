# tilth-capture

Chrome extension for capturing web content to [tilth](https://github.com/sieverett/tilth) memory via dwell-time detection.

## How it works

The extension tracks how long you spend reading content on a page. When you dwell on a section for longer than the threshold (default 20 seconds), it captures that text and sends it to your tilth ingest gateway.

Three capture modes:
- **Dwell-time** — automatic, based on how long content is visible in your viewport
- **Selection** — right-click highlighted text and choose "Save selection to Tilth"
- **Full page** — right-click and choose "Save page to Tilth", or click the toolbar icon

## Install

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select this directory
5. Click the extension icon and go to Settings

## Configure

| Setting | Default | Purpose |
|---|---|---|
| Gateway URL | `http://localhost:8001` | Your tilth ingest gateway |
| Identity | `browser-capture` | Sent as `x-workload-identity` |
| Namespace | `web` | All captures go to this namespace |
| Dwell threshold | 20 seconds | How long before auto-capture |
| Allowed domains | *(empty = all)* | Restrict to specific sites |

The identity must be in your gateway's write-policy with access to the
namespace.

## Domain allowlist

Leave empty to capture from all sites. Add specific domains to restrict:

```
docs.google.com
github.com
notion.so
salesforce.com
```

Subdomains are matched automatically — `google.com` matches `docs.google.com`.

## What gets captured

Each capture is sent to tilth as:

```
Source: https://example.com/page
Title: Page Title
Captured: 2026-05-01T10:30:00Z (dwell)

[the captured text content]
```

Metadata:
- `namespace`: from settings (default "web")
- `subject_id`: the page's domain
- `env`: "prod"

## Privacy

- All data goes directly to your tilth gateway — no third-party servers
- The extension only runs on domains you've allowed (if allowlist is set)
- Pause anytime via the toolbar popup
- No telemetry, no analytics, no tracking

## License

MIT
