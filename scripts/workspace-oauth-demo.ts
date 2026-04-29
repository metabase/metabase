#!/usr/bin/env npx tsx
/**
 * Workspace OAuth Demo — Authorization Code + PKCE
 *
 * Demonstrates the proper OAuth flow for CLI tools:
 * 1. Register an OAuth client dynamically
 * 2. Start a local callback server
 * 3. Open the browser for user authorization
 * 4. Exchange the authorization code for tokens
 * 5. Use the tokens to hit workspace external endpoints
 *
 * Usage:
 *   npx tsx scripts/workspace-oauth-demo.ts [--base-url http://localhost:3000]
 */

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { exec } from "node:child_process";

const BASE_URL =
  process.argv.find((_, i, a) => a[i - 1] === "--base-url") ??
  "http://localhost:3000";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function api(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    session?: string;
    bearer?: string;
    form?: URLSearchParams;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.session) headers["X-Metabase-Session"] = opts.session;
  if (opts.bearer) headers["Authorization"] = `Bearer ${opts.bearer}`;

  let bodyStr: string | undefined;
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    bodyStr = opts.form.toString();
  } else if (opts.body) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: bodyStr,
    redirect: "manual", // Don't follow redirects — we need the Location header
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: res.status,
    data,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

function log(msg: string) {
  console.log(`\n── ${msg} ${"─".repeat(Math.max(0, 60 - msg.length))}`);
}

// PKCE helpers
function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// Start a temporary local HTTP server to receive the OAuth callback
function startCallbackServer(): Promise<{
  port: number;
  waitForCode: () => Promise<string>;
  close: () => void;
}> {
  return new Promise((resolve) => {
    let codeResolve: (code: string) => void;
    const codePromise = new Promise<string>((r) => {
      codeResolve = r;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<h2>Authorization Failed</h2><p>Error: ${error}</p><p>You can close this tab.</p>`,
        );
        codeResolve("");
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<h2>Authorization Successful!</h2><p>You can close this tab and return to the terminal.</p>`,
        );
        codeResolve(code);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr!.port : 0;
      resolve({
        port,
        waitForCode: () => codePromise,
        close: () => server.close(),
      });
    });
  });
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} '${url}'`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Workspace OAuth Demo (PKCE Flow) — ${BASE_URL}\n`);

  // Step 1: Start local callback server
  log("Step 1: Start local callback server");
  const callback = await startCallbackServer();
  const redirectUri = `http://127.0.0.1:${callback.port}/callback`;
  console.log(`  ✓ Listening on ${redirectUri}`);

  // Step 2: Dynamically register an OAuth client
  log("Step 2: Register OAuth client (RFC 7591)");
  const { status: regStatus, data: regData } = await api("/oauth/register", {
    method: "POST",
    body: {
      client_name: "workspace-cli-demo",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "native",
      scope:
        "workspace:config:read workspace:metadata:read",
    },
  });

  if (regStatus !== 201) {
    console.error(`  ✗ Registration failed (${regStatus}):`, regData);
    callback.close();
    process.exit(1);
  }

  const client = regData as {
    client_id: string;
    client_secret?: string;
    scope: string;
    token_endpoint_auth_method: string;
  };
  console.log(`  ✓ Client ID:     ${client.client_id.slice(0, 8)}...`);
  console.log(`  ✓ Auth method:   ${client.token_endpoint_auth_method} (public client, PKCE is the proof)`);
  console.log(`  ✓ Scopes:        ${client.scope}`);

  // Step 3: Build authorization URL with PKCE
  log("Step 3: Open browser for authorization (PKCE)");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "workspace:config:read workspace:metadata:read");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  console.log(`  Opening browser...`);
  console.log(`  Auth URL: ${authUrl.toString().slice(0, 80)}...`);
  console.log(
    `\n  👉 Log in to Metabase and click "Allow" in the consent screen.\n`,
  );
  openBrowser(authUrl.toString());

  // Step 4: Wait for the callback
  log("Step 4: Waiting for authorization callback...");
  const code = await callback.waitForCode();
  callback.close();

  if (!code) {
    console.error("  ✗ Authorization was denied or failed.");
    process.exit(1);
  }
  console.log(`  ✓ Authorization code received: ${code.slice(0, 20)}...`);

  // Step 5: Exchange code for tokens
  log("Step 5: Exchange code for tokens (POST /oauth/token)");
  const tokenParams = new URLSearchParams();
  tokenParams.set("grant_type", "authorization_code");
  tokenParams.set("code", code);
  tokenParams.set("redirect_uri", redirectUri);
  tokenParams.set("client_id", client.client_id);
  if (client.client_secret) {
    tokenParams.set("client_secret", client.client_secret);
  }
  tokenParams.set("code_verifier", codeVerifier);

  const { status: tokenStatus, data: tokenData } = await api("/oauth/token", {
    method: "POST",
    form: tokenParams,
  });

  if (tokenStatus !== 200) {
    console.error(`  ✗ Token exchange failed (${tokenStatus}):`, tokenData);
    process.exit(1);
  }

  const tokens = tokenData as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  };
  console.log(`  ✓ Access token:  ${tokens.access_token.slice(0, 20)}...`);
  console.log(`  ✓ Refresh token: ${tokens.refresh_token?.slice(0, 20)}...`);
  console.log(`  ✓ Token type:    ${tokens.token_type}`);
  console.log(`  ✓ Expires in:    ${tokens.expires_in}s`);
  console.log(`  ✓ Scopes:        ${tokens.scope}`);

  // Step 6: Use the token — hit external workspace endpoints
  log("Step 6: Use bearer token to access workspace endpoints");

  // Ping
  console.log("\n  6a. GET /api/ee/workspace-ext/ping");
  const { status: pingStatus, data: pingData } = await api(
    "/api/ee/workspace-ext/ping",
    { bearer: tokens.access_token },
  );
  console.log(`      Status: ${pingStatus}`);
  console.log(`      Response: ${JSON.stringify(pingData, null, 6)}`);

  // No token (should fail)
  console.log("\n  6b. GET /api/ee/workspace-ext/ping (no token — should 401)");
  const { status: noAuthStatus, data: noAuthData } = await api(
    "/api/ee/workspace-ext/ping",
  );
  console.log(`      Status: ${noAuthStatus}`);
  console.log(`      Response: ${JSON.stringify(noAuthData)}`);

  console.log("\n✅ Demo complete!\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
