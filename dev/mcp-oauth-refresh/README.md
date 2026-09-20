# Reproduce MCP background refresh token loss

This fixture reproduces a Codex OAuth credential-persistence failure with a local MCP server that rotates refresh tokens and closes its background event stream. Metabase's `oauth-server-rotate-refresh-tokens` setting now allows administrators to disable rotation for affected clients. See [configuration and security tradeoffs](../../docs/ai/mcp.md#repeated-authorization-after-reconnecting).

## Run the reproduction

Use Python 3.9 or later and a Codex backend executable. The verified backend is `codex-cli 0.155.0-alpha.9.2`. The app-server API, credential-file format, and experimental feature are version-specific; an unsupported version may fail the harness rather than reproduce the defect.

Run these commands from the repository root, replacing `/path/to/codex` with the executable to test:

```sh
python3 dev/mcp-oauth-refresh/reproduce.py --codex /path/to/codex
python3 dev/mcp-oauth-refresh/reproduce.py --codex /path/to/codex --coordinated
python3 dev/mcp-oauth-refresh/reproduce.py --codex /path/to/codex --reuse-refresh-token
python3 dev/mcp-oauth-refresh/reproduce.py --codex /path/to/codex --no-background-stream
```

Each run takes about 47 seconds. The fixture binds an ephemeral loopback port, starts the supplied backend with an isolated `CODEX_HOME`, and seeds disposable credentials in its file store. It uses a local dummy model provider and submits no model turns. The backend may still perform its own startup requests. No Cloud account or production OAuth grant is needed, and the real Codex configuration is not modified.

The first output line identifies the temporary artifact directory. It retains `events.json`, `backend.log`, and the isolated backend state for inspection; remove that directory when it is no longer needed. Backend startup caches can make this directory substantially larger than the logs.

Exit status zero means the selected case matched its expected outcome. In the default case, the expected outcome is the reproduced authentication failure. Assertions remain enabled when using the commands above.

## Compare the four cases

All four cases were verified with the backend version above:

| Case                     | Background reconnect | Refresh token rotates | Tool call after expiry | Fresh client                   |
| ------------------------ | -------------------- | --------------------- | ---------------------- | ------------------------------ |
| Default                  | Yes                  | Yes                   | Reconnect required     | Not tested after known failure |
| `--coordinated`          | Yes                  | Yes                   | Succeeds               | Succeeds                       |
| `--reuse-refresh-token`  | Yes                  | No                    | Succeeds               | Succeeds                       |
| `--no-background-stream` | No                   | Yes                   | Succeeds               | Succeeds                       |

The default sequence is:

1. The original access token has a 45-second lifetime.
2. At 20 seconds, the fixture closes the background SSE stream, which sends Metabase-style keepalive comments.
3. At about 21 seconds, Codex reconnects. Its transport exchanges refresh token A for access token B and refresh token B.
4. The durable credential file still contains refresh token A.
5. At 47 seconds, a foreground tool call tries to refresh using A again. The fixture rejects it, and Codex reports `MCP authentication required. Reconnect to continue using this server.`

With coordination enabled, the replacement is persisted before the background stream reopens. With a reusable token, the later refresh still succeeds despite the stale saved credentials. Without a background stream, the foreground refresh persists the replacement through the ordinary Codex path.

These controls demonstrate why the same client can succeed with some server behaviors and fail with others. They do not establish the token policy or transport behavior of any particular third-party connector.

## Follow the client persistence path

In [the tested Codex release](https://github.com/openai/codex/blob/rust-v0.155.0-alpha.9.2/codex-rs/rmcp-client/src/rmcp_client.rs), the default OAuth mode attaches an in-memory credential store to the transport's authorization manager. Codex separately persists credentials around foreground operations. A background reconnect can refresh without passing through that persistence step. The later [refresh transaction](https://github.com/openai/codex/blob/rust-v0.155.0-alpha.9.2/codex-rs/rmcp-client/src/oauth/refresh_transaction.rs) rereads the older durable credentials.

The experimental `mcp_oauth_refresh_coordination` feature attaches a [coordinated durable store](https://github.com/openai/codex/blob/rust-v0.155.0-alpha.9.2/codex-rs/rmcp-client/src/oauth/credential_store.rs) directly to the transport's authorization manager. The fixture's `--coordinated` option enables that feature only in the temporary test configuration.

This proves a client failure mechanism in the fixture. Confirming that a particular Cloud incident follows the identical path requires correlating its token lifecycle. Generic server logs do not identify which refresh token or grant was used. The fixture uses file credentials; it does not test OS-keyring failures, network response loss, or every concurrent-client schedule.

## Trace when Metabase enabled rotation

The OAuth library first added rotation on **March 13, 2026, at 14:38 UTC**, in [oidc-provider commit 7a06ca6](https://github.com/edpaget/oidc-provider/commit/7a06ca650eee72f670c9c663545a49bdf2f66e79). That commit made rotation the default and added the option to turn it off explicitly.

| Event                                   | Date (UTC)            | Evidence                                                                                                           |
| --------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Built-in MCP server merged              | March 25, 2026, 09:04 | [PR #70787](https://github.com/metabase/metabase/pull/70787)                                                       |
| Rotation explicitly set to `true`       | March 25, 2026, 22:04 | [Commit 87dc660 / PR #71406](https://github.com/metabase/metabase/commit/87dc66019155066f0c02fb8a354e22d2b793848b) |
| Rotation present in the first 0.60 beta | March 27, 2026        | [v0.60.0-beta release](https://github.com/metabase/metabase/releases/tag/v0.60.0-beta)                             |
| Rotation present in stable 0.60.1       | April 20, 2026        | [v0.60.1 release](https://github.com/metabase/metabase/releases/tag/v0.60.1)                                       |

The initial MCP commit already used `oidc-provider 0.6.2`. That library [defaults rotation to `true` when the setting is omitted](https://github.com/edpaget/oidc-provider/blob/v0.6.2/src/oidc_provider/core.clj#L93). Consequently, PR #71406 made the configuration explicit; it did not switch rotation on for the first time. Its commit message describes the intent as limiting reuse of a stolen refresh token during its 30-day lifetime. Removing only that explicit configuration line would leave rotation enabled.

## Configure server-side compatibility

In **Admin > AI > MCP > Settings**, keep **Refresh token rotation** enabled and select affected registrations under **Clients allowed to reuse refresh tokens**. These exceptions are stored in `oauth-server-refresh-token-reuse-client-ids`. The token's stored client ID determines the exception; a matching client name or a different ID claimed in the request cannot select a weaker policy for another registration.

Setting `oauth-server-rotate-refresh-tokens` to `false` remains available as an instance-wide fallback. Changes to either setting do not require a restart. Previously revoked tokens remain revoked; an already affected client needs one fresh authorization.

The no-background-stream control retains token rotation and returns HTTP 405 for MCP GET requests. The [MCP transport specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#listening-for-messages-from-the-server) permits this, but clients lose unsolicited notifications such as tool-list changes. A production option would need to account for that behavior and be tested with the real Metabase endpoints.

The `--reuse-refresh-token` fixture omits `refresh_token` from refresh responses, matching the OAuth provider's response when rotation is disabled. It tests the installed Codex backend against this response shape. It is a synthetic server, not a full Metabase instance. The Metabase API tests separately exercise the production provider and database stores with a public PKCE client, checking repeated reuse, fixed expiry, revocation, client binding, and scope restrictions.

Reusable tokens remove rotation's protection against token theft. Both compatibility options depart from [OAuth security guidance for public clients](https://www.rfc-editor.org/rfc/rfc9700#section-2.2.2), which requires rotation or sender binding. Prefer individual exceptions and remove them when no longer required.

## Retain the useful Metabase regression coverage

The strengthened `metabase.oauth-server.api-test/token-refresh-grant-test` verifies that refresh returns a different refresh token, the old token is rejected, and the replacement remains usable. It preserves the existing error-code behavior. The earlier `invalid_request` to `invalid_grant` change and its error-classification tests are excluded because they do not prevent the reproduced token loss.
