/**
 * Helpers for the embedding-dashboard spec port (static "guest" embedding of
 * dashboards). NEW helpers live here (parallel-agent rule: no edits to shared
 * modules). Ports of:
 *
 * - the fixtures in e2e/test/scenarios/embedding/shared/embedding-dashboard.js
 *   (questionDetails / questionDetailsWithDefaults / dashboardDetails /
 *   mapParameters).
 * - the embedding `H` helpers in e2e-embedding-helpers.js that the
 *   embedding.ts port doesn't cover: visitEmbeddedPage / getEmbeddedPageUrl
 *   (with setFilters / pageStyle / additionalHashOptions / onBeforeLoad),
 *   openLegacyStaticEmbeddingModal's `previewMode`, publishChanges,
 *   getParametersContainer / setEmbeddingParameter / assertEmbeddingParameter,
 *   closeStaticEmbeddingModal, and the iframe-resizer harness (getIframeBody +
 *   the standalone embedding-dashboard.html the resize test loads).
 * - the api helpers whose upstream versions hold fields back from POST:
 *   createDashboard / createQuestion / createNativeQuestion /
 *   createQuestionAndDashboard / createNativeQuestionAndDashboard /
 *   createDashboardWithTabs / addOrUpdateDashboardCard.
 * - the dashboard-editing helpers this spec needs that aren't in dashboard.ts:
 *   getRequiredToggle / toggleRequiredParameter.
 *
 * TODO(consolidation): visitEmbeddedPage overlaps filters-repros.ts's
 * visitEmbeddedDashboard (JWT-signed /embed navigation) and the api helpers
 * duplicate filters-repros.ts / embedding.ts — fold into one embedding module.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect } from "@playwright/test";
import type { FrameLocator, Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { modal } from "./dashboard";
import {
  createDashboard,
  createDashboardWithTabs,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
} from "./factories";
import { icon } from "./dashboard-cards";
import { openLegacyStaticEmbeddingModal as baseOpenLegacyStaticEmbeddingModal } from "./embedding";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { popover } from "./ui";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE as {
  ORDERS: Record<string, number>;
  PEOPLE: Record<string, number>;
};

// From e2e/support/cypress_data.js — the embedding secret key baked into the
// default snapshot.
const METABASE_SECRET_KEY =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const JWT_SIGN_SCRIPT = path.resolve(
  __dirname,
  "../../e2e/support/external/e2e-jwt-sign.js",
);

// === shared/embedding-dashboard.js fixtures ===

export const questionDetails = {
  native: {
    query:
      "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */",
    "template-tags": {
      id: {
        id: "3fce42dd-fac7-c87d-e738-d8b3fc9d6d56",
        name: "id",
        display_name: "Id",
        type: "dimension",
        dimension: ["field", PEOPLE.ID, null],
        "widget-type": "id",
        default: null as unknown,
      },
      name: {
        id: "1fe12d96-8cf7-49e4-05a3-6ed1aea24490",
        name: "name",
        display_name: "Name",
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "category",
        default: null as unknown,
      },
      source: {
        id: "aed3c67a-820a-966b-d07b-ddf54a7f2e5e",
        name: "source",
        display_name: "Source",
        type: "dimension",
        dimension: ["field", PEOPLE.SOURCE, null],
        "widget-type": "category",
        default: null as unknown,
      },
      user_id: {
        id: "cd4bb37d-8404-488e-f66a-6545a261bbe0",
        name: "user_id",
        display_name: "User",
        type: "dimension",
        dimension: ["field", ORDERS.USER_ID, null],
        "widget-type": "id",
        default: null as unknown,
      },
    },
  },
  display: "scalar",
};

export const questionDetailsWithDefaults = (() => {
  const clone = structuredClone(questionDetails);
  const tags = clone.native["template-tags"];
  tags.id.default = [1, 2];
  tags.name.default = ["Lina Heaney"];
  tags.source.default = ["Facebook"];
  return clone;
})();

const idFilter = { name: "Id", slug: "id", id: "1", type: "id" };
const nameFilter = { name: "Name", slug: "name", id: "2", type: "category" };
const sourceFilter = {
  name: "Source",
  slug: "source",
  id: "3",
  type: "category",
};
const userFilter = { name: "User", slug: "user_id", id: "4", type: "id" };
const unusedFilter = {
  name: "Not Used Filter",
  slug: "not_used",
  id: "5",
  type: "category",
};

const parameters = [idFilter, nameFilter, sourceFilter, userFilter, unusedFilter];

const defaultTabId = 1;

const tabs = [
  { id: defaultTabId, name: "Tab 1" },
  { id: 2, name: "Tab 2" },
];

export const dashboardDetails = { tabs, parameters };

function getParameterMappings(card_id: number) {
  return parameters.map(({ id, slug }) => ({
    parameter_id: id,
    card_id,
    target: ["dimension", ["template-tag", slug]],
  }));
}

/** Port of mapParameters (shared/embedding-dashboard.js). */
export async function mapParameters(
  api: MetabaseApi,
  {
    id,
    card_id,
    dashboard_id,
    dashboard_tab_id = defaultTabId,
  }: {
    id: number;
    card_id: number;
    dashboard_id: number;
    dashboard_tab_id?: number;
  },
) {
  await api.put(`/api/dashboard/${dashboard_id}`, {
    tabs,
    dashcards: [
      {
        id,
        dashboard_tab_id,
        card_id,
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 6,
        series: [],
        visualization_settings: {},
        parameter_mappings: getParameterMappings(card_id),
      },
    ],
  });
}

// === api helpers (faithful ports that hold fields back from POST) ===

type DashboardDetails = { name?: string } & Record<string, unknown>;

// createDashboard / createQuestion / createNativeQuestion /
// createQuestionAndDashboard / createNativeQuestionAndDashboard /
// createDashboardWithTabs are now canonical in ./factories; re-exported below so
// this module's consumers keep their imports unchanged.
export {
  createDashboard,
  createDashboardWithTabs,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
};

export type StructuredQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  visualization_settings?: Record<string, unknown>;
  enable_embedding?: boolean;
  query: Record<string, unknown>;
} & Record<string, unknown>;

export type NativeQuestionDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  native: Record<string, unknown>;
} & Record<string, unknown>;

export type DashCard = {
  id: number;
  card_id: number;
  dashboard_id: number;
} & Record<string, unknown>;

/** DEFAULT_CARD from api/updateDashboardCards.ts (shared by addOrUpdate). */
const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 11,
  size_y: 8,
  visualization_settings: {},
  parameter_mappings: [] as unknown[],
};

/** Port of H.addOrUpdateDashboardCard: PUT a single dashcard, return it. */
export async function addOrUpdateDashboardCard(
  api: MetabaseApi,
  {
    card_id,
    dashboard_id,
    card,
  }: {
    card_id: number;
    dashboard_id: number;
    card: Record<string, unknown>;
  },
): Promise<DashCard> {
  const response = await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [{ ...DEFAULT_CARD, card_id, ...card }],
  });
  const body = (await response.json()) as { dashcards: DashCard[] };
  return body.dashcards[0];
}

// === embed-visit helpers ===

type EmbedResource = { dashboard: number } | { question: number };
export type EmbedPayload = { resource: EmbedResource; params: unknown };

type PageStyle = {
  bordered?: boolean;
  titled?: boolean;
  downloads?: boolean;
};

type AdditionalHashOptions = {
  locale?: string;
  font?: string;
  theme?: string;
  hideFilters?: string[];
};

type VisitEmbeddedPageOptions = {
  setFilters?: Record<string, string | number>;
  qs?: Record<string, string | number>;
  pageStyle?: PageStyle;
  additionalHashOptions?: AdditionalHashOptions;
  /**
   * Playwright equivalent of Cypress's onBeforeLoad(window): serialisable
   * functions added via page.addInitScript before navigation. Cypress used
   * this to set window.overrideIsWithinIframe (window.Cypress = undefined is
   * unnecessary here — there is no window.Cypress in Playwright).
   */
  beforeLoad?: (() => void)[];
};

function signEmbedToken(payload: EmbedPayload): string {
  const payloadWithExpiration = {
    ...payload,
    exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
  };
  return execFileSync(
    "node",
    [JWT_SIGN_SCRIPT, JSON.stringify(payloadWithExpiration), METABASE_SECRET_KEY],
    { encoding: "utf8" },
  ).trim();
}

function embeddableObject(payload: EmbedPayload): "dashboard" | "question" {
  return Object.keys(payload.resource)[0] as "dashboard" | "question";
}

/**
 * Port of getEmbeddedPageUrl — builds the signed /embed path plus the hash
 * fragment from pageStyle / locale / font / theme (and hidden filters). Note:
 * the upstream helper only threads locale/font/theme/hideFilters through the
 * hash — `background` (and any other additionalHashOptions key) is silently
 * dropped, so we mirror that exactly.
 */
export function getEmbeddedPageUrl(
  payload: EmbedPayload,
  {
    setFilters = {},
    qs = {},
    pageStyle = {},
    additionalHashOptions: { hideFilters = [], locale, font, theme } = {},
  }: VisitEmbeddedPageOptions = {},
): { path: string; search: string; hash: string } {
  const token = signEmbedToken(payload);
  const object = embeddableObject(payload);

  const search = new URLSearchParams(
    Object.entries({ ...setFilters, ...qs }).map(([key, value]) => [
      key,
      String(value),
    ]),
  ).toString();

  const hashOptions: Record<string, string> = {};
  for (const [key, value] of Object.entries(pageStyle)) {
    if (value !== undefined) {
      hashOptions[key] = String(value);
    }
  }
  if (locale) {
    hashOptions.locale = locale;
  }
  if (font) {
    hashOptions.font = font;
  }
  if (theme) {
    hashOptions.theme = theme;
  }
  if (hideFilters.length > 0) {
    hashOptions.hide_parameters = hideFilters.join(",");
  }
  const hash = new URLSearchParams(hashOptions).toString();

  return { path: `/embed/${object}/${token}`, search, hash };
}

/**
 * Port of H.visitEmbeddedPage: sign the JWT, sign out, and navigate straight
 * to the /embed/* page (top-level, like Cypress's cy.visit within its own AUT
 * iframe). All interactions happen on `page` (not framed), matching
 * filters-repros.ts's visitEmbeddedDashboard.
 */
export async function visitEmbeddedPage(
  page: Page,
  mb: { signOut(): Promise<void> },
  payload: EmbedPayload,
  options: VisitEmbeddedPageOptions = {},
) {
  const { path: embedPath, search, hash } = getEmbeddedPageUrl(payload, options);

  for (const script of options.beforeLoad ?? []) {
    await page.addInitScript(script);
  }

  await mb.signOut();
  await page.goto(
    `${embedPath}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`,
  );
}

const HARNESS_PATH = "/__pw-embed-harness__";

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Port of the standalone e2e/test/scenarios/embedding/embedding-dashboard.html
 * harness used by the resize test (metabase#47061): an app-origin page that
 * loads the parent iframe-resizer script and calls iFrameResize on an iframe
 * pointing at the (absolute) embed url. Served from the app origin (route
 * fulfil) so it's a secure context and the app-origin script + local-network
 * requests are allowed. Returns the FrameLocator for the resized iframe.
 */
export async function visitEmbeddedResizerHarness(
  page: Page,
  { embedUrl, baseUrl }: { embedUrl: string; baseUrl: string },
): Promise<FrameLocator> {
  await page
    .context()
    .grantPermissions(["local-network-access"], { origin: baseUrl });

  const harnessUrl = `${baseUrl}${HARNESS_PATH}`;
  await page.unroute(harnessUrl);
  await page.route(harnessUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0"><script src="${baseUrl}/app/iframeResizer.js"></script><iframe id="iframe" name="iframe" onload="iFrameResize({checkOrigin:false}, this)" src="${escapeHtmlAttribute(
        embedUrl,
      )}" style="width:100%;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(harnessUrl);
  return page.frameLocator("#iframe");
}

/**
 * The (absolute) signed embed url for a payload — for the resize harness,
 * which needs to point an iframe at the full url. Rebased onto baseUrl.
 */
export function embeddedPageAbsoluteUrl(
  payload: EmbedPayload,
  baseUrl: string,
): string {
  const { path: embedPath, search } = getEmbeddedPageUrl(payload);
  return `${baseUrl}${embedPath}${search ? `?${search}` : ""}`;
}

// === static embedding modal helpers ===

/**
 * Port of H.openLegacyStaticEmbeddingModal with `previewMode`. Delegates to
 * the embedding.ts port for the shared open/enable/unpublish/activeTab flow,
 * then clicks the preview-mode toggle (only rendered on some tabs).
 * TODO(consolidation): merge previewMode into embedding.ts's helper.
 */
export async function openLegacyStaticEmbeddingModal(
  page: Page,
  api: MetabaseApi,
  {
    resource,
    resourceId,
    activeTab,
    previewMode,
    unpublishBeforeOpen = true,
  }: {
    resource: "question" | "dashboard";
    resourceId: number;
    activeTab?: "overview" | "parameters" | "lookAndFeel";
    previewMode?: "code" | "preview";
    unpublishBeforeOpen?: boolean;
  },
) {
  await baseOpenLegacyStaticEmbeddingModal(page, api, {
    resource,
    resourceId,
    activeTab,
    unpublishBeforeOpen,
  });

  if (previewMode) {
    const name = previewMode === "preview" ? "Preview" : "Code";
    await modal(page).getByText(name, { exact: true }).click();
  }
}

export function closeStaticEmbeddingModal(page: Page) {
  return icon(modal(page), "close").click();
}

/**
 * Port of H.publishChanges: click Publish and wait for the PUT that carries
 * `embedding_params` (upstream sends two PUTs and picks the one with the
 * params). `assertBody` receives the request body of that PUT.
 */
export async function publishChanges(
  page: Page,
  apiPath: "card" | "dashboard",
  assertBody?: (body: Record<string, unknown>) => void,
) {
  const published = page.waitForResponse((response) => {
    if (response.request().method() !== "PUT") {
      return false;
    }
    if (!new RegExp(`^/api/${apiPath}/\\d+$`).test(new URL(response.url()).pathname)) {
      return false;
    }
    const body = response.request().postDataJSON() as Record<string, unknown> | null;
    return body != null && "embedding_params" in body;
  });

  await page
    .getByRole("button", { name: /^(Publish|Publish changes)$/ })
    .click();

  const response = await published;
  assertBody?.(response.request().postDataJSON() as Record<string, unknown>);
}

/** Port of getParametersContainer (e2e-embedding-helpers.js). */
export function getParametersContainer(page: Page): Locator {
  return page.getByTestId("parameters-container");
}

/** Port of H.setEmbeddingParameter. */
export async function setEmbeddingParameter(
  page: Page,
  name: string,
  value: string,
) {
  await getParametersContainer(page).getByLabel(name, { exact: true }).click();
  await popover(page)
    .getByRole("listbox")
    .getByText(value, { exact: true })
    .click();
}

/** Port of H.assertEmbeddingParameter. */
export async function assertEmbeddingParameter(
  page: Page,
  name: string,
  value: string,
) {
  await expect(
    getParametersContainer(page).getByLabel(name, { exact: true }),
  ).toHaveValue(value);
}

// === dashboard-editing helpers not in dashboard.ts ===
// TODO(consolidation): these belong next to editDashboard/saveDashboard in
// dashboard.ts.

/** Port of H.getRequiredToggle. */
export function getRequiredToggle(page: Page): Locator {
  return page.getByLabel("Always require a value");
}

/** Port of H.toggleRequiredParameter (the real input is hidden in Mantine). */
export function toggleRequiredParameter(page: Page) {
  return getRequiredToggle(page).click({ force: true });
}
