/**
 * Static ("guest") embedding helpers — ports of the `H` helpers used by the
 * embedding smoketests: openEmbedJsModal / embedModalEnableEmbedding /
 * embedModalContent (e2e-embedding-iframe-sdk-setup-helpers.ts),
 * openLegacyStaticEmbeddingModal / visitIframe (e2e-embedding-helpers.js),
 * METABASE_SECRET_KEY (cypress_data.js) and H.createQuestion
 * (api/createQuestion.ts).
 *
 * visitStaticEmbedUrl is a GENERALIZED copy of the iframe harness in
 * support/search.ts (visitFullAppEmbeddingUrl) — see its doc comment.
 * TODO(consolidation): merge the two harnesses into one module. The shared
 * core is "serve an app-origin harness page whose iframe points at <url>";
 * search.ts adds the X-Frame-Options/CSP-stripping route (needed for
 * full-app pages) and app-path + query-string building on top.
 */
import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { modal } from "./dashboard";
import { SAMPLE_DB_ID } from "./sample-data";
import { openSharingMenu } from "./sharing";

/** Port of METABASE_SECRET_KEY (e2e/support/cypress_data.js) — the
 * embedding-secret-key baked into the default snapshot. */
export const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// === ports of e2e-embedding-iframe-sdk-setup-helpers.ts ===

export function embedModalContent(page: Page): Locator {
  return page.getByTestId("sdk-iframe-embed-setup-modal-content");
}

export function embedModalEnableEmbeddingCard(page: Page): Locator {
  return page.getByTestId("enable-embedding-card");
}

export function legacyStaticEmbeddingButton(page: Page): Locator {
  return page.getByTestId("legacy-static-embedding-button");
}

const ENABLE_EMBEDDING_BUTTON_NAME =
  /Agree and (continue|enable)|Enable and continue/;

/**
 * Port of H.embedModalEnableEmbedding. Upstream is a cy.get("body") snapshot
 * conditional (a race — the check can run before the section mounts); the
 * spec only calls this directly when embedding is disabled, so the card is
 * always present and this port is unconditional. The conditional variant
 * lives in openLegacyStaticEmbeddingModal as a deterministic locator race.
 */
export async function embedModalEnableEmbedding(page: Page) {
  await expect(embedModalEnableEmbeddingCard(page)).toBeVisible();
  await page
    .getByRole("button", { name: ENABLE_EMBEDDING_BUTTON_NAME })
    .click();
}

/** Port of H.openEmbedJsModal. */
export async function openEmbedJsModal(page: Page) {
  await openSharingMenu(page, "Embed");
}

// === ports of e2e-embedding-helpers.js ===

/**
 * Port of H.openLegacyStaticEmbeddingModal (only the options this spec uses:
 * resource, resourceId, unpublishBeforeOpen — no activeTab/previewMode).
 */
export async function openLegacyStaticEmbeddingModal(
  page: Page,
  api: MetabaseApi,
  {
    resource,
    resourceId,
    activeTab,
    unpublishBeforeOpen = true,
  }: {
    resource: "question" | "dashboard";
    resourceId: number;
    /**
     * Port of the upstream helper's `activeTab`. The preview-mode toggle
     * ("Preview"/"Code") only renders on some tabs, so callers that go on to
     * `visitIframe()` must select the tab the way upstream does.
     */
    activeTab?: "overview" | "parameters" | "lookAndFeel";
    unpublishBeforeOpen?: boolean;
  },
) {
  const apiPath = resource === "question" ? "card" : "dashboard";

  await api.put(`/api/${apiPath}/${resourceId}`, {
    enable_embedding: true,
    embedding_type: "static-legacy",
  });

  await openSharingMenu(page, "Embed");

  await expect(embedModalContent(page)).toBeVisible();

  // Upstream checks a body snapshot for the enable-embedding card; ported as
  // a race between the card (embedding disabled) and the static-embedding
  // button (embedding already enabled).
  const card = embedModalEnableEmbeddingCard(page);
  const staticEmbeddingButton = legacyStaticEmbeddingButton(page);
  // .first(): both can be in the DOM at once (the enable-embedding card
  // shows a "Use static embedding instead" link), which would otherwise
  // trip the or()'s strict-mode check.
  await expect(card.or(staticEmbeddingButton).first()).toBeVisible();
  if (await card.isVisible()) {
    await page
      .getByRole("button", { name: ENABLE_EMBEDDING_BUTTON_NAME })
      .click();
  }
  await staticEmbeddingButton.click();

  await expect(
    modal(page).getByText("Static embedding", { exact: true }),
  ).toBeVisible();

  if (unpublishBeforeOpen) {
    // Port of unpublishChanges: wait for the PUT whose body flips
    // enable_embedding off.
    const unpublished = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === `/api/${apiPath}/${resourceId}` &&
        response.request().postDataJSON()?.enable_embedding === false,
    );
    await modal(page)
      .getByRole("button", { name: "Unpublish", exact: true })
      .click();
    await unpublished;
  }

  if (activeTab) {
    const tabKeyToName = {
      overview: "Overview",
      parameters: "Parameters",
      lookAndFeel: "Look and Feel",
    } as const;
    await modal(page)
      .getByRole("tab", { name: tabKeyToName[activeTab], exact: true })
      .click();
  }
}

/**
 * Port of H.visitIframe: click Preview in the static embedding modal, grab
 * the preview iframe's src, sign out and load that url — like the Cypress
 * original — inside an iframe (Cypress's AUT is architecturally iframed;
 * /embed/* pages render differently when framed: `bordered` defaults on and
 * action buttons hide, see use-embed-frame-options.ts). Returns the
 * FrameLocator plus the embed url for cy.url()-style assertions.
 */
export async function visitIframe(
  page: Page,
  mb: { baseUrl: string; signOut(): Promise<void> },
): Promise<{ frame: FrameLocator; url: string }> {
  await modal(page).getByText("Preview", { exact: true }).click();
  const url = await currentIframeSrc(page, mb.baseUrl);
  await mb.signOut();
  const frame = await visitStaticEmbedUrl(page, { url, baseUrl: mb.baseUrl });
  return { frame, url };
}

/**
 * The src of the page's (first) preview iframe, rebased onto baseUrl: the
 * src is built from the site-url setting, which under per-worker backends
 * doesn't match the worker's port.
 */
export async function currentIframeSrc(
  page: Page,
  baseUrl: string,
): Promise<string> {
  const iframe = page.locator("iframe").first();
  await expect(iframe).toHaveAttribute("src", /\/embed\//);
  const src = await iframe.evaluate(
    (element: HTMLIFrameElement) => element.src,
  );
  const rebased = new URL(src);
  const base = new URL(baseUrl);
  rebased.protocol = base.protocol;
  rebased.host = base.host;
  return rebased.href;
}

const HARNESS_PATH = "/__pw-embed-harness__";

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Load an absolute url (a signed /embed/* or /public/* link) inside a real
 * iframe and return its FrameLocator. Generalized from
 * visitFullAppEmbeddingUrl in support/search.ts: same app-origin harness
 * page (a setContent page is not a secure context, so Chromium would block
 * the iframe's local-network requests) and the same local-network-access
 * grant, but it frames an arbitrary absolute url instead of an app path +
 * query string, and needs NO X-Frame-Options/CSP-stripping route — the
 * backend serves /embed/* and /public/* documents with `allow-iframes?`
 * (frame-ancestors *, no X-Frame-Options; see request/embed? in
 * metabase.server.middleware.security add-security-headers*).
 */
export async function visitStaticEmbedUrl(
  page: Page,
  { url, baseUrl }: { url: string; baseUrl: string },
): Promise<FrameLocator> {
  await page
    .context()
    .grantPermissions(["local-network-access"], { origin: baseUrl });

  const harnessUrl = `${baseUrl}${HARNESS_PATH}`;
  // Re-visits within a test re-register the route; drop the stale handler.
  await page.unroute(harnessUrl);
  await page.route(harnessUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0"><iframe id="embed" name="embed" src="${escapeHtmlAttribute(url)}" style="width:100%;height:100vh;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(harnessUrl);
  return page.frameLocator("#embed");
}

// === port of H.createQuestion (api/createQuestion.ts) ===

/**
 * Port of H.createQuestion for the details the spike's api.createQuestion
 * doesn't accept (dashboard_id, enable_embedding). Like upstream, POST
 * /api/card ignores enable_embedding, so a follow-up PUT applies it.
 * TODO(consolidation): fold into api.createQuestion alongside
 * search.ts#createQuestionWithDescription.
 */
export async function createQuestion(
  api: MetabaseApi,
  details: {
    name: string;
    query: Record<string, unknown>;
    dashboard_id?: number;
    display?: string;
    type?: string;
    enable_embedding?: boolean;
    database?: number;
  },
): Promise<{ id: number }> {
  const {
    name,
    type = "question",
    display = "table",
    database = SAMPLE_DB_ID,
    query,
    enable_embedding = false,
    ...rest
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings: {},
    ...rest,
    dataset_query: { type: "query", query, database },
  });
  const card = (await response.json()) as { id: number };
  if (type === "model" || type === "metric" || enable_embedding) {
    await api.put(`/api/card/${card.id}`, { type, enable_embedding });
  }
  return card;
}
