/**
 * Spec-local helpers for the custom-visualizations port
 * (e2e/test/scenarios/visualizations-charts/custom-viz.cy.spec.ts).
 *
 * Ports of:
 * - e2e/support/helpers/e2e-custom-viz-helpers.ts (fixture paths, identifiers,
 *   navigation, dropCustomVizBundle, getAddVisualizationLink, the intercept
 *   helpers, getCustomVizFixtureHash)
 * - e2e/support/helpers/api/customVizPlugin.ts (addCustomVizPlugin)
 * - e2e/support/helpers/api/updateAdvancedPermissionsGraph.ts
 * - the spec-local drillThroughDemoVizClick / buildDocumentWithCustomVizCard
 * - the sandbox describe's console-spy + bundle-injection + canary machinery
 *
 * Notable adaptations:
 * - addCustomVizPlugin uploads the .tgz via `page.request` (multipart) rather
 *   than a decoded ArrayBuffer round-trip — page.request shares the browser
 *   context's session cookie, so it runs authenticated as the current user.
 * - getCustomVizFixtureHash computes the SHA-256 in-process (node:crypto)
 *   instead of shelling out to `shasum`.
 * - Snowplow helpers are no-op stubs (PORTING rule 6) — the spike harness has
 *   no snowplow-micro; only the fidelity cross-check needs it.
 * - Console assertions read from a collector wired to `page.on("console")`;
 *   Error args are resolved to their `.message` in the page realm so the
 *   membrane's thrown errors are matchable (Playwright's msg.text() can render
 *   a bare Error object as "JSHandle@error").
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { main } from "./ui";

// === constants (mirrors of cypress_data.js + the spec's module scope) ========

/** SAMPLE_DB_TABLES.STATIC_ORDERS_ID (e2e/support/cypress_data.js). */
export const STATIC_ORDERS_ID = 5;

/** USER_GROUPS.ALL_USERS_GROUP (e2e/support/cypress_data.js). */
export const ALL_USERS_GROUP = 1;

export const AGGREGATED_VALUE = "18760";
export const AGGREGATED_VALUE_FORMATTED = "18,760";

/** "Main app" / "Admin" nav labels (e2e-ui-elements-helpers.js). */
export const mainAppLinkText = "Main app";
export const adminAppLinkText = "Admin";

// === fixture paths + identifiers (e2e-custom-viz-helpers.ts) ==================

const ASSET_DIR = path.resolve(__dirname, "../../e2e/support/assets");

export const CUSTOM_VIZ_FIXTURE_TGZ = path.join(
  ASSET_DIR,
  "example_custom_viz_plugin.tgz",
);
export const CUSTOM_VIZ_FIXTURE_TGZ_2 = path.join(
  ASSET_DIR,
  "example_custom_viz_plugin_2.tgz",
);
export const CUSTOM_VIZ_FIXTURE_TGZ_3_SECURITY = path.join(
  ASSET_DIR,
  "example_custom_viz_plugin_3_security.tgz",
);
export const CUSTOM_VIZ_FIXTURE_TGZ_4_SECURITY_COMPONENT = path.join(
  ASSET_DIR,
  "example_custom_viz_plugin_4_security_component.tgz",
);

export const CUSTOM_VIZ_IDENTIFIER = "demo-viz";
export const CUSTOM_VIZ_IDENTIFIER_2 = "demo-viz-2";
export const CUSTOM_VIZ_IDENTIFIER_3_SECURITY = "demo-viz-security";
export const CUSTOM_VIZ_IDENTIFIER_4_SECURITY_COMPONENT =
  "demo-viz-security-component";

/** Frontend display type: "custom:{identifier}". */
export const CUSTOM_VIZ_DISPLAY = `custom:${CUSTOM_VIZ_IDENTIFIER}` as const;

export type CustomVizPlugin = { id: number } & Record<string, unknown>;

// === snowplow (no-op stubs, PORTING rule 6) ==================================

export const resetSnowplow = async () => {};
export const enableTracking = async () => {};
export const expectNoBadSnowplowEvents = async () => {};
export const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};

// === plugin management (api/customVizPlugin.ts) ==============================

/**
 * Port of H.addCustomVizPlugin: upload a packaged .tgz bundle and register it
 * as a plugin. Uses `page.request` (multipart) so the session cookie set on the
 * browser context authenticates the POST.
 */
export async function addCustomVizPlugin(
  page: Page,
  tgzPath: string,
): Promise<CustomVizPlugin> {
  const buffer = readFileSync(tgzPath);
  const response = await page.request.post("/api/ee/custom-viz-plugin", {
    multipart: {
      file: {
        name: "plugin.tgz",
        mimeType: "application/gzip",
        buffer,
      },
    },
    failOnStatusCode: false,
  });
  if (response.status() !== 200) {
    throw new Error(
      `addCustomVizPlugin upload failed (${response.status()}): ${await response.text()}`,
    );
  }
  return (await response.json()) as CustomVizPlugin;
}

/**
 * Port of H.getCustomVizFixtureHash: the SHA-256 of a .tgz on disk. The chip
 * shows the first 8 chars; callers slice.
 */
export function getCustomVizFixtureHash(tgzPath: string): string {
  return createHash("sha256").update(readFileSync(tgzPath)).digest("hex");
}

// === navigation (e2e-custom-viz-helpers.ts) ==================================

export async function visitCustomVizSettings(page: Page) {
  await page.goto("/admin/settings/custom-visualizations");
}

export async function visitCustomVizNewForm(page: Page) {
  await page.goto("/admin/settings/custom-visualizations/new");
}

export async function visitCustomVizDevelopment(page: Page) {
  await page.goto("/admin/settings/custom-visualizations/development");
}

export async function visitCustomVizEditForm(page: Page, id: number) {
  await page.goto(`/admin/settings/custom-visualizations/edit/${id}`);
}

// === UI helpers ==============================================================

/** Port of H.getAddVisualizationLink. */
export function getAddVisualizationLink(page: Page): Locator {
  return page.getByRole("link", { name: /Add$/ });
}

/** Port of H.getCustomVizPluginIcon: EntityIcon renders as role="img". */
export function getCustomVizPluginIcon(page: Page, displayName: string): Locator {
  return main(page).getByRole("img", { name: displayName });
}

/** Port of H.vizTypeSidebar (e2e-viz-settings-helpers.js). */
export function vizTypeSidebar(page: Page): Locator {
  return page.getByTestId("chart-type-sidebar");
}

/**
 * Port of H.dropCustomVizBundle: drive the hidden file input. Accepts a path
 * string, or an inline buffer descriptor for the invalid-bundle test.
 */
export async function dropCustomVizBundle(
  page: Page,
  file:
    | string
    | { contents: Buffer; fileName: string; mimeType: string },
) {
  const input = page.locator('input[type="file"]');
  if (typeof file === "string") {
    await input.setInputFiles(file);
  } else {
    await input.setInputFiles({
      name: file.fileName,
      mimeType: file.mimeType,
      buffer: file.contents,
    });
  }
}

// === response waits (ports of the intercept + cy.wait aliases) ===============

const BUNDLE_RE = /\/api\/ee\/custom-viz-plugin\/[^/]+\/bundle/;

/** GET /api/ee/custom-viz-plugin/:id/bundle — the "@pluginBundle" alias. */
export function waitForPluginBundle(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      BUNDLE_RE.test(new URL(response.url()).pathname),
  );
}

/** POST /api/ee/custom-viz-plugin — the "@pluginCreate" alias. */
export function waitForPluginCreate(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/ee/custom-viz-plugin",
  );
}

/** PUT /api/ee/custom-viz-plugin/:id/bundle — the bundle-replace aliases. */
export function waitForPluginBundleReplace(
  page: Page,
  pluginId: number,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname ===
        `/api/ee/custom-viz-plugin/${pluginId}/bundle`,
  );
}

// === drill-through (the spec's drillThroughDemoVizClick) =====================

export async function drillThroughDemoVizClick(page: Page) {
  await page.getByTestId("demo-viz-click-target").click();
  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await page
    .getByTestId("click-actions-view")
    .getByText(/See these Orders/)
    .click();
  await dataset;
}

// === document fixture (the spec's buildDocumentWithCustomVizCard) ============

export function buildDocumentWithCustomVizCard(cardId: number) {
  return {
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        attrs: { _id: "1" },
        content: [{ type: "text", text: "Custom viz embedded below:" }],
      },
      {
        type: "resizeNode",
        attrs: { height: 400, minHeight: 280 },
        content: [
          {
            type: "cardEmbed",
            attrs: { id: cardId, name: null, _id: "2" },
          },
        ],
      },
      { type: "paragraph", attrs: { _id: "3" } },
    ],
  };
}

// === advanced permissions (api/updateAdvancedPermissionsGraph.ts) ============

export async function updateAdvancedPermissionsGraph(
  api: MetabaseApi,
  groupsPermissionsObject: Record<number, Record<string, string>>,
) {
  const graph = await (
    await api.get("/api/ee/advanced-permissions/application/graph")
  ).json();
  const updatedGroups: Record<number, Record<string, string>> = {
    ...graph.groups,
  };
  for (const [groupId, permissions] of Object.entries(
    groupsPermissionsObject,
  )) {
    updatedGroups[Number(groupId)] = {
      ...updatedGroups[Number(groupId)],
      ...permissions,
    };
  }
  await api.put("/api/ee/advanced-permissions/application/graph", {
    groups: updatedGroups,
    revision: graph.revision,
  });
}

// === sandbox: bundle injection ==============================================

/**
 * Register a route that rewrites the plugin bundle response body via
 * `transform`, mirroring the Cypress `cy.intercept(..., (req) => req.continue(
 * (res) => { res.body = ... }))`. Returns a promise that resolves the first
 * time the (transformed) bundle is served — the port of `cy.wait("@injectedBundle")`.
 */
export function interceptInjectedBundle(
  page: Page,
  transform: (body: string) => string,
): Promise<void> {
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  page.route(BUNDLE_RE, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: transform(body) });
    resolveDone();
  });
  return done;
}

/**
 * Register a route that fails the bundle with the given status/body (the
 * failing-bundle / bundle-unavailable tests). Returns a promise that resolves
 * when the failed response is served.
 */
export function interceptFailingBundle(
  page: Page,
  { status, body }: { status: number; body: string },
): Promise<void> {
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  page.route(BUNDLE_RE, async (route) => {
    await route.fulfill({ status, body, contentType: "text/plain" });
    resolveDone();
  });
  return done;
}

// === sandbox: console collector =============================================

export type ConsoleEntry = { type: string; text: string };

/**
 * Wire a collector to `page.on("console")`. Each message's args are resolved in
 * the page realm (Error → `.message`, primitives verbatim) and joined into a
 * single text, so both the `calledWith(label, value)` and the
 * `calledWithMatch(sinon.match.has("message", ...))` upstream assertions can be
 * checked against `entries`. Resolution is async but the assertion helpers poll,
 * so eventual consistency is fine.
 */
export function collectConsole(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  page.on("console", (msg) => {
    const type = msg.type();
    const fallback = msg.text();
    Promise.all(
      msg.args().map((arg) =>
        arg
          .evaluate((value) => {
            if (value instanceof Error) {
              return value.message;
            }
            if (typeof value === "object" && value !== null) {
              try {
                return JSON.stringify(value);
              } catch {
                return String(value);
              }
            }
            return String(value);
          })
          .catch(() => undefined),
      ),
    )
      .then((values) => {
        const resolved = values.filter((value) => value !== undefined);
        entries.push({
          type,
          text: resolved.length ? resolved.join(" ") : fallback,
        });
      })
      .catch(() => {
        entries.push({ type, text: fallback });
      });
  });
  return entries;
}

/** Port of `should("have.been.calledWithMatch", sinon.match.has("message", regex))`. */
export async function expectConsoleErrorMatch(
  entries: ConsoleEntry[],
  pattern: RegExp,
  label = pattern.source,
) {
  await expect
    .poll(
      () => entries.some((e) => e.type === "error" && pattern.test(e.text)),
      { message: `console.error matching ${label}`, timeout: 20_000 },
    )
    .toBe(true);
}

/** Like the above but matches any console channel (some membrane logs use warn). */
export async function expectConsoleMatch(
  entries: ConsoleEntry[],
  pattern: RegExp,
  label = pattern.source,
) {
  await expect
    .poll(() => entries.some((e) => pattern.test(e.text)), {
      message: `console message matching ${label}`,
      timeout: 20_000,
    })
    .toBe(true);
}

/** Port of `should("have.been.calledWith", ...args)` — exact joined text. */
export async function expectConsoleCalledWith(
  entries: ConsoleEntry[],
  ...args: (string | number | boolean)[]
) {
  const expected = args.map(String).join(" ");
  await expect
    .poll(() => entries.some((e) => e.text === expected), {
      message: `console called with "${expected}"`,
      timeout: 20_000,
    })
    .toBe(true);
}

// === sandbox: canary request counter ========================================

const CANARY_PATH = "/api/canary-should-be-blocked-by-sandbox";

/**
 * Count requests to the sandbox canary URL. Port of
 * `cy.intercept(...).as("canary")` + `cy.get("@canary.all").should("have.length", 0)`.
 * Returns a getter for the running count.
 */
export function countCanaryRequests(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === CANARY_PATH) {
      count += 1;
    }
  });
  return () => count;
}
