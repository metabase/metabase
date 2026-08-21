/**
 * Helpers for the dashboard-back-navigation port
 * (e2e/test/scenarios/dashboard/dashboard-back-navigation.cy.spec.js).
 *
 * Lives in its own module so shared support files stay untouched
 * (PORTING.md rule 9). Everything the spec needs that already has a home is
 * imported READ-ONLY from the landed modules:
 *
 * - `visitDashboard` / `queryBuilderHeader` / `appBar` / `collectionTable` /
 *   `popover` / `modal` — support/ui.ts
 * - `getDashboardCard` / `dashboardHeader` / `filterWidget` / `saveDashboard`
 *   / `editDashboard` — support/dashboard.ts
 * - `getDashboardCards` / `getTextCardDetails` — support/dashboard-core.ts
 * - `getDashboardCardMenu` — support/dashboard-cards.ts
 * - `createAction` / `getActionCardDetails` — support/actions-on-dashboards.ts
 * - `setActionsEnabledForDB` — support/command-palette.ts
 * - `openQuestionsSidebar` — support/revisions.ts
 * - `visitDashboardAndCreateTab` — support/dashboard-tabs.ts
 * - `ADMIN_PERSONAL_COLLECTION_ID` — support/permissions.ts
 * - `findByDisplayValue` — support/filters-repros.ts
 * - `nativeEditor` — support/native-editor.ts
 * - `summarize` — support/models.ts, `visualize`/`openNotebook` —
 *   support/notebook.ts, `rightSidebar` — support/question-saved.ts
 *
 * What lives here: the request/response queue that ports this spec's
 * `cy.intercept(...).as()` + `cy.wait("@alias")` + `cy.get("@alias.all")`
 * triad, and the four dashboard fixtures.
 */
import type { Page, Request, Response } from "@playwright/test";

import { createAction, getActionCardDetails } from "./actions-on-dashboards";
import type { MetabaseApi } from "./api";
import { getTextCardDetails } from "./dashboard-core";
import { createDashboard, createNativeQuestionAndDashboard, createQuestion } from "./factories";
import { ADMIN_PERSONAL_COLLECTION_ID } from "./permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

/** Port of the spec's `PG_DB_ID = 2`.
 *
 * NOTE the #85 red-herring rule cuts the other way here: this spec's second
 * describe restores the **postgres-12** snapshot, under which database 2 is
 * the read-only "QA Postgres12" sample — NOT the writable container. The card
 * only calls `pg_sleep`, which is read-only, so nothing here can contaminate
 * the shared writable DB. */
export const PG_DB_ID = 2;

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres12 container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

// === cy.intercept alias ports ===

/**
 * Port of a `cy.intercept(method, glob).as(name)` alias.
 *
 * Two behaviours have to be modelled separately, because upstream depends on
 * BOTH and they differ:
 *
 * 1. `cy.wait("@alias")` is a QUEUE over **responses** that pops PAST ones —
 *    a wait can be satisfied retroactively by a response that already
 *    arrived. `waitForResponse` has no such memory, so several of this spec's
 *    waits would deadlock if ported literally (PORTING.md, ResponseRecorder).
 *    `wait()` below records from the moment the queue is constructed (where
 *    Cypress registers its intercept) and pops the next unconsumed response.
 *
 * 2. `cy.get("@alias.all").should("have.length", n)` counts **interceptions**,
 *    i.e. REQUESTS — not completed responses. This is load-bearing in
 *    "should restore a dashboard with loading cards": both of that test's
 *    dashcard queries run `pg_sleep(60)` and neither has responded when the
 *    `have.length 2` assertion runs. Counting responses there could never
 *    reach 2. `requestCount` therefore counts requests.
 *
 * Cypress's glob `*` does not cross `/`, so every predicate below is anchored
 * on a single-segment match (PORTING.md "port a Cypress glob intercept
 * literally").
 */
export class InterceptAlias {
  private readonly requests: Request[] = [];
  private readonly responses: Response[] = [];
  private consumed = 0;

  constructor(
    private readonly page: Page,
    private readonly match: (method: string, pathname: string) => boolean,
  ) {
    page.on("request", (request) => {
      if (this.matches(request.method(), request.url())) {
        this.requests.push(request);
      }
    });
    page.on("response", (response) => {
      const request = response.request();
      if (this.matches(request.method(), request.url())) {
        this.responses.push(response);
      }
    });
  }

  private matches(method: string, url: string): boolean {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return false;
    }
    return this.match(method, pathname);
  }

  /** Port of `cy.get("@alias.all").length` — matching REQUESTS, see above. */
  get requestCount(): number {
    return this.requests.length;
  }

  /** Port of `cy.wait("@alias")`: pop the next unconsumed matching response,
   * including one that already arrived before this call. */
  async wait(timeout = 30_000): Promise<Response> {
    const deadline = Date.now() + timeout;
    while (this.responses.length <= this.consumed) {
      if (Date.now() > deadline) {
        throw new Error(
          `InterceptAlias.wait: timed out after ${timeout}ms waiting for response #${
            this.consumed + 1
          } (seen ${this.responses.length} responses, ${this.requests.length} requests)`,
        );
      }
      await this.page.waitForTimeout(50);
    }
    return this.responses[this.consumed++];
  }
}

/** `cy.intercept("POST", "/api/dataset").as("dataset")` */
export const datasetAlias = (page: Page) =>
  new InterceptAlias(
    page,
    (method, pathname) => method === "POST" && pathname === "/api/dataset",
  );

/** `cy.intercept("GET", "/api/card/*").as("card")` */
export const cardAlias = (page: Page) =>
  new InterceptAlias(
    page,
    (method, pathname) =>
      method === "GET" && /^\/api\/card\/[^/]+$/.test(pathname),
  );

/** `cy.intercept("POST", "/api/card/*&#47;query").as("cardQuery")` */
export const cardQueryAlias = (page: Page) =>
  new InterceptAlias(
    page,
    (method, pathname) =>
      method === "POST" && /^\/api\/card\/[^/]+\/query$/.test(pathname),
  );

/** `cy.intercept("PUT", "/api/card/*").as("updateCard")` */
export const updateCardAlias = (page: Page) =>
  new InterceptAlias(
    page,
    (method, pathname) =>
      method === "PUT" && /^\/api\/card\/[^/]+$/.test(pathname),
  );

/** `cy.intercept("GET", "/api/dashboard/*").as("dashboard")` — single
 * segment, so `/api/dashboard/:id/query_metadata` is deliberately NOT
 * matched, exactly as upstream's glob behaves. */
export const dashboardAlias = (page: Page) =>
  new InterceptAlias(
    page,
    (method, pathname) =>
      method === "GET" && /^\/api\/dashboard\/[^/]+$/.test(pathname),
  );

/** `cy.intercept("POST", "/api/dashboard/*&#47;dashcard/*&#47;card/*&#47;query")` */
export const dashcardQueryAlias = (page: Page) =>
  new InterceptAlias(
    page,
    (method, pathname) =>
      method === "POST" &&
      /^\/api\/dashboard\/[^/]+\/dashcard\/[^/]+\/card\/[^/]+\/query$/.test(
        pathname,
      ),
  );

// === fixtures (ports of the spec-local create* functions) ===

/**
 * Port of the spec-local createDashboardWithCards: a question card, a text
 * card and an action card on one dashboard.
 *
 * Upstream pins the dashcard ids to -1/-2/-3 explicitly, which also side-steps
 * the colliding-negative-id gotcha (getTextCardDetails and
 * getActionCardDetails mint ids from independent counters) — so the explicit
 * ids are carried over verbatim rather than left to the defaults.
 */
export async function createDashboardWithCards(
  api: MetabaseApi,
): Promise<number> {
  const questionDetails = {
    name: "Orders",
    query: { "source-table": ORDERS_ID },
  };

  const modelDetails = {
    name: "Orders model",
    query: { "source-table": ORDERS_ID },
    type: "model",
  };

  const actionDetails = {
    name: "Update orders quantity",
    type: "query",
    database_id: SAMPLE_DB_ID,
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: "UPDATE orders SET quantity = quantity",
      },
      type: "native",
    },
    parameters: [],
    visualization_settings: {
      type: "button",
    },
  };

  const questionDashcardDetails = {
    row: 0,
    col: 0,
    size_x: 8,
    size_y: 8,
    visualization_settings: {},
  };

  const { id: dashboard_id } = await createDashboard(api);
  const { id: question_id } = await createQuestion(api, questionDetails);
  const { id: model_id } = await createQuestion(api, modelDetails);
  const { id: action_id } = await createAction(api, {
    ...actionDetails,
    model_id,
  });

  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      { id: -1, card_id: question_id, ...questionDashcardDetails },
      getTextCardDetails({ id: -2, size_y: 1 }),
      getActionCardDetails({ id: -3, action_id }),
    ],
  });

  return dashboard_id;
}

/** Port of the spec-local createDashboardWithNativeCard. */
export async function createDashboardWithNativeCard(
  api: MetabaseApi,
): Promise<number> {
  const { dashboard_id } = await createNativeQuestionAndDashboard(api, {
    questionDetails: {
      name: "Orders SQL",
      native: {
        query: "SELECT * FROM ORDERS",
      },
    },
  });
  return dashboard_id;
}

/**
 * Port of the spec-local createDashboardWithSlowCard: a native QA-Postgres
 * card whose only job is to `pg_sleep` for the number of seconds the
 * dashboard's "sleep" filter supplies.
 */
export async function createDashboardWithSlowCard(
  api: MetabaseApi,
): Promise<number> {
  const questionDetails = {
    name: "Sleep card",
    database: PG_DB_ID,
    native: {
      query: "SELECT {{sleep}}, pg_sleep({{sleep}});",
      "template-tags": {
        sleep: {
          id: "fake-uuid",
          name: "sleep",
          "display-name": "sleep",
          type: "number",
          default: 0,
        },
      },
    },
  };

  const filterDetails = {
    name: "sleep",
    slug: "sleep",
    id: "96917420",
    type: "number/=",
    sectionId: "number",
    default: 0,
  };

  const dashboardDetails = {
    name: "Sleep dashboard",
    parameters: [filterDetails],
  };

  const dashcardDetails = {
    row: 0,
    col: 0,
    size_x: 8,
    size_y: 8,
  };

  const parameterMapping = {
    parameter_id: filterDetails.id,
    target: ["variable", ["template-tag", "sleep"]],
  };

  const { id, card_id, dashboard_id } = await createNativeQuestionAndDashboard(
    api,
    { questionDetails, dashboardDetails },
  );

  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        ...dashcardDetails,
        parameter_mappings: [{ ...parameterMapping, card_id }],
      },
    ],
  });

  return dashboard_id;
}

/**
 * Port of the spec-local createDashboardWithPermissionError: two Orders
 * questions, the second parked in the admin's personal collection so a normal
 * user gets "Sorry, you don't have permission to see this card."
 */
export async function createDashboardWithPermissionError(
  api: MetabaseApi,
): Promise<number> {
  const { id: card_id_1 } = await createQuestion(api, {
    name: "Orders 1",
    query: { "source-table": ORDERS_ID },
  });
  const { id: card_id_2 } = await createQuestion(api, {
    name: "Orders 2",
    query: { "source-table": ORDERS_ID },
    collection_id: ADMIN_PERSONAL_COLLECTION_ID,
  });
  const { id: dashboard_id } = await createDashboard(api, {
    name: "Orders in a dashboard",
  });

  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      { id: -1, card_id: card_id_1, row: 0, col: 0, size_x: 8, size_y: 8 },
      { id: -2, card_id: card_id_2, row: 0, col: 8, size_x: 8, size_y: 8 },
    ],
  });

  return dashboard_id;
}
