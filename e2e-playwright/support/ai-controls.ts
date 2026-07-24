/**
 * Helpers for the AI-controls port
 * (e2e/test/scenarios/metabot/ai-controls.cy.spec.ts).
 *
 * Two kinds of "LLM stub" appear in the source spec, and they are NOT
 * interchangeable:
 *
 * 1. `mockMetabotResponse` (support/metabot.ts) fulfils
 *    POST /api/metabot/agent-streaming at the BROWSER, so the backend never
 *    runs. That is right for tests that only exercise the FE's rendering of a
 *    stream, but it BYPASSES the backend quota logic these tests are about.
 * 2. The Cypress spec starts a Node HTTP server that impersonates the Anthropic
 *    Messages API (`cy.task("startMockLlmServer")`) and points
 *    `llm-anthropic-api-base-url` at it, so requests flow through the REAL
 *    backend — quota checks included — and only the final provider call is
 *    stubbed. The quota-exceeded path short-circuits in
 *    `metabase.metabot.self/call-llm` and streams the quota-reached message
 *    WITHOUT ever calling the provider; the under-limit path calls the mock
 *    server and streams its canned text.
 *
 * These tests are ABOUT the backend quota behaviour, so faithfulness requires
 * mechanism (2), not (1) — a browser-level stub would make every quota
 * assertion vacuous. This module ports the mock LLM server on an EPHEMERAL port
 * (so it can never collide with a sibling worker/shard) and wires the two
 * per-user sign-in / xray helpers the spec needs.
 */
import http from "node:http";

import { expect, request as playwrightRequest } from "@playwright/test";
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";

// A tiny valid PNG (1×1 transparent pixel), used for the icon-upload tests.
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

export const MOCK_LLM_RESPONSE = "Hello from mock LLM!";
export const DEFAULT_QUOTA_MESSAGE =
  "You have reached your AI usage limit for this period. Please try again later, Batman.";

/** Port of ALL_USERS_GROUP / ADMIN_GROUP (e2e/support/cypress_data.js). */
export const ALL_USERS_GROUP_ID = 1;
export const ADMIN_GROUP_ID = 2;

/** Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
export const NORMAL_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    ({ email }) => email === "normal@metabase.test",
  );
  if (!user) {
    throw new Error("normal user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

// ---------------------------------------------------------------------------
// Mock Anthropic Messages API (port of e2e/support/helpers/e2e-mock-llm-tasks.ts)
// ---------------------------------------------------------------------------

/**
 * Build a raw Anthropic SSE response that streams `text` as a single
 * content_block_delta then closes the message cleanly — the format the backend
 * parses (https://docs.anthropic.com/en/api/messages-streaming).
 */
function buildAnthropicSSE(text: string): string {
  const lines = [
    "event: message_start",
    `data: ${JSON.stringify({ type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", content: [], model: "claude-haiku-4-5", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}`,
    "",
    "event: content_block_start",
    `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}`,
    "",
    "event: content_block_delta",
    `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}`,
    "",
    "event: content_block_stop",
    `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
    "",
    "event: message_delta",
    `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } })}`,
    "",
    "event: message_stop",
    `data: ${JSON.stringify({ type: "message_stop" })}`,
    "",
  ];
  return lines.join("\n");
}

export type MockLlmServer = { url: string; stop: () => Promise<void> };

/**
 * Start a mock server impersonating the Anthropic Messages API on an ephemeral
 * port. Every POST responds with the same canned SSE stream of `responseText`.
 * Returns the base URL to feed to `llm-anthropic-api-base-url` and a `stop()`.
 *
 * The backend (same host) reaches it over localhost. An ephemeral port (listen
 * on 0) is used deliberately: with per-worker backends the fixed Cypress port
 * (6123) would collide across concurrent slots.
 */
export function startMockLlmServer(
  responseText = MOCK_LLM_RESPONSE,
): Promise<MockLlmServer> {
  const body = buildAnthropicSSE(responseText);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.end(body);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://localhost:${port}`,
        stop: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

/**
 * Point the backend at the mock server (mirrors `llmMockServerSetup`). Setting
 * the api key is also what flips `ai-features-enabled?` / `metabot-enabled?`
 * true, which the chat UI needs even on the quota-exceeded path (where the
 * provider is never actually called).
 */
export async function configureMockLlm(api: MetabaseApi, baseUrl: string) {
  await api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
  await api.updateSetting("llm-anthropic-api-base-url", baseUrl);
}

// ---------------------------------------------------------------------------
// Navigation / auth
// ---------------------------------------------------------------------------

/** Register the xray-candidates wait, navigate home, await it (PORTING rule 2). */
export async function visitHomeAndWaitForXray(page: Page) {
  const xray = page.waitForResponse((response) =>
    /^\/api\/automagic-dashboards\/database\/[^/]+\/candidates$/.test(
      new URL(response.url()).pathname,
    ),
  );
  await page.goto("/");
  await xray;
}

/**
 * Sign in as an arbitrary user (not one of the cached USERS) by POSTing
 * /api/session through a THROWAWAY request context and installing the resulting
 * session cookies on the browser context — the Playwright equivalent of the
 * spec's `cy.request("POST", "/api/session")`.
 *
 * The POST deliberately does NOT go through `mb.api`'s shared request context:
 * its Set-Cookie would land in that jar, and Metabase's `wrap-session-key`
 * resolves the cookie BEFORE the X-Metabase-Session header — so every later
 * `mb.api` call would silently run as this user, and `mb.signInAsAdmin()`
 * (header only) could not undo it (FINDINGS #139/#148 — the leak that made
 * sandboxing baselines pass while measuring nothing). The throwaway context is
 * disposed in a `finally`, so ONLY the browser session is switched; `mb.api`
 * keeps whatever session it had. Same shape as `signInWithCredentials`
 * (support/sandboxing-via-api.ts).
 *
 * No API client for the new user is returned: today's callers do only browser
 * work as the tenant user. If a caller ever needs API calls AS this user, have
 * it return `new MetabaseApi(api.requestContext, () => id)` like
 * `signInWithCredentials` — don't add it speculatively.
 */
export async function signInViaCookie(
  page: Page,
  baseUrl: string,
  username: string,
  password: string,
) {
  const throwaway = await playwrightRequest.newContext({ baseURL: baseUrl });
  let id: string;
  try {
    const response = await throwaway.post("/api/session", {
      data: { username, password },
    });
    expect(
      response.ok(),
      `POST /api/session for ${username} -> ${response.status()}`,
    ).toBeTruthy();
    id = ((await response.json()) as { id: string }).id;
  } finally {
    await throwaway.dispose();
  }
  const { hostname } = new URL(baseUrl);
  const cookie = { domain: hostname, path: "/" };
  await page.context().addCookies([
    { name: "metabase.SESSION", value: id, httpOnly: true, ...cookie },
    { name: "metabase.TIMEOUT", value: "alive", ...cookie },
    { name: "metabase.DEVICE", value: "my-device-id", httpOnly: true, ...cookie },
  ]);
}

/**
 * Port of H.typeAndBlurUsingLabel for the admin settings text inputs: `fill`
 * clears then sets the value in one input event (marks the controlled form
 * dirty → debounced save), and blur commits it.
 */
export async function typeAndBlur(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.click();
  await field.fill(value);
  await field.blur();
}
