import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  setTokenFeatures,
  popover,
  describeEE,
  modal,
  visitDashboard,
  visitModel,
  visitQuestion,
  tableHeaderClick,
  onlyOnOSS,
  onlyOnEE,
  newButton,
  sidebar,
} from "e2e/support/helpers";

const ANALYTICS_COLLECTION_NAME = "Metabase analytics";
const CUSTOM_REPORTS_COLLECTION_NAME = "Custom reports";
const PEOPLE_MODEL_NAME = "People";
const METRICS_DASHBOARD_NAME = "Metabase metrics";

describeEE("scenarios > Metabase Analytics Collection (AuditV2) ", () => {
  describe("admin", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/field/*/values").as("fieldValues");
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      cy.intercept("POST", "api/card").as("saveCard");
      cy.intercept("POST", "api/dashboard/*/copy").as("copyDashboard");

      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("allows admins to see the instance analytics collection content", () => {
      visitCollection(ANALYTICS_COLLECTION_NAME);
      cy.findByTestId("pinned-items")
        .findByText(PEOPLE_MODEL_NAME)
        .scrollIntoView()
        .click();

      cy.wait("@datasetQuery");

      cy.findByTestId("TableInteractive-root").within(() => {
        cy.findByTextEnsureVisible("admin@metabase.test");
        cy.findByTextEnsureVisible("Robert Tableton");
        cy.findByTextEnsureVisible("Read Only Tableton");
      });
    });

    it(
      "should default to saving audit content in custom reports collection",
      { requestTimeout: 15000 },
      () => {
        cy.log("saving edited question");
        getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then(id => {
          visitModel(id);
        });

        tableHeaderClick("Last Name");

        popover().findByText("Filter by this column").click();
        cy.wait("@fieldValues");
        popover().findByText("Tableton").click();
        popover().button("Add filter").click();

        cy.wait("@datasetQuery");

        cy.findByTestId("question-row-count").findByText("Showing 6 rows");

        cy.findByTestId("qb-header").findByText("Save").click();

        cy.findByTestId("save-question-modal").within(modal => {
          cy.findByTestId("collection-picker-button").findByText(
            "Custom reports",
          );
          cy.findByText("Save").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
        });

        cy.button("Not now").click();

        cy.log("saving copied question");

        getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then(id => {
          visitModel(id);
        });

        cy.findByTestId("qb-header").icon("ellipsis").click();

        popover().findByText("Duplicate").click();

        modal().within(() => {
          cy.findByTextEnsureVisible("Custom reports");
          cy.button("Duplicate").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
        });

        modal()
          .button(/Duplicate/i)
          .should("not.exist");
        modal().button("Not now").click();

        cy.log("saving copied dashboard");

        getItemId(ANALYTICS_COLLECTION_NAME, "Person overview").then(id => {
          visitDashboard(id);
        });

        cy.findByTestId("dashboard-header").findByText("Make a copy").click();

        modal().within(() => {
          cy.findByTextEnsureVisible("Custom reports");
          cy.button("Duplicate").click();
        });

        cy.wait("@copyDashboard").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
        });
      },
    );

    it("should not allow moving or archiving analytics collections", () => {
      cy.log(
        "**-- Custom Reports collection should not be archivable or movable --**",
      );
      visitCollection(CUSTOM_REPORTS_COLLECTION_NAME);

      cy.findByTestId("collection-menu").within(() => {
        cy.icon("ellipsis").click();
        cy.contains("Move to trash").should("not.exist");
        cy.contains("Move").should("not.exist");
      });

      visitCollection(ANALYTICS_COLLECTION_NAME);

      cy.findAllByTestId("collection-entry").each(el => {
        if (el.text() === CUSTOM_REPORTS_COLLECTION_NAME) {
          cy.wrap(el).within(() => {
            cy.icon("ellipsis").click();
          });
          return false; // stop iterating
        }
      });

      popover().within(() => {
        cy.findByText("Bookmark").should("be.visible");
        cy.findByText("Move to trash").should("not.exist");
        cy.findByText("Move").should("not.exist");
      });

      cy.log(
        "**-- Metabase Analytics collection should not be archivable or movable --**",
      );
      visitCollection(ANALYTICS_COLLECTION_NAME);

      cy.findByTestId("collection-menu").icon("ellipsis").should("not.exist");

      visitCollection("Our analytics");

      cy.findAllByTestId("collection-entry").each(el => {
        if (el.text() === ANALYTICS_COLLECTION_NAME) {
          cy.wrap(el).within(() => {
            cy.icon("ellipsis").click();
          });
          return false; // stop iterating
        }
      });

      popover().within(() => {
        cy.findByText("Bookmark").should("be.visible");
        cy.findByText("Move to trash").should("not.exist");
        cy.findByText("Move").should("not.exist");
      });
    });

    it("should not allow editing analytics content (metabase#36228)", () => {
      // dashboard
      getItemId(ANALYTICS_COLLECTION_NAME, METRICS_DASHBOARD_NAME).then(id => {
        visitDashboard(id);
      });

      cy.findByTestId("dashboard-header").within(() => {
        cy.findByText("Make a copy");
        cy.icon("pencil").should("not.exist");
      });

      // model
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then(id => {
        visitModel(id);
      });

      cy.findByTestId("qb-header").icon("ellipsis").click();

      popover().within(() => {
        cy.findByText("Duplicate").should("be.visible");
        cy.findByText("Edit query definition").should("not.exist");
      });
    });

    it("should not leak instance analytics database into SQL query builder (metabase#44856)", () => {
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then(id => {
        visitModel(id);
      });

      newButton("SQL query").click();

      // sample DB should be the only one
      cy.findByTestId("gui-builder-data")
        .icon("cheverondown")
        .should("not.exist");
    });

    it("should not leak instance analytics database into permissions editor (metabase#44856)", () => {
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then(id => {
        visitModel(id);
      });

      // it's important that we do this manually, as this will only reproduce if theres no page load
      cy.findByTestId("app-bar").icon("gear").click();
      popover().findByText("Admin settings").click();
      cy.findByLabelText("Navigation bar").findByText("Permissions").click();
      sidebar().findByText("Administrators").click();
      cy.findByTestId("permission-table")
        .findByText(/internal metabase database/i)
        .should("not.exist");

      sidebar().findByText("Databases").click();

      sidebar()
        .findByText(/internal metabase database/i)
        .should("not.exist");
    });
  });

  describe("API tests", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/field/*/values").as("fieldValues");
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      cy.intercept("POST", "api/card").as("saveCard");
      cy.intercept("POST", "api/dashboard/*/copy").as("copyDashboard");

      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should not allow editing analytics content (metabase#36228)", () => {
      // get the analytics collection
      cy.request("GET", "/api/collection/root/items").then(({ body }) => {
        const analyticsCollection = body.data.find(
          ({ name }) => name === ANALYTICS_COLLECTION_NAME,
        );
        expect(analyticsCollection.can_write).to.be.false;

        // get the items in the collection
        cy.request(
          "GET",
          `/api/collection/${analyticsCollection.id}/items`,
        ).then(({ body }) => {
          const analyticsItems = body.data;

          // check each collection item
          const cards = analyticsItems.filter(
            ({ model }) => model === "card" || model === "dataset",
          );
          const dashboards = analyticsItems.filter(
            ({ model }) => model === "dashboard",
          );

          cards.forEach(({ id }) => {
            cy.request("GET", `/api/card/${id}`).then(({ body }) => {
              expect(body.can_write).to.be.false;
            });
          });

          dashboards.forEach(({ id }) => {
            cy.request("GET", `/api/dashboard/${id}`).then(({ body }) => {
              expect(body.can_write).to.be.false;
            });
          });
        });
      });
    });
  });
});

describe("question and dashboard links", () => {
  describeEE("ee", () => {
    beforeEach(() => {
      onlyOnEE();
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should show a analytics link for questions", () => {
      visitQuestion(ORDERS_QUESTION_ID);

      cy.intercept("GET", "/api/collection/**").as("collection");

      cy.findByTestId("qb-header-action-panel")
        .button(/\.\.\./)
        .click();
      popover().findByText("Usage insights").click();

      cy.wait("@collection");

      cy.findByDisplayValue("Question overview").should("exist");

      cy.findByRole("button", { name: /Question ID/ }).should(
        "contain.text",
        ORDERS_QUESTION_ID,
      );

      cy.findAllByTestId("dashcard")
        .contains("[data-testid=dashcard]", "Question metadata")
        .within(() => {
          cy.findByText("Entity ID");
          cy.findByText(ORDERS_QUESTION_ID);
          cy.findByText("Name");
          cy.findByText("Orders");
          cy.findByText("Entity Type");
          cy.findByText("question");
        });
    });

    it("should show a analytics link for dashboards", () => {
      visitDashboard(ORDERS_DASHBOARD_ID);
      cy.intercept("GET", "/api/collection/**").as("collection");
      cy.button("Move, trash, and more…").click();
      popover().findByText("Usage insights").click();

      cy.wait("@collection");

      cy.findByDisplayValue("Dashboard overview").should("exist");

      cy.findByRole("button", { name: /Dashboard ID/ }).should(
        "contain.text",
        ORDERS_DASHBOARD_ID,
      );

      cy.findAllByTestId("dashcard")
        .contains("[data-testid=dashcard]", "Dashboard metadata")
        .within(() => {
          cy.findByText("Entity ID");
          cy.findByText(ORDERS_DASHBOARD_ID);
          cy.findByText("Name");
          cy.findByText("Orders in a dashboard");
          cy.findByText("Entity Type");
          cy.findByText("dashboard");
        });
    });

    it("should not show option for users with no access to Metabase Analytics", () => {
      cy.signInAsNormalUser();
      visitQuestion(ORDERS_QUESTION_ID);

      cy.findByTestId("qb-header-action-panel")
        .button(/\.\.\./)
        .click();
      popover().findByText("Usage insights").should("not.exist");

      visitDashboard(ORDERS_DASHBOARD_ID);

      cy.button("Move, trash, and more…").click();
      popover().findByText("Usage insights").should("not.exist");
    });
  });
  describe("oss", { tags: "@OSS" }, () => {
    beforeEach(() => {
      onlyOnOSS();
      restore();
      cy.signInAsAdmin();
    });
    it("should never appear in OSS", () => {
      visitQuestion(ORDERS_QUESTION_ID);

      cy.findByTestId("qb-header-action-panel")
        .button(/\.\.\./)
        .click();
      popover().findByText("Usage insights").should("not.exist");

      visitDashboard(ORDERS_DASHBOARD_ID);

      cy.button("Move, trash, and more…").click();
      popover().findByText("Usage insights").should("not.exist");
    });
  });
});

function getCollectionId(collectionName) {
  return cy.request("GET", "/api/collection").then(({ body }) => {
    const collection = body.find(({ name }) => name === collectionName);

    return collection.id;
  });
}

function visitCollection(collectionName) {
  getCollectionId(collectionName).then(id => {
    cy.visit(`/collection/${id}`);
  });
}

function getItemId(collectionName, itemName) {
  return getCollectionId(collectionName).then(id => {
    cy.request("GET", `/api/collection/${id}/items`).then(({ body }) => {
      const item = body.data.find(({ name }) => name === itemName);
      return item.id;
    });
  });
}
