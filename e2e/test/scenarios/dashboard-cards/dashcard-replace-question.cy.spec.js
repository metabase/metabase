const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
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

describe("scenarios > dashboard cards > replace question", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.createQuestion(MAPPED_QUESTION_CREATE_INFO).then(
      ({ body: { id: mappedQuestionId } }) => {
        H.createQuestion(NEXT_QUESTION_CREATE_INFO).then(() => {
          H.createDashboard(DASHBOARD_CREATE_INFO).then(
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
    H.expectNoBadSnowplowEvents();
  });

  it("should replace a dashboard card question (metabase#36984)", () => {
    visitDashboardAndEdit();

    findHeadingDashcard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Replace")
      .should("not.exist");

    // Ensure can replace with a question
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders",
    });
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_card_replaced" });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders");
      cy.findByText("Product ID").should("exist");
    });

    // Ensure can replace with a model
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders Model",
    });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders Model");
      cy.findByText("Product ID").should("exist");
      cy.findByText("User ID").should("exist");
    });

    // Ensure changes are persisted
    H.saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders Model");
      cy.findByText("Product ID").should("exist");
      cy.findByText("User ID").should("exist");
    });
  });

  it("should undo the question replace action", () => {
    visitDashboardAndEdit();

    overwriteDashCardTitle("Custom name");
    connectDashboardFilter(findTargetDashcard(), {
      filterName: PARAMETER.UNUSED.name,
      columnName: "Discount",
    });

    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders",
    });

    // There're two toasts: "Undo replace" and "Auto-connect"
    H.undoToastList()
      .should("have.length", 2)
      .eq(0)
      .should(($el) => {
        // we wait for element to take its position after animation
        expect($el.position().left).to.be.equal(0);
      })
      .button("Undo")
      .click();

    // Ensure we kept viz settings and parameter mapping changes from before
    findTargetDashcard().within(() => {
      assertDashCardTitle("Custom name");
      cy.findByText("18,760").should("exist");
      cy.findByText("Ean").should("not.exist");
      cy.findByText("Rustic Paper Wallet").should("not.exist");
    });
    assertDashboardFilterMapping(findTargetDashcard(), {
      filterName: PARAMETER.UNUSED.name,
      expectedColumName: "Orders.Discount",
    });

    // Ensure changes are persisted
    H.saveDashboard();
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
    H.saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Next question");
      cy.findByText("Ean").should("exist");
      cy.findByText("Rustic Paper Wallet").should("exist");
    });
  });
});

function visitDashboardAndEdit() {
  H.visitDashboard("@dashboardId");
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
  { nextQuestionName, collectionName },
) {
  dashcardElement.realHover().findByLabelText("Replace").click();
  H.entityPickerModal().within(() => {
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

function overwriteDashCardTitle(textTitle) {
  findTargetDashcard()
    .realHover({ scrollBehavior: "bottom" })
    .findByLabelText("Show visualization options")
    .click();
  H.modal().within(() => {
    cy.findByLabelText("Title").type(`{selectall}{del}${textTitle}`).blur();
    cy.button("Done").click();
  });
}

const filterPanel = () =>
  cy.findByTestId("edit-dashboard-parameters-widget-container");

function connectDashboardFilter(dashcardElement, { filterName, columnName }) {
  filterPanel().findByText(filterName).click();
  dashcardElement.button(/Select/).click();
  H.popover().findByText(columnName).click();
  filterPanel().findByText(filterName).click();
}

function assertDashboardFilterMapping(
  dashcardElement,
  { filterName, expectedColumName },
) {
  filterPanel().findByText(filterName).click();
  dashcardElement.findByText(expectedColumName).should("exist");
  filterPanel().findByText(filterName).click();
}
