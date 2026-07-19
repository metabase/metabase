/**
 * Helpers for the public-dashboard spec port
 * (e2e/test/scenarios/sharing/public-dashboard.cy.spec.js).
 *
 * New helpers live here (parallel-agent rule: no edits to shared modules). The
 * shared surface — visitPublicDashboard (sharing.ts / question-saved.ts),
 * createPublicLink (public-sharing.ts), filterWidget / getDashboardCard /
 * assertDashboardFixedWidth / popover / goToTab (dashboard.ts, dashboard-core.ts,
 * ui.ts), createDashboardWithQuestions / createNativeQuestionAndDashboard
 * (factories.ts) — is imported read-only by the spec.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createNativeQuestionAndDashboard } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";

const { PRODUCTS } = SAMPLE_DATABASE;

export const PUBLIC_DASHBOARD_REGEX =
  /\/public\/dashboard\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

export const COUNT_ALL = "200";
export const COUNT_DOOHICKEY = "42";

export const TEXT_FILTER = {
  id: "1",
  type: "string/=",
  name: "Text",
  slug: "text",
  sectionId: "string",
};

export const UNUSED_FILTER = {
  id: "2",
  type: "number/=",
  name: "Number",
  slug: "number",
  sectionId: "number",
};

export const TAB_1 = { id: 1, name: "Tab 1" };
export const TAB_2 = { id: 2, name: "Tab 2" };

const questionDetails = {
  name: "sql param",
  native: {
    query: "select count(*) from products where {{c}}",
    "template-tags": {
      c: {
        id: "e126f242-fbaa-1feb-7331-21ac59f021cc",
        name: "c",
        "display-name": "Category",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        default: null,
        "widget-type": "category",
      },
    },
  },
  display: "scalar",
};

const dashboardDetails = {
  parameters: [TEXT_FILTER, UNUSED_FILTER],
  tabs: [TAB_1, TAB_2],
};

type DashboardWithTabs = {
  tabs?: { id: number; name: string }[];
  dashcards: {
    id: number;
    card_id: number;
    dashboard_tab_id: number | null;
  }[];
};

/**
 * Port of the spec's `prepareDashboard`: enable public sharing, create the
 * tabbed native-question dashboard, then connect the Text filter to the card's
 * `c` template tag via a second PUT. Returns the dashboard id (the Cypress
 * `@dashboardId` alias).
 *
 * Unlike the Cypress helper — which threads `dashboardTabs` straight from the
 * `createNativeQuestionAndDashboard` response — the shared factory doesn't
 * surface the tab list, so we GET the dashboard back to read the
 * server-assigned tab ids and the dashcard before re-PUTting.
 */
export async function prepareDashboard(api: MetabaseApi): Promise<number> {
  await api.updateSetting("enable-public-sharing", true);

  const { dashboard_id } = await createNativeQuestionAndDashboard(api, {
    questionDetails,
    dashboardDetails,
  });

  const dashboard = (await (
    await api.get(`/api/dashboard/${dashboard_id}`)
  ).json()) as DashboardWithTabs;
  const dashcard = dashboard.dashcards[0];

  await api.put(`/api/dashboard/${dashboard_id}`, {
    tabs: dashboard.tabs,
    dashcards: [
      {
        id: dashcard.id,
        dashboard_tab_id: dashcard.dashboard_tab_id,
        card_id: dashcard.card_id,
        row: 0,
        col: 0,
        size_x: 8,
        size_y: 6,
        parameter_mappings: [
          {
            parameter_id: TEXT_FILTER.id,
            card_id: dashcard.card_id,
            target: ["dimension", ["template-tag", "c"]],
          },
        ],
      },
    ],
  });

  return dashboard_id;
}

type CapturedAnchor = { tagName: string; href: string } | null;

/**
 * Port of the spec's `cy.spy(win.document.body, "appendChild")`: the "link"
 * click behavior opens a URL by creating an `<a>`, appending it to the body,
 * clicking it, and removing it (lib/dom.js `clickLink`). Cypress asserts on the
 * last-appended element's tagName + href.
 *
 * We spy on `document.body.appendChild` the same way, but also neutralise the
 * appended anchor's own `.click()` so the test doesn't actually navigate to the
 * external URL (Cypress's synthetic spy never triggered navigation either). The
 * `href` property is read at click time because `clickLink` sets `a.href` after
 * the append.
 */
export async function spyOnAppendedAnchor(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as { __capturedAnchor?: CapturedAnchor };
    win.__capturedAnchor = null;
    const originalAppend = document.body.appendChild.bind(document.body);
    document.body.appendChild = function <T extends Node>(node: T): T {
      const appended = originalAppend(node) as T;
      if (node instanceof HTMLAnchorElement) {
        const anchor = node;
        anchor.click = () => {
          win.__capturedAnchor = { tagName: anchor.tagName, href: anchor.href };
        };
      }
      return appended;
    };
  });
}

/** Read the anchor captured by spyOnAppendedAnchor. */
export function getCapturedAnchor(page: Page): Promise<CapturedAnchor> {
  return page.evaluate(
    () =>
      (window as unknown as { __capturedAnchor?: CapturedAnchor })
        .__capturedAnchor ?? null,
  );
}
