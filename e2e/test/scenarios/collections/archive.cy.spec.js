import { getCollectionIdFromSlug, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const getQuestionDetails = collectionId => ({
  name: "A question",
  query: { "source-table": PEOPLE_ID },
  collection_id: collectionId,
});

describe("scenarios > collections > archive", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow user to unarchive, delete, and undo archive of items", () => {
    const DASHBOARD_NAME = "ARCHIVED DASHBOARD";

    cy.createDashboard({
      name: DASHBOARD_NAME,
      dashboardDetails: { collection_id: null },
    }).then(({ body: { id } }) => {
      cy.archiveDashboard(id);
    });

    const COLLECTION_NAME = "ARCHIVED COLLECTION";
    cy.createCollection({
      name: COLLECTION_NAME,
    }).then(({ body: { id } }) => {
      cy.archiveCollection(id);
    });

    const QUESTION_NAME = "ARCHIVED QUESTION";
    cy.createQuestion({
      name: QUESTION_NAME,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        ],
      },
    }).then(({ body: { id } }) => {
      cy.archiveQuestion(id);
    });

    cy.visit("/archive");

    // test individual archive and undo
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`)
      .findByText(`${DASHBOARD_NAME}`)
      .realHover()
      .findByLabelText("unarchive icon")
      .click();
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("not.exist");

    cy.findByTestId("toast-undo").findByText("Undo").click();
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("exist");

    // test bulk archive and undo
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).within(() => {
      cy.findByLabelText("archive-item-swapper").realHover().click();
    });

    cy.findByTestId("bulk-action-bar", { timeout: 5000 }).should("be.visible");
    cy.findByTestId("bulk-action-bar").within(() => {
      cy.findByLabelText("bulk-actions-input").click();
      cy.findByText("Unarchive").click();
    });

    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("not.exist");
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).should("not.exist");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("not.exist");

    cy.findByTestId("toast-undo").findByText("Undo").click();
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("exist");

    // test individual delete
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`)
      .findByText(`${DASHBOARD_NAME}`)
      .realHover()
      .findByLabelText("trash icon")
      .click();
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("not.exist");

    cy.findByTestId("toast-undo").should("not.exist");

    // test bulk delete
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`)
      .findByLabelText("archive-item-swapper")
      .realHover()
      .click();

    cy.findByTestId("bulk-action-bar", { timeout: 5000 }).should("be.visible");
    cy.findByTestId("bulk-action-bar").within(() => {
      cy.findByLabelText("bulk-actions-input").click();
      cy.findByText("Delete").click();
    });

    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).should("exist"); // cannot delete collections
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("not.exist");
  });

  it("should load initially hidden archived items on scroll (metabase#24213)", () => {
    const stubbedItems = Array.from({ length: 50 }, (v, i) => ({
      name: "Item " + i,
      id: i + 1,
      model: "card",
    }));

    cy.intercept("GET", "/api/search?archived=true", req => {
      req.reply({
        statusCode: 200,
        body: {
          data: stubbedItems,
        },
      });
    });

    cy.visit("/archive");

    cy.get("main").scrollTo("bottom");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Item 40");
  });

  it("shows correct page when visiting page of question that was in archived collection (metabase##23501)", () => {
    getCollectionIdFromSlug("first_collection", collectionId => {
      const questionDetails = getQuestionDetails(collectionId);

      cy.createQuestion(questionDetails).then(
        ({ body: { id: questionId } }) => {
          cy.request("PUT", `/api/collection/${collectionId}`, {
            archived: true,
          });

          // Question belonging to collection
          // will have been archived,
          // and archived page should be displayed
          cy.visit(`/question/${questionId}`);
          cy.findByText("This question has been archived");
        },
      );
    });
  });
});
