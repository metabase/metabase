/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-remapping.cy.spec.ts
 *
 * FK / human-readable remapping in dashboard filter dropdowns: a filter mapped
 * to an ID column shows remapped display values (internal value map, external
 * FK->Name). Verified on the saved dashboard, the public dashboard, and the
 * signed embedded page.
 *
 * Porting notes:
 * - createMockParameter only fills the defaults these parameters override, so
 *   they are written inline (no metabase-types import).
 * - findWidget/clearWidget resolve the widget by exact aria-label, not text —
 *   every widget carries a remapped default *value*, so the parameter name is
 *   never in the visible text. See support/dashboard-filters-remapping.ts.
 * - Remapping needs field values, so addInternalRemapping seeds the value map
 *   via /api/field/:id/values, and addExternalRemapping wires the FK dimension.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
} from "../support/dashboard";
import {
  testDefaultValuesRemapping,
  testWidgetsRemapping,
} from "../support/dashboard-filters-remapping";
import {
  editingDashboardParametersContainer,
  selectDashboardFilter,
} from "../support/dashboard-parameters";
import {
  createDashboardWithQuestions,
  createQuestion,
} from "../support/factories";
import { test } from "../support/fixtures";
import {
  visitEmbeddedPage,
  visitPublicDashboard,
} from "../support/question-saved";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { visitDashboard } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE_ID } = SAMPLE_DATABASE;

test.describe("scenarios > dashboard > filters > remapping", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await addInternalRemapping(mb.api);
    await addExternalRemapping(mb.api);
  });

  test("should remap dashboard parameter values", async ({ page, mb }) => {
    const dashboardId = await createDashboard(mb.api);

    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);
    await mapParameters(page);
    await saveDashboard(page);

    await testDefaultValuesRemapping(page);
    await testWidgetsRemapping(page);

    await visitPublicDashboard(page, mb, dashboardId);
    await testDefaultValuesRemapping(page);
    await testWidgetsRemapping(page);

    await visitEmbeddedPage(page, mb, {
      resource: { dashboard: dashboardId },
      params: {},
    });
    await testDefaultValuesRemapping(page);
    await testWidgetsRemapping(page);
  });
});

async function addInternalRemapping(api: MetabaseApi) {
  await api.post(`/api/field/${ORDERS.QUANTITY}/dimension`, {
    name: "Quantity",
    type: "internal",
    human_readable_field_id: null,
  });

  const response = await api.get(`/api/field/${ORDERS.QUANTITY}/values`);
  const body = (await response.json()) as { values: [number][] };
  await api.post(`/api/field/${ORDERS.QUANTITY}/values`, {
    values: body.values.map(([value]) => [value, `N${value}`]),
  });
}

async function addExternalRemapping(api: MetabaseApi) {
  await api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

async function createDashboard(api: MetabaseApi): Promise<number> {
  // Two models first (their ids are needed to source the questions below).
  const ordersModel = await createQuestion(api, {
    name: "Orders model",
    type: "model",
    query: { "source-table": ORDERS_ID },
  });
  const peopleModel = await createQuestion(api, {
    name: "People model",
    type: "model",
    query: { "source-table": PEOPLE_ID },
  });

  const { dashboard } = await createDashboardWithQuestions(api, {
    dashboardDetails: {
      parameters: [
        {
          id: "p1",
          slug: "p1",
          name: "Internal",
          type: "number/=",
          default: [1],
        },
        { id: "p2", slug: "p2", name: "FK", type: "id", default: [2] },
        { id: "p3", slug: "p3", name: "PK->Name", type: "id", default: [3] },
        { id: "p4", slug: "p4", name: "FK->Name", type: "id", default: [4] },
        {
          id: "p5",
          slug: "p5",
          name: "PK+FK->Name",
          type: "id",
          default: [5],
        },
      ],
      enable_embedding: true,
      embedding_params: {
        p1: "enabled",
        p2: "enabled",
        p3: "enabled",
        p4: "enabled",
        p5: "enabled",
      },
    },
    questions: [
      // dashcard 0 — Orders question (on the Orders model)
      {
        name: "Orders question",
        type: "question",
        query: { "source-table": `card__${ordersModel.id}` },
      },
      // dashcard 1 — People question (on the People model)
      {
        name: "People question",
        type: "question",
        query: { "source-table": `card__${peopleModel.id}` },
      },
      // dashcard 2 — Orders native question with a Product ID dimension tag
      {
        name: "Orders native question",
        native: {
          query: "SELECT * FROM ORDERS WHERE {{product_id}}",
          "template-tags": {
            product_id: {
              id: "product_id",
              name: "Product ID",
              "display-name": "Product ID",
              type: "dimension",
              dimension: ["field", ORDERS.PRODUCT_ID, null],
            },
          },
        },
      },
    ],
  });

  return Number(dashboard.id);
}

async function mapParameters(page: Page) {
  await editingDashboardParametersContainer(page)
    .getByText("Internal", { exact: true })
    .click();
  await selectDashboardFilter(getDashboardCard(page, 0), "Quantity");

  await editingDashboardParametersContainer(page)
    .getByText("FK", { exact: true })
    .click();
  await selectDashboardFilter(getDashboardCard(page, 2), "Product ID");

  await editingDashboardParametersContainer(page)
    .getByText("PK->Name", { exact: true })
    .click();
  await selectDashboardFilter(getDashboardCard(page, 1), "ID");

  await editingDashboardParametersContainer(page)
    .getByText("FK->Name", { exact: true })
    .click();
  await selectDashboardFilter(getDashboardCard(page, 0), "User ID");

  await editingDashboardParametersContainer(page)
    .getByText("PK+FK->Name", { exact: true })
    .click();
  await selectDashboardFilter(getDashboardCard(page, 0), "User ID");
  await selectDashboardFilter(getDashboardCard(page, 1), "ID");
}
