# Installing the Metabase MCP Server

This guide is written for AI coding agents (Claude Code, Cursor, Windsurf, etc.) helping a user connect their MCP
client to the **Metabase MCP server**. The server is built into every Metabase instance and is served at
`/api/metabase-mcp` on the instance itself — there is nothing to download, install locally, or run as a separate process.

## Step 1 — Ask the user for their Metabase instance URL

The MCP server lives inside the user's Metabase instance, so before you can configure anything you **must** ask the
user for the base URL of their Metabase instance.

Examples of what to ask for:

- A Metabase Cloud URL, e.g. `https://acme.metabaseapp.com`
- A self-hosted URL, e.g. `https://metabase.acme.internal` or `https://bi.example.com`
- For local development, e.g. `http://localhost:3000`

Do **not** guess or assume the URL. If the user has not told you what their Metabase instance URL is, ask them
explicitly before continuing. The MCP server endpoint is always the instance URL followed by `/api/metabase-mcp`:

```
{METABASE_URL}/api/metabase-mcp
```

For the rest of this guide, replace `{METABASE_URL}` with whatever the user provides (with no trailing slash).

## Step 2 — Confirm the instance has the MCP server enabled

The MCP server ships with Metabase but requires a reasonably recent version. If the user reports errors connecting,
ask them to confirm:

1. They are on a Metabase version that includes the MCP server (recent stable release).
2. They can reach `{METABASE_URL}/api/metabase-mcp` from the machine running the MCP client (no VPN/firewall blocking it).
3. They have a Metabase account on that instance that they can log in with.

Authentication happens via **OAuth 2.0** against Metabase itself — there is no API key, no token to paste, and no
external identity provider to configure. The MCP client will open a browser window during first connection and the
user will log in to Metabase and approve the connection there.

## Step 3 — Configure the MCP client

Most MCP clients accept a JSON configuration block. Use the following, substituting `{METABASE_URL}`:

```json
{
  "mcpServers": {
    "metabase": {
      "type": "http",
      "url": "{METABASE_URL}/api/metabase-mcp"
    }
  }
}
```

Some clients use `"transport"` instead of `"type"`, and some expect the value `"streamable-http"` rather than
`"http"`. The transport is **Streamable HTTP** in all cases — pick whichever key/value pair the target client
documents.

### Client-specific commands

**Claude Code** (CLI):

```sh
claude mcp add metabase {METABASE_URL}/api/metabase-mcp --transport streamable-http
```

**Claude Desktop**: create a [custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
pointing at `{METABASE_URL}/api/metabase-mcp`.

**Cursor**: open **Settings → MCP**, add a new server, set the type to `streamable-http`, and use
`{METABASE_URL}/api/metabase-mcp` as the URL.

**VS Code** (GitHub Copilot Chat / agent mode): add the server to `.vscode/mcp.json` in the workspace, or to the
user-level `mcp.json`. VS Code uses a `servers` top-level key (not `mcpServers`):

```json
{
  "servers": {
    "metabase": {
      "type": "http",
      "url": "{METABASE_URL}/api/metabase-mcp"
    }
  }
}
```

You can also run **MCP: Add Server** from the command palette and pick **HTTP**, then paste
`{METABASE_URL}/api/metabase-mcp` as the URL.

**Cline** (VS Code extension): Cline uses its own camelCase value for the transport type. Edit Cline's MCP settings
file and add:

```json
{
  "mcpServers": {
    "metabase": {
      "type": "streamableHttp",
      "url": "{METABASE_URL}/api/metabase-mcp"
    }
  }
}
```

Note: the value is `streamableHttp` (camelCase) — `http` or `streamable-http` will not work in Cline.

**Other clients**: if your client is not listed above, consult its MCP documentation and translate the JSON block
above into the format it expects (`json`, `yaml`, TOML, etc.). The two things that always need to be set are the
transport (`streamable-http` / `http`) and the URL (`{METABASE_URL}/api/metabase-mcp`).

## Step 4 — Complete the OAuth login

The first time the client connects, it will:

1. Discover Metabase's OAuth endpoints at `{METABASE_URL}/.well-known/oauth-protected-resource/api/metabase-mcp`.
2. Register itself with Metabase as an OAuth client.
3. Open a browser tab where the user logs in to Metabase and approves the connection.
4. Receive an access token scoped to the user's Metabase permissions.

If the browser does not open automatically, the client will print a URL — instruct the user to open it manually and
complete the login there. All tools and data the MCP server exposes are scoped to that user's permissions in
Metabase, so the user should log in with the account whose access they want the agent to have.

## Step 5 — Verify the connection

Once configured, the client should be able to list MCP tools provided by Metabase. The tools include `search`,
`get_table`, `get_metric`, `construct_query`, `execute_query`, and `query`. If those appear in the client's tool
list, the connection is working.

If the tool list is empty or the client reports an authentication error, re-check that:

- The URL is exactly `{METABASE_URL}/api/metabase-mcp` with no trailing slash and no extra path segments.
- The user successfully completed the OAuth login in the browser.
- The Metabase instance is reachable from the machine running the client.
