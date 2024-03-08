import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { restore } from "e2e/support/helpers";

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

    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
    cy.intercept("DELETE", "/api/dashboard/*").as("deleteDashboard");
    cy.intercept("DELETE", "/api/collection/*").as("deleteCollection");
    cy.intercept("DELETE", "/api/card/*").as("deleteQuestion");

    cy.log("Test individual archive and undo");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`)
      .findByText(`${DASHBOARD_NAME}`)
      .realHover()
      .findByLabelText("unarchive icon")
      .click();
    cy.wait("@updateDashboard");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("not.exist");

    cy.findByTestId("toast-undo").findByText("Undo").click();
    cy.wait("@updateDashboard");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("exist");

    cy.log("Test bulk archive and undo");
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).within(() => {
      cy.findByLabelText("archive-item-swapper").realHover().click();
      cy.get("input").should("be.checked");
    });

    cy.findByTestId("bulk-action-bar", { timeout: 5000 })
      .should("be.visible")
      .within(() => {
        cy.findByLabelText("bulk-actions-input").click();
        cy.findByText("Unarchive").click();
        cy.wait(["@updateDashboard", "@updateCollection", "@updateQuestion"]);
      });

    cy.get("main").findByText("Items you archive will appear here.");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("not.exist");
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).should("not.exist");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("not.exist");

    cy.findByTestId("toast-undo").findByText("Undo").click();
    cy.wait(["@updateDashboard", "@updateCollection", "@updateQuestion"]);
    cy.get("main")
      .findByText("Items you archive will appear here.")
      .should("not.exist");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("exist");

    cy.log("test individual delete");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`)
      .findByText(`${DASHBOARD_NAME}`)
      .realHover()
      .findByLabelText("trash icon")
      .click();
    cy.wait("@deleteDashboard");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${DASHBOARD_NAME}`).should("not.exist");

    cy.findByTestId("toast-undo").should("not.exist");

    cy.log(
      "Make sure we don't offer to delete archived collections (metabase#33996)",
    );
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`)
      .as("archivedCollection")
      .findByLabelText("unarchive icon")
      .should("exist");
    cy.get("@archivedCollection")
      .findByLabelText("trash icon")
      .should("not.exist");

    cy.log("test bulk delete");
    cy.get("@archivedCollection")
      .findByLabelText("archive-item-swapper")
      .realHover()
      .click();

    cy.findByTestId("bulk-action-bar", { timeout: 5000 })
      .should("be.visible")
      .within(() => {
        cy.findByLabelText("bulk-actions-input").click();
        cy.findByText("2 items selected");
        cy.button("Delete").click();
      });
    cy.wait("@deleteQuestion");

    cy.log("Cannot delete collections");
    cy.findByTestId(`archive-item-${COLLECTION_NAME}`).should("exist");
    cy.findByTestId(`archive-item-${QUESTION_NAME}`).should("not.exist");
  });

  it("should hide read-only archived items (metabase#24018)", () => {
    const READ_ONLY_NAME = "read-only dashboard";
    const CURATEABLE_NAME = "curate-able dashboard";

    // setup archive with read-only collection items
    createAndArchiveDashboard({
      name: READ_ONLY_NAME,
      collection_id: null,
    });

    // setup archive with curate-able collection items (user created items)
    cy.signIn("readonly");

    createAndArchiveDashboard({
      name: CURATEABLE_NAME,
      collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
    });

    // assert on desired behavior for read-only user
    cy.visit("/archive");

    cy.get("main").within(() => {
      cy.findByText(READ_ONLY_NAME).should("not.exist");
      cy.findByText(CURATEABLE_NAME).should("be.visible");
    });

    // assert on desired behavior for admin user
    cy.signInAsAdmin();
    cy.visit("/archive");

    cy.get("main").within(() => {
      cy.findByText(READ_ONLY_NAME).should("be.visible");
      cy.findByText(CURATEABLE_NAME).should("be.visible");
    });
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

    cy.findByTestId("scroll-container").scrollTo("bottom");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Item 40");
  });

  it("shows correct page when visiting page of question that was in archived collection (metabase##23501)", () => {
    const questionDetails = getQuestionDetails(FIRST_COLLECTION_ID);

    cy.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      cy.request("PUT", `/api/collection/${FIRST_COLLECTION_ID}`, {
        archived: true,
      });

      // Question belonging to collection
      // will have been archived,
      // and archived page should be displayed
      cy.visit(`/question/${questionId}`);
      cy.findByText("This question has been archived");
    });
  });
});

function createAndArchiveDashboard({ name, collection_id }) {
  cy.request("POST", "/api/dashboard/", {
    name: name,
    collection_id: collection_id,
  }).then(({ body: { id: dashboardId } }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, { archived: true });
  });
}
