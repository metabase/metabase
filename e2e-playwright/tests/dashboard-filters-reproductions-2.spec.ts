/**
 * Playwright port of
 * e2e/test/scenarios/filters-reproductions/dashboard-filters-reproductions-2.cy.spec.js
 *
 * Porting notes:
 * - Reuses the sibling spec-1 helper surface (support/filters-repros.ts) for
 *   the api builders, dashboard-parameter UI helpers, request bookkeeping and
 *   visit helpers. Only two genuinely new helpers live in
 *   support/filters-repros-2.ts (dashboardParametersDoneButton,
 *   getManyDataTypesBooleanFieldId).
 * - @external describes (issue 45670, and issue 14595 which needs the
 *   postgres-writable snapshot even though upstream forgot the tag) are
 *   test.skip-gated on PW_QA_DB_ENABLED — the spike backend has no QA DBs.
 * - issue 48824 carries { tags: "@skip" } upstream ("unskip after v54") — kept
 *   skipped here; the body is ported for when it is re-enabled.
 * - Intercept-count assertions (cy.get("@alias.all").should("have.length", n))
 *   become trackResponses counters with a short settle beat.
 * - Never-awaited intercepts are dropped: issue 45670's "updateCard" and issue
 *   #66670's early "updateDashboard"/"revisionHistory" aliases are registered
 *   at their true trigger via waitForResponseMatching instead.
 * - "not.be.visible" width/overflow checks use offsetWidth/scrollWidth/
 *   boundingBox evaluated in-page (Cypress's jQuery width vs Playwright box).
 * - Virtualized dashcard cells render once per quadrant — cell getByText uses
 *   .first() where a single logical value is expected.
 * - issue 54236 freezes the clock with page.clock.setFixedTime (cy.clock).
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";

import { createMockDashboardCard } from "../support/click-behavior";
import { createDashboardWithTabs } from "../support/command-palette";
import {
  editDashboard,
  getDashboardCard,
  modal,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
  setFilterQuestionSource,
  sidebar,
  waitForDashcardsToLoad,
} from "../support/dashboard";
import {
  icon,
  showDashboardCardActions,
} from "../support/dashboard-cards";
import {
  addOrUpdateDashboardCard,
  openDashboardInfoSidebar,
} from "../support/dashboard-management";
import {
  filterWidget,
  mockParameter as createMockParameter,
  setDashboardParameterName,
} from "../support/dashboard-parameters";
import { assertTabSelected } from "../support/dashboard-repros";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import {
  caseSensitiveSubstring,
  createDashboard,
  createDashboardWithQuestions,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  dashboardParameterSidebar,
  dashboardParametersContainer,
  dashboardParametersPopover,
  editingParametersContainer,
  findByDisplayValue,
  setModelMetadata,
  trackResponses,
  updateDashboardCards,
  visitDashboardWithParams,
  visitEmbeddedDashboard,
  waitForResponseMatching,
} from "../support/filters-repros";
import {
  dashboardParametersDoneButton,
  getManyDataTypesBooleanFieldId,
} from "../support/filters-repros-2";
import { test, expect } from "../support/fixtures";
import { getTableId } from "../support/interactive-embedding";
import { chartPathWithFillColor } from "../support/binning";
import { cartesianChartCircles, undoToast } from "../support/metrics";
import {
  openQuestionActions,
  summarize,
  tableInteractive,
  visitModel,
  waitForDataset,
} from "../support/models";
import { resetManyDataTypesTable } from "../support/native-filters-extras";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  tableHeaderClick,
} from "../support/notebook";
import { assertTableRowsCount } from "../support/native-extras";
import { tableInteractiveBody } from "../support/question-new";
import { rightSidebar, visitPublicDashboard } from "../support/question-saved";
import { sidesheet } from "../support/revisions";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { main } from "../support/sharing";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import {
  popover,
  queryBuilderHeader,
  visitDashboard,
  visitQuestion,
} from "../support/ui";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

const urlSearch = (page: Page) => () => new URL(page.url()).search;

/** The slice of the mb fixture these spec-local helpers need. */
type Harness = { api: MetabaseApi };

test.describe("issue 27579", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should be able to remove the last exclude hour option (metabase#27579)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await setFilter(page, "Date picker", "All Options");
    await selectDashboardFilter(getDashboardCard(page), "Created At");
    await saveDashboard(page);
    await filterWidget(page).click();

    const dropdown = popover(page);
    await dropdown.getByText("Exclude…", { exact: true }).click();
    await dropdown.getByText("Hours of the day…", { exact: true }).click();
    await dropdown.getByText("Select all", { exact: true }).click();
    await expect(dropdown.getByLabel("12 AM", { exact: true })).toBeChecked();

    await dropdown.getByText("Select all", { exact: true }).click();
    await expect(
      dropdown.getByLabel("12 AM", { exact: true }),
    ).not.toBeChecked();
  });
});

test.describe("issue 32804", () => {
  const question1Details = {
    name: "Q1",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    name: "Number",
    slug: "number",
    id: "27454068",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  const getQuestion2Details = (card: { id: number }) => ({
    name: "Q2",
    query: {
      "source-table": `card__${card.id}`,
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        "Gadget",
      ],
    },
  });

  const getParameterMapping = (card: { id: number }) => ({
    card_id: card.id,
    parameter_id: parameterDetails.id,
    target: [
      "dimension",
      ["field", PRODUCTS.RATING, { "base-type": "type/Integer" }],
    ],
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should retain source query filters when drilling-thru from a dashboard (metabase#32804)", async ({
    page,
    mb,
  }) => {
    const card1 = await createQuestion(mb.api, question1Details);
    const { dashboard, questions } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails,
      questions: [getQuestion2Details(card1)],
    });
    const [card2] = questions;
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: card2.id,
          parameter_mappings: [getParameterMapping(card2)],
        },
      ],
    });
    await visitDashboardWithParams(page, mb.api, dashboard.id, {
      [parameterDetails.slug]: "4",
    });

    await expect(
      filterWidget(page).getByText("4", { exact: true }),
    ).toBeVisible();
    await getDashboardCard(page, 0).getByText("Q2", { exact: true }).click();

    const filtersPanel = queryBuilderFiltersPanel(page);
    await expect(
      filtersPanel.getByText("Category is Gadget", { exact: true }),
    ).toBeVisible();
    await expect(
      filtersPanel.getByText("Rating is equal to 4", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("44047", () => {
  const questionDetails = {
    name: "Question",
    type: "question",
    query: {
      "source-table": REVIEWS_ID,
      limit: 100,
    },
  };

  const modelDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": REVIEWS_ID,
      limit: 100,
    },
  };

  const sourceQuestionDetails = {
    name: "Source question",
    type: "question",
    query: {
      "source-table": REVIEWS_ID,
      fields: [
        ["field", REVIEWS.ID, { "base-type": "type/BigInteger" }],
        ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
      ],
    },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "5a425670",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDashcardDetails(card: { id: number }) {
    return {
      card_id: card.id,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameterDetails.id,
          target: [
            "dimension",
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
          ],
        },
      ],
    };
  }

  function getModelDashcardDetails(card: { id: number }) {
    return {
      card_id: card.id,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameterDetails.id,
          target: [
            "dimension",
            ["field", "RATING", { "base-type": "type/Integer" }],
          ],
        },
      ],
    };
  }

  async function verifyFilterWithRemapping(page: Page) {
    await filterWidget(page).click();
    const dropdown = popover(page);
    await dropdown.getByPlaceholder("Search the list").pressSequentially("Remapped");
    await dropdown.getByText("Remapped", { exact: true }).click();
    await dropdown.getByRole("button", { name: "Add filter", exact: true }).click();
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/Category",
    });
    await mb.api.post(`/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });
    await mb.api.post(`/api/field/${REVIEWS.RATING}/values`, {
      values: [[1, "Remapped"]],
    });
  });

  test("should be able to use remapped values from an integer field with an overridden semantic type used for a custom dropdown source in public dashboards (metabase#44047)", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, sourceQuestionDetails);
    const { dashboard, questions: cards } = await createDashboardWithQuestions(
      mb.api,
      {
        dashboardDetails,
        questions: [questionDetails, modelDetails],
      },
    );
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        getQuestionDashcardDetails(cards[0]),
        getModelDashcardDetails(cards[1]),
      ],
    });

    // verify filtering works in a regular dashboard
    await visitDashboard(page, mb.api, dashboard.id);
    await verifyFilterWithRemapping(page);

    // verify filtering works in a public dashboard
    await visitPublicDashboard(page, mb, dashboard.id);
    await verifyFilterWithRemapping(page);
  });
});

test.describe("issue 45659", () => {
  const parameterDetails = {
    name: "ID",
    slug: "id",
    id: "f8ec7c71",
    type: "id",
    sectionId: "id",
    default: [10],
  };

  const questionDetails = {
    name: "People",
    query: { "source-table": PEOPLE_ID },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  async function makeDashboard(api: MetabaseApi): Promise<{ id: number }> {
    const { dashboard, questions } = await createDashboardWithQuestions(api, {
      dashboardDetails,
      questions: [questionDetails],
    });
    const [card] = questions;
    await addOrUpdateDashboardCard(api, {
      dashboard_id: dashboard.id,
      card_id: card.id,
      card: {
        parameter_mappings: [
          {
            card_id: card.id,
            parameter_id: parameterDetails.id,
            target: [
              "dimension",
              ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
            ],
          },
        ],
      },
    });
    return dashboard;
  }

  async function verifyFilterWithRemapping(page: Page) {
    await expect(
      filterWidget(page).getByText("Tressa White", { exact: true }),
    ).toBeVisible();
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/field/${PEOPLE.ID}`, {
      has_field_values: "list",
    });
  });

  test("should remap initial parameter values in public dashboards (metabase#45659)", async ({
    page,
    mb,
  }) => {
    const dashboard = await makeDashboard(mb.api);
    await visitPublicDashboard(page, mb, dashboard.id);
    await verifyFilterWithRemapping(page);
  });

  test("should remap initial parameter values in embedded dashboards (metabase#45659)", async ({
    page,
    mb,
  }) => {
    const dashboard = await makeDashboard(mb.api);
    await visitEmbeddedDashboard(page, mb, {
      resource: { dashboard: dashboard.id },
      params: {},
    });
    await verifyFilterWithRemapping(page);
  });
});

test.describe("44266", () => {
  const filterDetails = {
    name: "Equal to",
    slug: "equal_to",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "44266",
    parameters: [filterDetails],
  };

  const regularQuestion = {
    name: "regular",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const nativeQuestion = {
    name: "native",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
      },
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow mapping when native and regular questions can be mapped (metabase#44266)", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails,
      questions: [regularQuestion, nativeQuestion],
    });
    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);
    await editingParametersContainer(page)
      .getByText("Equal to", { exact: true })
      .click();

    await getDashboardCard(page, 1).getByText("Select…", { exact: true }).click();

    await popover(page).getByText("Price", { exact: true }).click();

    await expect(
      getDashboardCard(page, 1).getByText("Price", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 44790", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should handle string values passed to number and id filters (metabase#44790)", async ({
    page,
    mb,
  }) => {
    const idFilter = {
      id: "92eb69ea",
      name: "ID",
      sectionId: "id",
      slug: "id",
      type: "id",
    };

    const numberFilter = {
      id: "10c0d4ba",
      name: "Equal to",
      slug: "equal_to",
      type: "number/=",
      sectionId: "number",
    };

    const peopleQuestionDetails = {
      query: { "source-table": PEOPLE_ID, limit: 5 },
    };

    const { dashboard, questions } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails: {
        parameters: [idFilter, numberFilter],
      },
      questions: [peopleQuestionDetails],
    });
    const [peopleCard] = questions;

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: peopleCard.id,
          parameter_mappings: [
            {
              parameter_id: idFilter.id,
              card_id: peopleCard.id,
              target: ["dimension", ["field", PEOPLE.ID, null]],
            },
            {
              parameter_id: numberFilter.id,
              card_id: peopleCard.id,
              target: ["dimension", ["field", PEOPLE.LATITUDE, null]],
            },
          ],
        },
      ],
    });

    // wrong value for id filter should be ignored
    await visitDashboardWithParams(page, mb.api, dashboard.id, {
      [idFilter.slug]: "{{test}}",
    });
    await expect(
      getDashboardCard(page)
        .getByText("borer-hudson@yahoo.com", { exact: true })
        .first(),
    ).toBeVisible();

    // wrong value for number filter should be ignored
    await visitDashboardWithParams(page, mb.api, dashboard.id, {
      [numberFilter.slug]: "{{test}}",
      [idFilter.slug]: "1",
    });
    await expect(
      getDashboardCard(page)
        .getByText("borer-hudson@yahoo.com", { exact: true })
        .first(),
    ).toBeVisible();
  });
});

test.describe("issue 35852", () => {
  const model = {
    name: "35852 - sql",
    type: "model",
    native: {
      query: "SELECT * FROM PRODUCTS LIMIT 10",
    },
  };

  async function createDashboardWithFilterAndQuestionMapped(
    api: MetabaseApi,
    modelId: number,
  ): Promise<number> {
    const parameterDetails = {
      name: "Category",
      slug: "category",
      id: "2a12e66c",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [parameterDetails],
    };

    const questionDetails = {
      name: "Q1",
      query: { "source-table": `card__${modelId}`, limit: 10 },
    };

    const { dashboard, questions } = await createDashboardWithQuestions(api, {
      dashboardDetails,
      questions: [questionDetails],
    });
    const [card] = questions;
    await updateDashboardCards(api, {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: card.id,
          parameter_mappings: [
            {
              card_id: card.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      ],
    });
    return dashboard.id;
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show filter values for a model based on sql query (metabase#35852)", async ({
    page,
    mb,
  }) => {
    const { id: modelId } = await createNativeQuestion(mb.api, model);
    await setModelMetadata(mb.api, modelId, (field) => {
      if (field.display_name === "CATEGORY") {
        return {
          ...field,
          id: PRODUCTS.CATEGORY,
          display_name: "Category",
          semantic_type: "type/Category",
          fk_target_field_id: null,
        };
      }
      return field;
    });

    const dashboardId = await createDashboardWithFilterAndQuestionMapped(
      mb.api,
      modelId,
    );
    await visitModel(page, modelId);

    await tableHeaderClick(page, "Category");
    await popover(page).getByText("Filter by this column", { exact: true }).click();

    // Verify filter values are available
    const filterPopover = popover(page);
    await expect(filterPopover.getByText("Gizmo", { exact: true })).toBeVisible();
    await expect(
      filterPopover.getByText("Doohickey", { exact: true }),
    ).toBeVisible();
    await expect(filterPopover.getByText("Gadget", { exact: true })).toBeVisible();
    await expect(filterPopover.getByText("Widget", { exact: true })).toBeVisible();

    await filterPopover.getByText("Gizmo", { exact: true }).click();
    await filterPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    // Verify filter is applied
    await expect(
      page
        .getByTestId("cell-data")
        .filter({ hasText: caseSensitiveSubstring("Gizmo") }),
    ).toHaveCount(2);

    await visitDashboard(page, mb.api, dashboardId);

    await filterWidget(page).click();
    const dashPopover = popover(page);
    await dashPopover.getByText("Gizmo", { exact: true }).click();
    await dashPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(
      getDashboardCard(page).getByText("Gizmo", { exact: true }),
    ).toHaveCount(2);
  });
});

test.describe("issue 47097", () => {
  const questionDetails = {
    name: "Products",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
    type: "string/=",
    name: "Category",
    slug: "category",
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test('should be able to use filters without "create-queries" permissions when coming from a dashboard (metabase#47097)', async ({
    page,
    mb,
  }) => {
    // create a dashboard with a parameter mapped to a field with values
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await updateDashboardCards(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      cards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 12,
          size_y: 12,
          parameter_mappings: [
            {
              parameter_id: parameterDetails.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
        },
      ],
    });

    // verify the field values in a dashboard
    await mb.signIn("nodata");
    await visitDashboard(page, mb.api, dashcard.dashboard_id);
    await filterWidget(page).click();
    let dropdown = popover(page);
    await expect(dropdown.getByText("Gadget", { exact: true })).toBeVisible();
    await dropdown.getByPlaceholder("Search the list").press("Escape");

    // drill-thru without filter values and check the dropdown
    await getDashboardCard(page).getByText("Products", { exact: true }).click();
    await expect(queryBuilderHeader(page)).toBeVisible();
    await filterWidget(page).click();
    dropdown = popover(page);
    await expect(dropdown.getByText("Gadget", { exact: true })).toBeVisible();
    await dropdown.getByPlaceholder("Search the list").press("Escape");
    await queryBuilderHeader(page).getByLabel("Back to Dashboard").click();
    await expect(getDashboardCard(page)).toBeVisible();

    // add a filter value, drill-thru, and check the dropdown
    await filterWidget(page).click();
    dropdown = popover(page);
    await dropdown.getByText("Gadget", { exact: true }).click();
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await getDashboardCard(page).getByText("Products", { exact: true }).click();
    await expect(queryBuilderHeader(page)).toBeVisible();
    await filterWidget(page).click();
    await expect(
      popover(page).getByText("Widget", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 48524", () => {
  const questionDetails = {
    name: "15119",
    query: { "source-table": REVIEWS_ID },
  };

  const ratingFilter = {
    id: "5dfco74e",
    slug: "rating",
    name: "Rating",
    type: "string/=",
    sectionId: "string",
  };

  const reviewerFilter = {
    id: "ad1c877e",
    name: "Reviewer",
    slug: "reviewer",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [reviewerFilter, ratingFilter] };

  async function makeDashboard(api: MetabaseApi): Promise<number> {
    const dashcard = await createQuestionAndDashboard(api, {
      questionDetails,
      dashboardDetails,
    });
    await updateDashboardCards(api, {
      dashboard_id: dashcard.dashboard_id,
      cards: [
        {
          id: dashcard.id,
          card_id: dashcard.card_id,
          row: 0,
          col: 0,
          size_x: 12,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: ratingFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", REVIEWS.RATING, null]],
            },
            {
              parameter_id: reviewerFilter.id,
              card_id: dashcard.card_id,
              target: ["dimension", ["field", REVIEWS.REVIEWER, null]],
            },
          ],
        },
      ],
    });
    return dashcard.dashboard_id;
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not apply last used parameter values when some parameters have values set in the URL (metabase#48524)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await makeDashboard(mb.api);

    // open the dashboard with 2 parameters to populate their last used values
    await visitDashboardWithParams(page, mb.api, dashboardId, {
      [reviewerFilter.slug]: "abbey-heidenreich",
      [ratingFilter.slug]: 4,
    });
    await assertTableRowsCount(page, 1);

    // open the dashboard again and verify that the last used values are applied
    await visitDashboard(page, mb.api, dashboardId);
    await assertTableRowsCount(page, 1);

    // open the dashboard with only 1 parameter value and verify that the last
    // used values are not applied in this case
    await visitDashboardWithParams(page, mb.api, dashboardId, {
      [ratingFilter.slug]: 4,
    });
    await assertTableRowsCount(page, 535);
  });
});

test.describe("issue 32573", () => {
  const modelDetails = {
    name: "M1",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      fields: [["field", ORDERS.TAX, null]],
    },
  };

  const parameterDetails = {
    id: "92eb69ea",
    name: "ID",
    sectionId: "id",
    slug: "id",
    type: "id",
    default: 1,
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDetails(modelId: number) {
    return {
      name: "Q1",
      type: "question",
      query: {
        "source-table": `card__${modelId}`,
      },
    };
  }

  function getParameterMapping(questionId: number) {
    return {
      card_id: questionId,
      parameter_id: parameterDetails.id,
      target: ["dimension", ["field", "ID", { "base-type": "type/BigInteger" }]],
    };
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not crash a dashboard when there is a missing parameter column (metabase#32573)", async ({
    page,
    mb,
  }) => {
    const model = await createQuestion(mb.api, modelDetails);
    const question = await createQuestion(mb.api, getQuestionDetails(model.id));
    const { id: dashboardId } = await createDashboard(mb.api, dashboardDetails);
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        createMockDashboardCard({
          card_id: question.id,
          parameter_mappings: [getParameterMapping(question.id)],
          size_x: 6,
          size_y: 6,
        }),
      ],
    });
    await visitDashboard(page, mb.api, dashboardId);

    await expect(
      getDashboardCard(page).getByText(
        "There was a problem displaying this chart.",
        { exact: true },
      ),
    ).toBeVisible();

    await editDashboard(page);
    await page.getByTestId("fixed-width-filters").getByText("ID", { exact: true }).click();
    const card = getDashboardCard(page);
    await expect(card.getByText("Unknown Field", { exact: true })).toBeVisible();
    // The Disconnect ActionIcon is functional (its onClick is wired) but sits
    // inside the invalid-mapping button whose aria-disabled is true; Playwright
    // treats descendants of an aria-disabled ancestor as disabled and refuses
    // the click, while Cypress does not. Force to match the upstream click.
    await card.getByLabel("Disconnect").click({ force: true });
    await saveDashboard(page);
    await expect(card.getByText("Q1", { exact: true })).toBeVisible();
    await expect(card.getByText("Tax", { exact: true })).toBeVisible();
  });
});

// @external — needs the writable postgres QA database + many_data_types table.
test.describe("issue 45670", () => {
  const dialect = "postgres";
  const tableName = "many_data_types";

  const parameterDetails = {
    id: "92eb69ea",
    name: "boolean",
    type: "string/=",
    slug: "boolean",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDetails(fieldId: number) {
    return {
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT id, boolean FROM many_data_types WHERE {{boolean}}",
        "template-tags": {
          boolean: {
            id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
            name: "boolean",
            type: "dimension",
            "display-name": "Boolean",
            dimension: ["field", fieldId, null],
            "widget-type": "string/=",
          },
        },
      },
    };
  }

  function getParameterMapping(cardId: number) {
    return {
      card_id: cardId,
      parameter_id: parameterDetails.id,
      target: ["dimension", ["template-tag", parameterDetails.name]],
    };
  }

  test.beforeEach(async ({ mb }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the writable postgres QA database and its many_data_types table (set PW_QA_DB_ENABLED)",
    );
    await mb.restore(`${dialect}-writable`);
    await resetManyDataTypesTable();
    await mb.signInAsAdmin();
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: [tableName] });
  });

  test("should be able to pass query string parameters for boolean parameters in dashboards (metabase#45670)", async ({
    page,
    mb,
  }) => {
    const fieldId = await getManyDataTypesBooleanFieldId(mb.api, tableName);
    const { id: cardId } = await createNativeQuestion(
      mb.api,
      getQuestionDetails(fieldId),
    );
    const { id: dashboardId } = await createDashboard(mb.api, dashboardDetails);
    await mb.api.put(`/api/dashboard/${dashboardId}`, {
      dashcards: [
        createMockDashboardCard({
          card_id: cardId,
          parameter_mappings: [getParameterMapping(cardId)],
          size_x: 8,
          size_y: 8,
        }),
      ],
    });
    await visitDashboardWithParams(page, mb.api, dashboardId, {
      [parameterDetails.slug]: "true",
    });

    await expect(filterWidget(page)).toContainText("true");
    const card = getDashboardCard(page);
    await expect(card.getByText("true", { exact: true }).first()).toBeVisible();
    await expect(card.getByText("false", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 48351", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should navigate to the specified tab with click behaviors (metabase#48351)", async ({
    page,
    mb,
  }) => {
    const dashboard1 = (await createDashboardWithTabs(mb.api, {
      name: "Dashboard 1",
      tabs: [
        { id: 1, name: "Tab 1" },
        { id: 2, name: "Tab 2" },
      ],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 1,
          size_x: 8,
          size_y: 8,
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 2,
          col: 8,
          size_x: 8,
          size_y: 8,
        }),
      ],
    })) as unknown as { id: number; tabs: { id: number; name: string }[] };

    const dashboard2 = (await createDashboardWithTabs(mb.api, {
      name: "Dashboard 2",
      tabs: [
        { id: 3, name: "Tab 3" },
        { id: 4, name: "Tab 4" },
      ],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 3,
          size_x: 8,
          size_y: 8,
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 4,
          visualization_settings: {
            column_settings: {
              '["name","ID"]': {
                click_behavior: {
                  type: "link",
                  linkType: "dashboard",
                  targetId: dashboard1.id,
                  tabId: dashboard1.tabs[1].id,
                  parameterMapping: {},
                },
              },
            },
          },
          col: 8,
          size_x: 8,
          size_y: 8,
        }),
      ],
    })) as { id: number };

    await visitDashboard(page, mb.api, dashboard2.id);
    await page.getByRole("tab", { name: "Tab 4", exact: true }).click();
    await getDashboardCard(page).getByRole("gridcell").first().click();
    await expect(page.getByTestId("dashboard-name-heading")).toHaveValue(
      "Dashboard 1",
    );
    await assertTabSelected(page, "Tab 2");
  });
});

test.describe("issue 52484", () => {
  const questionDetails = {
    native: {
      query: "SELECT ID, RATING FROM PRODUCTS [[WHERE RATING = {{rating}}]]",
      "template-tags": {
        rating: {
          id: "56708d23-6f01-42b7-98ed-f930295d31b9",
          name: "rating",
          type: "number",
          "display-name": "Rating",
        },
      },
    },
    parameters: [
      {
        id: "56708d23-6f01-42b7-98ed-f930295d31b9",
        name: "Rating",
        slug: "rating",
        type: "number/=",
        target: ["dimension", ["template-tag", "rating"]],
      },
    ],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow to use click behaviors with numeric columns that are not database fields (metabase#52484)", async ({
    page,
    mb,
  }) => {
    const { dashboard_id } = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails,
    });
    await visitDashboard(page, mb.api, dashboard_id);

    // setup a dashboard with a click behavior
    await editDashboard(page);
    await setFilter(page, "Number", "Equal to");
    await selectDashboardFilter(getDashboardCard(page), "Rating");
    await dashboardParametersDoneButton(page).click();
    await showDashboardCardActions(page);
    await page.getByLabel("Click behavior").click();
    await sidebar(page).getByText("ID", { exact: true }).click();
    await sidebar(page).getByText("Update a dashboard filter", { exact: true }).click();
    await sidebar(page).getByText("Number", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await saveDashboard(page);

    // update a dashboard filter by clicking on a ID column value
    await getDashboardCard(page).getByText("2", { exact: true }).first().click();
    await expect(await findByDisplayValue(filterWidget(page), "2")).toBeVisible();

    // verify query results for the new filter
    const card = getDashboardCard(page);
    await expect(card.getByText("27", { exact: true }).first()).toBeVisible();
    await expect(card.getByText("123", { exact: true }).first()).toBeVisible();
  });
});

test.describe("issue 52627", () => {
  const questionDetails = {
    display: "bar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["avg", ["field", ORDERS.TOTAL, null]],
        ["avg", ["field", ORDERS.DISCOUNT, null]],
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  const parameterDetails = {
    name: "Category",
    slug: "category",
    id: "b6ed2d71",
    type: "string/=",
    sectionId: "string",
    default: ["Gadget"],
  };

  const parameterTarget = [
    "dimension",
    ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    { "stage-number": 0 },
  ];

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should remove an empty query stage after a dashboard drill-thru (metabase#52627)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      card_id: dashcard.card_id,
      card: {
        id: dashcard.id,
        parameter_mappings: [
          {
            card_id: dashcard.card_id,
            parameter_id: parameterDetails.id,
            target: parameterTarget,
          },
        ],
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await chartPathWithFillColor(page, "#A989C5").first().click();
    const datasetResponse = waitForDataset(page);
    await popover(page).getByText("See this month by week", { exact: true }).click();
    await datasetResponse;
    await expect(
      queryBuilderFiltersPanel(page).getByText("Product → Category is Gadget", {
        exact: true,
      }),
    ).toBeVisible();
    await summarize(page);
    await expect(
      rightSidebar(page).getByText("Average of Total", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 52918", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should re-position the parameter dropdown when its size changes (metabase#52918)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await setFilter(page, "Date picker", "All Options");
    await sidebar(page).getByText("No default", { exact: true }).click();
    const dropdown = popover(page).first();
    await dropdown.getByText("Fixed date range…", { exact: true }).click();
    await expect(dropdown.getByText("Between", { exact: true })).toBeVisible();

    // check that there is no overflow in the popover
    await expect
      .poll(() =>
        dropdown.evaluate(
          (element: HTMLElement) => element.offsetWidth >= element.scrollWidth,
        ),
      )
      .toBe(true);
  });
});

test.describe("issue 54236", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show correct date range in the date picker (metabase#54236)", async ({
    page,
    mb,
  }) => {
    await page.clock.setFixedTime(new Date("2028-02-26"));
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await setFilter(page, "Date picker", "All Options");
    await sidebar(page).getByText("No default", { exact: true }).click();
    const dropdown = popover(page).first();
    await dropdown.getByText("Relative date range…", { exact: true }).click();
    await dropdown.getByText("Next", { exact: true }).click();
    await (await findByDisplayValue(dropdown, "30")).fill("1");
    await page
      .getByRole("textbox", { name: "Unit", exact: true })
      .first()
      .click();
    await page.getByRole("listbox").getByText("quarter", { exact: true }).click();

    const updatedDropdown = popover(page).last();
    await icon(updatedDropdown, "arrow_left_to_line").click();
    await (await findByDisplayValue(updatedDropdown, "4")).fill("1");
    await expect(
      updatedDropdown.getByText("Jul 1 – Sep 30, 2028", { exact: true }),
    ).toBeVisible();
    await expect(
      updatedDropdown.getByText("Apr 1 – Jun 30, 2028", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 17061", () => {
  const questionDetails = {
    query: {
      "source-table": PEOPLE_ID,
      "order-by": [["asc", ["field", PEOPLE.ID, null]]],
      limit: 1,
    },
  };

  const parameterDetails = {
    name: "State",
    slug: "state",
    id: "5aefc725",
    type: "string/=",
    sectionId: "location",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  const getParameterMapping = (cardId: number) => ({
    parameter_id: parameterDetails.id,
    card_id: cardId,
    target: ["dimension", ["field", "STATE", { "base-type": "type/Text" }]],
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not send multiple query requests for the same dashcards when opening a public dashboard with parameters (metabase#17061)", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails,
      dashboardDetails,
    });
    const questionId = dashcard.card_id;
    await updateDashboardCards(mb.api, {
      dashboard_id: dashcard.dashboard_id,
      cards: [
        {
          card_id: questionId,
          parameter_mappings: [getParameterMapping(questionId)],
        },
      ],
    });

    const publicDashcardData = trackResponses(
      page,
      "GET",
      /^\/api\/public\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+$/,
    );
    await visitPublicDashboard(page, mb, dashcard.dashboard_id);

    await expect(
      getDashboardCard(page).getByText("1", { exact: true }),
    ).toBeVisible();
    // Settle beat so a duplicate dashcard query would be counted.
    await page.waitForTimeout(500);
    expect(publicDashcardData()).toBe(1);
  });
});

// TODO ranquild unskip after v54 release — upstream carries { tags: "@skip" }.
test.describe("issue 48824", () => {
  const dateParameter = {
    id: "abc",
    name: "Date filter",
    slug: "filter-date",
    type: "date/all-options",
    default: "past30days-from-7days",
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should correctly translate relative filters in dashboards (metabase#48824)", async ({
    page,
    mb,
  }) => {
    test.skip(true, "Upstream @skip tag (unskip after v54 release)");

    // set locale
    const user = (await (await mb.api.get("/api/user/current")).json()) as {
      id: number;
    };
    await mb.api.put(`/api/user/${user.id}`, { locale: "en-ZZ" });

    // add a date parameter with a relative default value to a dashboard
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [dateParameter],
    });
    await updateDashboardCards(mb.api, {
      dashboard_id: ORDERS_DASHBOARD_ID,
      cards: [
        {
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              card_id: ORDERS_QUESTION_ID,
              parameter_id: dateParameter.id,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        },
      ],
    });

    // check translations
    await visitDashboardWithParams(page, mb.api, ORDERS_DASHBOARD_ID, {
      [dateParameter.slug]: "past30days",
    });

    await expect(
      filterWidget(page).getByText("[zz] Previous 30 days", { exact: true }),
    ).toBeVisible();
    await icon(filterWidget(page), "revert").click();

    await expect(
      filterWidget(page).getByText(
        "[zz] Previous 30 days, [zz] starting 7 days ago",
        { exact: true },
      ),
    ).toBeVisible();
  });
});

test.describe("issue 62627", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  async function toggleLinkedFilter(page: Page, parameterName: string) {
    await page
      .getByRole("button", { name: parameterName, exact: true })
      .locator("..")
      .getByRole("switch")
      .click({ force: true });
  }

  test("should properly link inline parameters (metabase#62627)", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    // add a top-level filter
    await setFilter(page, "Text or Category", "Is");
    await selectDashboardFilter(getDashboardCard(page), "Vendor");
    await setDashboardParameterName(page, "Vendor");
    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // add an inline card filter
    await showDashboardCardActions(page);
    await getDashboardCard(page).hover();
    await getDashboardCard(page).getByLabel("Add a filter").click();
    await popover(page).getByText("Text or Category", { exact: true }).click();
    await selectDashboardFilter(getDashboardCard(page), "Category");
    await setDashboardParameterName(page, "Category");
    await dashboardParameterSidebar(page)
      .getByText("Linked filters", { exact: true })
      .click();
    await toggleLinkedFilter(page, "Vendor");
    await saveDashboard(page);

    // verify that the inline parameter is linked to the top-level parameter
    await dashboardParametersContainer(page)
      .getByTestId("parameter-widget")
      .click();
    let dropdown = popover(page);
    await dropdown.getByText("Balistreri-Muller", { exact: true }).click();
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await getDashboardCard(page).getByTestId("parameter-widget").click();
    dropdown = popover(page);
    await expect(dropdown.getByText("Widget", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("Gadget", { exact: true })).toHaveCount(0);

    // make the top-level parameter be linked to the inline parameter
    await editDashboard(page);
    await getDashboardCard(page).getByTestId("editing-parameter-widget").click();
    await dashboardParameterSidebar(page)
      .getByText("Linked filters", { exact: true })
      .click();
    await toggleLinkedFilter(page, "Vendor");
    await editingParametersContainer(page)
      .getByTestId("editing-parameter-widget")
      .click();
    await dashboardParameterSidebar(page)
      .getByText("Linked filters", { exact: true })
      .click();
    await toggleLinkedFilter(page, "Category");
    await saveDashboard(page);

    // verify that the top-level parameter is linked to the inline parameter
    await icon(
      dashboardParametersContainer(page).getByTestId("parameter-widget"),
      "close",
    ).click();
    await getDashboardCard(page).getByTestId("parameter-widget").click();
    dropdown = popover(page);
    await dropdown.getByText("Gadget", { exact: true }).click();
    await dropdown
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await dashboardParametersContainer(page)
      .getByTestId("parameter-widget")
      .click();
    dropdown = popover(page);
    await expect(dropdown.getByText("Barrows-Johns", { exact: true })).toBeVisible();
    await expect(
      dropdown.getByText("Americo Sipes and Sons", { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe("issue 55678", () => {
  const parameterDetails = {
    name: "date",
    slug: "date",
    id: "f8ec7c71",
    type: "date/all-options",
    sectionId: "date",
    default: "2020-01-01~2027-12-31",
  };

  const questionDetails = {
    name: "Orders",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
    display: "line",
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  async function setupDashboard(api: MetabaseApi): Promise<number> {
    const { id: card_id } = await createQuestion(api, questionDetails);
    const { id: dashboard_id } = await createDashboard(api, dashboardDetails);
    await addOrUpdateDashboardCard(api, {
      dashboard_id,
      card_id,
      card: {
        parameter_mappings: [
          {
            card_id,
            parameter_id: parameterDetails.id,
            target: [
              "dimension",
              ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
              { "stage-number": 1 },
            ],
          },
        ],
      },
    });
    return dashboard_id;
  }

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should ignore parameters mapped to post-aggregation stages when doing query drills (metabase#55678)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await setupDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);
    await cartesianChartCircles(page).first().click();
    await popover(page).getByText("See this Order", { exact: true }).click();
    await expect(
      queryBuilderFiltersPanel(page).getByText(
        "Created At: Month is Apr 1–30, 2025",
        { exact: true },
      ),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 1);
  });
});

// @external — needs the writable postgres QA database + many_data_types table
// (upstream forgot the @external tag; gated here anyway — it can't run without
// the QA DB).
test.describe("issue 14595", () => {
  const dialect = "postgres";
  const tableName = "many_data_types";

  async function makeDashboard(api: MetabaseApi): Promise<number> {
    const tableId = await getTableId(api, { name: tableName });
    const { dashboard } = await createDashboardWithQuestions(api, {
      dashboardDetails: {
        parameters: [
          createMockParameter({
            id: "p1",
            slug: "p1",
            name: "p1",
            type: "string/=",
            sectionId: "string",
          }),
          createMockParameter({
            id: "p2",
            slug: "p2",
            name: "p2",
            type: "string/=",
            sectionId: "string",
          }),
          createMockParameter({
            id: "p3",
            slug: "p3",
            name: "p3",
            type: "string/=",
            sectionId: "string",
          }),
        ],
      },
      questions: [
        {
          name: "Orders",
          query: { "source-table": ORDERS_ID },
        },
        {
          name: "Products",
          query: { "source-table": PRODUCTS_ID },
        },
        {
          name: "Many data types",
          database: WRITABLE_DB_ID,
          query: { "source-table": tableId },
        },
      ],
    });
    return dashboard.id;
  }

  async function mapParameters(page: Page) {
    await page.getByTestId("fixed-width-filters").getByText("p1", { exact: true }).click();
    await selectDashboardFilter(getDashboardCard(page, 0), "Source");
    await page.getByTestId("fixed-width-filters").getByText("p2", { exact: true }).click();
    await selectDashboardFilter(getDashboardCard(page, 1), "Category");
    await page.getByTestId("fixed-width-filters").getByText("p3", { exact: true }).click();
    await selectDashboardFilter(getDashboardCard(page, 2), "String");
  }

  async function assertLinkedFilterSettings(
    page: Page,
    {
      parameterName,
      compatibleParameterNames,
      incompatibleParameterNames,
    }: {
      parameterName: string;
      compatibleParameterNames: string[];
      incompatibleParameterNames: string[];
    },
  ) {
    await page
      .getByTestId("fixed-width-filters")
      .getByText(parameterName, { exact: true })
      .click();
    await sidebar(page).getByText("Linked filters", { exact: true }).click();
    for (const name of compatibleParameterNames) {
      await expect(
        sidebar(page)
          .getByTestId("compatible-parameters")
          .getByText(name, { exact: true }),
      ).toBeVisible();
    }
    for (const name of incompatibleParameterNames) {
      await expect(
        sidebar(page)
          .getByTestId("incompatible-parameters")
          .getByText(name, { exact: true }),
      ).toBeVisible();
    }
  }

  test.beforeEach(async ({ mb }) => {
    test.skip(
      !process.env.PW_QA_DB_ENABLED,
      "Requires the writable postgres QA database and its many_data_types table (set PW_QA_DB_ENABLED)",
    );
    await mb.restore(`${dialect}-writable`);
    await resetManyDataTypesTable();
    await mb.signInAsAdmin();
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID, tables: [tableName] });
  });

  test("should not see parameters that cannot be linked to the current parameter in parameter settings (metabase#14595)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await makeDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);
    await mapParameters(page);

    await assertLinkedFilterSettings(page, {
      parameterName: "p1",
      compatibleParameterNames: ["p2"],
      incompatibleParameterNames: ["p3"],
    });
    await assertLinkedFilterSettings(page, {
      parameterName: "p2",
      compatibleParameterNames: ["p1"],
      incompatibleParameterNames: ["p3"],
    });
    await assertLinkedFilterSettings(page, {
      parameterName: "p3",
      compatibleParameterNames: [],
      incompatibleParameterNames: ["p1", "p2"],
    });
  });
});

test.describe("issue 44090", () => {
  const parameterDetails = {
    name: "p1",
    slug: "string",
    id: "f8ec7c71",
    type: "string/=",
  };

  const questionDetails = {
    name: "Orders",
    query: {
      "source-table": REVIEWS_ID,
    },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const { id: card_id } = await createQuestion(mb.api, questionDetails);
    const { id: dashboard_id } = await createDashboard(mb.api, dashboardDetails);
    await addOrUpdateDashboardCard(mb.api, {
      dashboard_id,
      card_id,
      card: {
        parameter_mappings: [
          {
            card_id,
            parameter_id: parameterDetails.id,
            target: ["dimension", ["field", REVIEWS.BODY, {}]],
          },
        ],
      },
    });
    await visitDashboard(page, mb.api, dashboard_id);
  });

  async function addFilterAndAssertWidth(page: Page, longValue: string) {
    await filterWidget(page).click();
    const dropdown = popover(page).first();
    await dropdown.getByPlaceholder("Search the list").pressSequentially(longValue);
    await dropdown.getByRole("button", { name: "Add filter", exact: true }).click();

    const box = await filterWidget(page).first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThan(300);
  }

  test("should not overflow the dashboard header when a filter contains a long value that contains spaces (metabase#44090)", async ({
    page,
  }) => {
    await addFilterAndAssertWidth(
      page,
      "Minima non hic doloribus ipsa dolore ratione in numquam. Minima eos vel harum velit. Consequatur consequuntur culpa sed eum",
    );
  });

  test("should not overflow the dashboard header when a filter contains a long value that does not contain spaces (metabase#44090)", async ({
    page,
  }) => {
    await addFilterAndAssertWidth(
      page,
      "MinimanonhicdoloribusipsadolorerationeinnumquamMinimaeosvelharumvelitConsequaturconsequunturculpasedeum",
    );
  });
});

test.describe("issue 59306", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const parameter = {
      ...createMockParameter({
        id: "p1",
        slug: "p1",
        type: "string/=",
        sectionId: "string",
        default: undefined,
      }),
      values_query_type: "none",
    };

    const { dashboard, questions } = await createDashboardWithQuestions(mb.api, {
      dashboardDetails: {
        parameters: [parameter],
      },
      questions: [{ name: "q1", query: { "source-table": PRODUCTS_ID } }],
    });
    const [card] = questions;
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: card.id,
          parameter_mappings: [
            {
              card_id: card.id,
              parameter_id: parameter.id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              has_field_values: "input",
            },
          ],
        },
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);
  });

  test("should not overflow the filter box (metabase#59306)", async ({
    page,
  }) => {
    await filterWidget(page).click();
    const input = popover(page).getByPlaceholder("Enter some text");
    await input.pressSequentially("asdf".repeat(20));
    await expect
      .poll(() => input.evaluate((element: HTMLElement) => element.offsetWidth))
      .toBeLessThan(400);
  });
});

test.describe("Issue 60987", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  PRODUCTS.ID,
                  { "base-type": "type/BigInteger", "join-alias": "Products" },
                ],
              ],
            },
          ],
        },
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);
  });

  test("should show the empty state for parameters when searching the in the parameter target picker popover (metabase#60987)", async ({
    page,
  }) => {
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await getDashboardCard(page).getByText("Select…", { exact: true }).click();
    await popover(page).getByPlaceholder("Find...").pressSequentially("aa");
    await expect(
      popover(page).getByText("Didn't find any results", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("Issue 60987", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  PRODUCTS.ID,
                  { "base-type": "type/BigInteger", "join-alias": "Products" },
                ],
              ],
            },
          ],
        },
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await getDashboardCard(page).getByText("Select…", { exact: true }).click();
  });

  // Upstream declares two identical `describe("Issue 60987")` blocks with the
  // same test title; Playwright forbids duplicate title combos, so this one —
  // the variant that also checks the empty-state text color — is suffixed.
  test("should show the empty state for parameters when searching the in the parameter target picker popover, with the text-medium color (metabase#60987)", async ({
    page,
  }) => {
    const dropdown = popover(page);
    await dropdown.getByPlaceholder("Find...").pressSequentially("aa");
    const emptyState = dropdown.getByText("Didn't find any results", {
      exact: true,
    });
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toHaveCSS("color", "rgba(7, 23, 34, 0.62)"); // "text-medium"
  });
});

test.describe("Issue 46767", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  PRODUCTS.ID,
                  { "base-type": "type/BigInteger", "join-alias": "Products" },
                ],
              ],
            },
          ],
        },
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await getDashboardCard(page).getByText("Select…", { exact: true }).click();
  });

  test("search results for parameter target picker should not show empty sections (metabase#46767)", async ({
    page,
  }) => {
    const dropdown = popover(page);
    await dropdown.getByPlaceholder("Find...").pressSequentially("Ean");
    await expect(dropdown.getByText("Products", { exact: true })).toBeVisible();
    await expect(dropdown.getByText("User", { exact: true })).toHaveCount(0);
  });
});

test.describe("issue 46541", () => {
  const TARGET_FILTER = {
    name: "Target filter",
    slug: "target-filter",
    id: "ffa421da",
    type: "number/>=",
    sectionId: "number",
  };

  const OTHER_FILTER = {
    name: "Other filter",
    slug: "other-filter",
    id: "dfaa3356",
    type: "number/>=",
    sectionId: "number",
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    const dashboardA = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: "Dashboard A",
      },
    });

    const dashboardB = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: "Dashboard B",
        parameters: [TARGET_FILTER, OTHER_FILTER],
      },
    });

    await updateDashboardCards(mb.api, {
      dashboard_id: dashboardB.dashboard_id,
      cards: [
        {
          card_id: dashboardB.card_id,
          parameter_mappings: [
            {
              parameter_id: TARGET_FILTER.id,
              card_id: dashboardB.card_id,
              target: ["dimension", ["field", ORDERS.TOTAL, null]],
            },
            {
              parameter_id: OTHER_FILTER.id,
              card_id: dashboardB.card_id,
              target: ["dimension", ["field", ORDERS.SUBTOTAL, null]],
            },
          ],
        },
      ],
    });

    // Set parameter value on Dashboard B
    await visitDashboard(page, mb.api, dashboardB.dashboard_id);
    await filterWidget(page, { name: OTHER_FILTER.name }).click();
    let dropdown = popover(page);
    await dropdown.getByPlaceholder("Enter a number").pressSequentially("10");
    await dropdown.getByRole("button", { name: "Add filter", exact: true }).click();

    // Set up click behaviour on Dashboard A
    await visitDashboard(page, mb.api, dashboardA.dashboard_id);
    await editDashboard(page);

    await showDashboardCardActions(page);
    await page.getByLabel("Click behavior").click();

    await sidebar(page).getByText("Tax", { exact: true }).click();
    await sidebar(page).getByText("Go to a custom destination", { exact: true }).click();
    await sidebar(page).getByText("Dashboard", { exact: true }).click();

    await entityPickerModal(page).getByText("Our analytics", { exact: true }).click();
    await entityPickerModal(page).getByText("Dashboard B", { exact: true }).click();

    await sidebar(page).getByText(TARGET_FILTER.name, { exact: true }).click();
    await popover(page).getByText("Tax", { exact: true }).click();
    await saveDashboard(page);
  });

  test("should reset other filters when coming to a dashboard from a click action with a filter (metabase#46541)", async ({
    page,
  }) => {
    // Navigate from Dashboard A to Dashboard B with a click action
    await tableInteractiveBody(page).getByText("2.07", { exact: true }).first().click();

    await expect(filterWidget(page, { name: TARGET_FILTER.name })).toContainText(
      "2.07",
    );
    await expect(
      filterWidget(page, { name: OTHER_FILTER.name }),
    ).not.toContainText("10");
  });
});

test.describe("issue 46372", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not show a scrollbar when auto-connecting a dashcard filter (metabase#46372)", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [
        { name: "Question A", query: { "source-table": PRODUCTS_ID } },
        { name: "Question B", query: { "source-table": PRODUCTS_ID } },
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);
    await editDashboard(page);

    await setFilter(page, "Text or Category", "Is");
    await selectDashboardFilter(page.getByTestId("dashcard").first(), "Title");
    await undoToast(page).getByRole("button", { name: "Auto-connect" }).click();

    await expect(
      main(page).getByText("Auto-connected", { exact: true }),
    ).toBeVisible();
    const container = main(page)
      .getByText("Auto-connected", { exact: true })
      .locator("../..");
    await expect
      .poll(() =>
        container.evaluate(
          (element: HTMLElement) => element.scrollHeight === element.offsetHeight,
        ),
      )
      .toBe(true);
  });
});

test.describe("issue 49319", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should ignore parameters that not exist in the saved dashboard in edit mode (metabase#49319)", async ({
    page,
    mb,
  }) => {
    // open an existing dashboard
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    // add a parameter and save the dashboard
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await selectDashboardFilter(getDashboardCard(page), "Vendor");
    await saveDashboard(page);

    // add another parameter to the dashboard with a default value
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await selectDashboardFilter(getDashboardCard(page), "Category");
    await dashboardParameterSidebar(page).getByText("No default", { exact: true }).click();
    let dropdown = popover(page);
    await dropdown.getByText("Gadget", { exact: true }).click();
    await dropdown.getByRole("button", { name: "Add filter", exact: true }).click();
    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // change the value for the saved parameter
    await page.getByTestId("fixed-width-filters").getByText("Text", { exact: true }).click();
    await dashboardParameterSidebar(page).getByText("No default", { exact: true }).click();
    dropdown = popover(page);
    await dropdown.getByText("Americo Sipes and Sons", { exact: true }).click();
    await dropdown.getByText("Barrows-Johns", { exact: true }).click();
    await dropdown.getByRole("button", { name: "Add filter", exact: true }).click();
    await dashboardParameterSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // the unsaved parameter should be ignored in edit mode
    await assertTableRowsCount(page, 179);

    // both parameters should be applied when the dashboard is saved
    await saveDashboard(page);
    await assertTableRowsCount(page, 82);
  });
});

test.describe("issue #66670", () => {
  const questionA = {
    name: "Question A",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 10,
    },
  };

  const questionB = {
    name: "Question B",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should handle dashboard filter with permanently deleted question value source (metabase#66670)", async ({
    page,
    mb,
  }) => {
    // Step 1: Create a new dashboard
    const { id: dashboardId } = await createDashboard(mb.api, {
      name: "Test Dashboard UXW-2494",
    });

    // Step 2: Add Question A to the dashboard
    const { id: questionAId } = await createQuestion(mb.api, questionA);
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboardId,
      cards: [
        {
          card_id: questionAId,
          row: 0,
          col: 0,
          size_x: 12,
          size_y: 8,
        },
      ],
    });

    // Step 3: Create Question B (not added to dashboard)
    const { id: questionBId } = await createQuestion(mb.api, questionB);

    // Step 4: Edit dashboard, add filter with Question B as value source
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");

    // Map filter to Question A
    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    // Set filter value source to Question B
    await setFilterQuestionSource(page, {
      question: questionB.name,
      field: "Category",
    });

    // Step 5: Save the dashboard
    let updateDashboard = waitForResponseMatching(page, "PUT", /^\/api\/dashboard\/\d+$/);
    await saveDashboard(page);
    await updateDashboard;

    // Step 5b: Update the title and save again
    await editDashboard(page);
    const titleInput = await findByDisplayValue(
      page.getByTestId("dashboard-header"),
      "Test Dashboard UXW-2494",
    );
    await titleInput.click();
    await titleInput.press("ControlOrMeta+a");
    await titleInput.pressSequentially("Updated Dashboard Title");
    await titleInput.blur();
    updateDashboard = waitForResponseMatching(page, "PUT", /^\/api\/dashboard\/\d+$/);
    await saveDashboard(page);
    await updateDashboard;

    // Step 6: Move Question B to the trash
    await visitQuestion(page, questionBId);
    await openQuestionActions(page);
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await modal(page).getByText("Move to trash", { exact: true }).click();

    // Step 8: Revert dashboard to earlier version where filter used Question B
    await visitDashboard(page, mb.api, dashboardId);
    // Register before opening the sidebar: the revision fetch can fire on
    // sidebar-open rather than on the History-tab click.
    const revisionHistory = waitForResponseMatching(page, "GET", /^\/api\/revision$/);
    await openDashboardInfoSidebar(page);
    await sidesheet(page).getByRole("tab", { name: "History", exact: true }).click();
    await revisionHistory;
    // Click revert on the version that added the filter with Question B source
    await sidesheet(page)
      .getByTestId("dashboard-history-list")
      .getByLabel(/revert to You edited this/i)
      .first()
      .click();
    // Close sidesheet
    await sidesheet(page).getByLabel("Close").click();

    // Step 9: Permanently delete Question B from trash
    await mb.api.fetch("DELETE", `/api/card/${questionBId}`);

    // Step 10: Try to add another filter and save → Save succeeds
    await editDashboard(page);
    await setFilter(page, "Number");
    await page.getByText("Select…", { exact: true }).click();
    await popover(page).getByText("Price", { exact: true }).click();

    const saveResponse = waitForResponseMatching(
      page,
      "PUT",
      new RegExp(`^/api/dashboard/${dashboardId}$`),
    );
    await page.getByTestId("edit-bar").getByRole("button", { name: "Save", exact: true }).click();
    const saved = await saveResponse;
    expect(saved.status()).toBe(200);

    // Step 11: Edit existing filter, click Edit → modal loads
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);
    await filterWidget(page, { isEditing: true }).first().click();
    await dashboardParameterSidebar(page).getByText("Edit", { exact: true }).click();

    const dialog = modal(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Where values should come from", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      dialog.getByText("From connected fields", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("From another model or question", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Custom list", { exact: true })).toBeVisible();
  });
});
