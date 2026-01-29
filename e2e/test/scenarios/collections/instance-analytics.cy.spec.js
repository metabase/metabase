const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const ANALYTICS_COLLECTION_NAME = "Usage analytics";
const CUSTOM_REPORTS_COLLECTION_NAME = "Custom reports";
const PEOPLE_MODEL_NAME = "People";
const METRICS_DASHBOARD_NAME = "Metabase metrics";

describe("scenarios > Metabase Analytics Collection (AuditV2) ", () => {
  describe("admin", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/field/*/values").as("fieldValues");
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      cy.intercept("POST", "api/card").as("saveCard");
      cy.intercept("POST", "api/dashboard/*/copy").as("copyDashboard");

      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should not show the sidebar preview when working with instance analyics (metabase#49904)", () => {
      cy.signInAsAdmin();
      H.visitQuestion(ORDERS_QUESTION_ID);
      cy.findByRole("button", { name: /Editor/ }).click();
      cy.findByLabelText("View SQL").click();
      cy.findByTestId("native-query-preview-sidebar").should("be.visible");

      H.openNavigationSidebar();
      cy.findByRole("link", { name: /Usage analytics/i }).click();
      cy.findByRole("link", { name: /Metabase metrics/i }).click();
      cy.findByRole("link", { name: /Question views last week/i }).click();

      cy.findByRole("button", { name: /Editor/ }).click();
      cy.findByLabelText("View SQL").should("not.exist");
      cy.findByTestId("native-query-preview-sidebar").should("not.exist");
    });

    it("allows admins to see the instance analytics collection content", () => {
      visitCollection(ANALYTICS_COLLECTION_NAME);
      cy.findByTestId("pinned-items")
        .findByText(PEOPLE_MODEL_NAME)
        .scrollIntoView()
        .click();

      cy.wait("@datasetQuery");

      H.tableInteractive().within(() => {
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
        getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
          H.visitModel(id);
        });

        H.tableHeaderClick("Last Name");

        H.popover().findByText("Filter by this column").click();
        cy.wait("@fieldValues");
        H.popover().findByText("Tableton").click();
        H.popover().button("Add filter").click();

        cy.wait("@datasetQuery");

        cy.findByTestId("question-row-count").findByText("Showing 7 rows");

        cy.findByTestId("qb-header").findByText("Save").click();

        cy.findByTestId("save-question-modal").within((modal) => {
          cy.findByTestId("dashboard-and-collection-picker-button").findByText(
            "Custom reports",
          );
          cy.findByText("Save").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
        });

        cy.log("saving copied question");

        getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
          H.visitModel(id);
        });

        cy.findByTestId("qb-header").icon("ellipsis").click();

        H.popover().findByText("Duplicate").click();

        H.modal().within(() => {
          cy.findByTextEnsureVisible("Custom reports");
          cy.button("Duplicate").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
        });

        H.modal()
          .button(/Duplicate/i)
          .should("not.exist");

        cy.log("saving copied dashboard");

        getItemId(ANALYTICS_COLLECTION_NAME, "Person overview").then((id) => {
          H.visitDashboard(id);
        });

        cy.findByTestId("dashboard-header").findByText("Make a copy").click();

        H.modal().within(() => {
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

      cy.findAllByTestId("collection-entry").each((el) => {
        if (el.text() === CUSTOM_REPORTS_COLLECTION_NAME) {
          cy.wrap(el).within(() => {
            cy.icon("ellipsis").click();
          });
          return false; // stop iterating
        }
      });

      H.popover().within(() => {
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

      cy.findAllByTestId("collection-entry").each((el) => {
        if (el.text() === ANALYTICS_COLLECTION_NAME) {
          cy.wrap(el).within(() => {
            cy.icon("ellipsis").click();
          });
          return false; // stop iterating
        }
      });

      H.popover().within(() => {
        cy.findByText("Bookmark").should("be.visible");
        cy.findByText("Move to trash").should("not.exist");
        cy.findByText("Move").should("not.exist");
      });
    });

    it("should not allow editing analytics content (metabase#36228)", () => {
      // dashboard
      getItemId(ANALYTICS_COLLECTION_NAME, METRICS_DASHBOARD_NAME).then(
        (id) => {
          H.visitDashboard(id);
        },
      );

      cy.findByTestId("dashboard-header").within(() => {
        cy.findByText("Make a copy");
        cy.icon("pencil").should("not.exist");
      });

      // model
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
        H.visitModel(id);
      });

      cy.findByTestId("qb-header").icon("ellipsis").click();

      H.popover().within(() => {
        cy.findByText("Duplicate").should("be.visible");
        cy.findByText("Edit query definition").should("not.exist");
      });
    });

    it("should not leak instance analytics database into SQL query builder (metabase#44856)", () => {
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
        H.visitModel(id);
      });

      H.newButton("SQL query").click();

      // sample DB should be the only one
      cy.findByTestId("gui-builder-data")
        .icon("cheverondown")
        .should("not.exist");
    });

    it("should not leak instance analytics database into permissions editor (metabase#44856)", () => {
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
        H.visitModel(id);
      });

      // it's important that we do this manually, as this will only reproduce if theres no page load
      H.goToAdmin();
      cy.findByLabelText("Navigation bar").findByText("Permissions").click();
      H.sidebar().findByText("Administrators").click();
      cy.findByTestId("permission-table")
        .findByText(/internal metabase database/i)
        .should("not.exist");

      H.sidebar().findByText("Databases").click();

      H.sidebar()
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

      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
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
  describe("ee", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should show an analytics link for questions", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      cy.intercept("GET", "/api/collection/**").as("collection");

      H.openQuestionInfoSidesheet()
        .findByRole("link", { name: /Insights/ })
        .click();

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

    it("should show an analytics link for dashboards", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      cy.intercept("GET", "/api/collection/**").as("collection");

      H.openDashboardInfoSidebar()
        .findByRole("link", { name: /Insights/ })
        .click();

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
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openQuestionInfoSidesheet()
        .findByRole("link", { name: /Insights/i })
        .should("not.exist");

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.openDashboardInfoSidebar()
        .findByRole("link", { name: /Insights/i })
        .should("not.exist");
    });
  });

  describe("oss", { tags: "@OSS" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should never appear in OSS", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openQuestionInfoSidesheet()
        .findByRole("link", { name: /Insights/i })
        .should("not.exist");

      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.openDashboardInfoSidebar()
        .findByRole("link", { name: /Insights/i })
        .should("not.exist");
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
  getCollectionId(collectionName).then((id) => {
    cy.visit(`/collection/${id}`);
  });
}

function getItemId(collectionName, itemName) {
  return getCollectionId(collectionName).then((id) => {
    cy.request("GET", `/api/collection/${id}/items`).then(({ body }) => {
      const item = body.data.find(({ name }) => name === itemName);
      return item.id;
    });
  });
}
