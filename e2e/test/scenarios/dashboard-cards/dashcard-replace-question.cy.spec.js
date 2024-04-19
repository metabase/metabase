import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  saveDashboard,
  modal,
  popover,
  restore,
  visitDashboard,
  findDashCardAction,
  resetSnowplow,
  enableTracking,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  entityPickerModal,
} from "e2e/support/helpers";
import {
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const PARAMETER = {
  DATE: createMockParameter({
    id: "1",
    name: "Created At",
    type: "date/all-options",
    sectionId: "date",
  }),
  CATEGORY: createMockParameter({
    id: "2",
    name: "Category",
    type: "string/=",
  }),
  UNUSED: createMockParameter({
    id: "3",
    name: "Not mapped to anything",
    type: "number/=",
    sectionId: "number",
  }),

  // Used to reproduce:
  // https://github.com/metabase/metabase/issues/36984
  DATE_2: createMockParameter({
    id: "2",
    name: "Created At (2)",
    type: "date/range",
    sectionId: "date",
  }),
};

const DASHBOARD_CREATE_INFO = {
  parameters: Object.values(PARAMETER),
};

// Question to be used as a reference for filters auto-wiring
const MAPPED_QUESTION_CREATE_INFO = {
  name: "Question with mapped parameters",
  query: { "source-table": PRODUCTS_ID },
};

const NEXT_QUESTION_CREATE_INFO = {
  name: "Next question",
  collection_id: FIRST_COLLECTION_ID,
  query: { "source-table": PRODUCTS_ID },
};

function getDashboardCards(mappedQuestionId) {
  const mappedQuestionDashcard = createMockDashboardCard({
    id: 2,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: PARAMETER.DATE.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
      },
      {
        parameter_id: PARAMETER.DATE_2.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
      },
      {
        parameter_id: PARAMETER.CATEGORY.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 1,
    size_x: 6,
    size_y: 4,
  });

  const targetDashcard = createMockDashboardCard({
    id: 3,
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 1,
    col: 6,
    size_x: 6,
    size_y: 4,
  });

  return [
    createMockHeadingDashboardCard({ id: 1, size_x: 24 }),
    mappedQuestionDashcard,
    targetDashcard,
  ];
}

describeWithSnowplow("scenarios > dashboard cards > replace question", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.createQuestion(MAPPED_QUESTION_CREATE_INFO).then(
      ({ body: { id: mappedQuestionId } }) => {
        cy.createQuestion(NEXT_QUESTION_CREATE_INFO).then(() => {
          cy.createDashboard(DASHBOARD_CREATE_INFO).then(
            ({ body: { id: dashboardId } }) => {
              cy.request("PUT", `/api/dashboard/${dashboardId}`, {
                dashcards: getDashboardCards(mappedQuestionId),
              }).then(() => {
                cy.wrap(dashboardId).as("dashboardId");
              });
            },
          );
        });
      },
    );
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should replace a dashboard card question (metabase#36984)", () => {
    visitDashboardAndEdit();

    findDashCardAction(findHeadingDashcard(), "Replace").should("not.exist");

    // Ensure can replace with a question
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Next question",
      collectionName: "First collection",
    });
    expectGoodSnowplowEvent({ event: "dashboard_card_replaced" });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Next question");
      cy.findByText("Ean").should("exist");
      cy.findByText("Rustic Paper Wallet").should("exist");
    });

    // Ensure can replace with a model
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders Model",
      tab: "Models",
    });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders Model");
      cy.findByText("Product ID").should("exist");
      cy.findByText("User ID").should("exist");
    });

    // Ensure changes are persisted
    saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders Model");
      cy.findByText("Product ID").should("exist");
      cy.findByText("User ID").should("exist");
    });
  });

  it("should undo the question replace action", () => {
    visitDashboardAndEdit();

    overwriteDashCardTitle(findTargetDashcard(), "Custom name");
    connectDashboardFilter(findTargetDashcard(), {
      filterName: PARAMETER.UNUSED.name,
      columnName: "Discount",
    });

    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Next question",
      collectionName: "First collection",
    });

    // There're two toasts: "Undo replace" and "Undo parameters auto-wiring"
    cy.findAllByTestId("toast-undo").eq(0).button("Undo").click();

    // Ensure we kept viz settings and parameter mapping changes from before
    findTargetDashcard().within(() => {
      assertDashCardTitle("Custom name");
      cy.findByText("18,760").should("exist");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Rustic Paper Wallet").should("not.exist");
    });
    assertDashboardFilterMapping(findTargetDashcard(), {
      filterName: PARAMETER.UNUSED.name,
      expectedColumName: "Order.Discount",
    });

    // Ensure changes are persisted
    saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Custom name");
      cy.findByText("18,760").should("exist");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Rustic Paper Wallet").should("not.exist");
    });
  });

  it("should handle questions with limited permissions", () => {
    cy.signInAsAdmin();
    cy.updateCollectionGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
    });

    cy.signIn("nodata");
    visitDashboardAndEdit();

    // Replacing with a read-only question with limited data perms
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Next question",
      collectionName: "First collection",
    });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Next question");
      cy.findByText("Ean").should("exist");
      cy.findByText("Rustic Paper Wallet").should("exist");
    });

    // Ensure changes are persisted
    saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Next question");
      cy.findByText("Ean").should("exist");
      cy.findByText("Rustic Paper Wallet").should("exist");
    });
  });
});

function visitDashboardAndEdit() {
  visitDashboard("@dashboardId");
  cy.findByLabelText("Edit dashboard").click();
}

function findHeadingDashcard() {
  return cy.findAllByTestId("dashcard").eq(0);
}

function findTargetDashcard() {
  return cy.findAllByTestId("dashcard").eq(2);
}

function replaceQuestion(
  dashcardElement,
  { nextQuestionName, collectionName, tab },
) {
  dashcardElement.realHover().findByLabelText("Replace").click();
  entityPickerModal().within(() => {
    if (tab) {
      cy.findByRole("tablist").findByText(tab).click();
    }
    if (collectionName) {
      cy.findByText(collectionName).click();
    }
    cy.findByText(nextQuestionName).click();
  });
  cy.wait("@cardQuery");
}

function assertDashCardTitle(title) {
  cy.findByTestId("legend-caption-title").should("have.text", title);
}

function overwriteDashCardTitle(dashcardElement, textTitle) {
  findDashCardAction(dashcardElement, "Show visualization options").click();
  modal().within(() => {
    cy.findByLabelText("Title").type(`{selectall}{del}${textTitle}`);
    cy.button("Done").click();
  });
}

function connectDashboardFilter(dashcardElement, { filterName, columnName }) {
  const filterPanel = cy.findByTestId(
    "edit-dashboard-parameters-widget-container",
  );
  filterPanel.findByText(filterName).click();
  dashcardElement.button(/Select/).click();
  popover().findByText(columnName).click();
  filterPanel.findByText(filterName).click();
}

function assertDashboardFilterMapping(
  dashcardElement,
  { filterName, expectedColumName },
) {
  const filterPanel = cy.findByTestId(
    "edit-dashboard-parameters-widget-container",
  );
  filterPanel.findByText(filterName).click();
  dashcardElement.findByText(expectedColumName).should("exist");
  filterPanel.findByText(filterName).click();
}
