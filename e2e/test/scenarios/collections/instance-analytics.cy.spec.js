const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const ANALYTICS_COLLECTION_NAME = "Usage analytics";
const CUSTOM_REPORTS_COLLECTION_NAME = "Custom reports";
const PEOPLE_MODEL_NAME = "People";

describe("scenarios > Metabase Analytics Collection (AuditV2)", () => {
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
      H.visitQuestion(ORDERS_QUESTION_ID);
      cy.findByRole("button", { name: /Editor/ }).click();
      cy.findByLabelText("View SQL").click();
      cy.findByTestId("native-query-preview-sidebar").should("be.visible");

      H.openNavigationSidebar();
      cy.findByRole("link", { name: /Usage analytics/i }).click();
      H.getPinnedSection()
        .findByRole("link", { name: /Metabase metrics/i })
        .click();
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
      "should default to saving audit content in custom reports collection and not allow editing or leaking analytics content (metabase#36228, metabase#44856)",
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

        cy.findByTestId("save-question-modal").within(() => {
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

        cy.log("Analytics models can't be edited (metabase#36228)");
        H.popover().within(() => {
          cy.findByText("Duplicate").should("be.visible");
          cy.findByText("Edit query definition").should("not.exist");
          cy.findByText("Duplicate").click();
        });

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

        cy.log(
          "Instance analytics database doesn't leak into the SQL query builder (metabase#44856)",
        );
        H.newButton("SQL query").click();
        cy.findByTestId("selected-database").should(
          "have.text",
          "Sample Database",
        );
        cy.findByTestId("gui-builder-data").should("not.exist");

        cy.log(
          "Instance analytics database doesn't leak into the permissions editor (metabase#44856)",
        );
        // it's important that we do this manually, as this will only reproduce if theres no page load
        H.goToAdmin();
        cy.findByLabelText("Navigation bar").findByText("Permissions").click();
        H.sidebar().findByText("Administrators").click();
        cy.findByTestId("permission-table")
          .findByText("Sample Database")
          .should("be.visible");
        cy.findByTestId("permission-table")
          .findByText(/internal metabase database/i)
          .should("not.exist");

        H.sidebar().findByText("Databases").click();

        H.sidebar().findByText("Sample Database").should("be.visible");
        H.sidebar()
          .findByText(/internal metabase database/i)
          .should("not.exist");

        cy.log("saving copied dashboard");

        getItemId(ANALYTICS_COLLECTION_NAME, "Person overview").then((id) => {
          H.visitDashboard(id);
        });

        cy.log("Analytics dashboards can't be edited (metabase#36228)");
        cy.findByTestId("dashboard-header").within(() => {
          cy.findByText("Make a copy").should("be.visible");
          cy.icon("pencil").should("not.exist");
          cy.findByText("Make a copy").click();
        });

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

      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Edit permissions").should("be.visible");
        cy.findByText("Move to trash").should("not.exist");
        cy.findByText("Move").should("not.exist");
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

      H.getCollectionActions()
        .findByLabelText("Edit permissions")
        .should("be.visible");
      H.getCollectionActions().icon("ellipsis").should("not.exist");

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

    it("should show an analytics link for questions and dashboards", () => {
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

      H.openQuestionInfoSidesheet().within(() => {
        cy.findByRole("tab", { name: "Overview" }).should("be.visible");
        cy.findByRole("link", { name: /Insights/i }).should("not.exist");
      });

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.openDashboardInfoSidebar().within(() => {
        cy.findByRole("tab", { name: "Overview" }).should("be.visible");
        cy.findByRole("link", { name: /Insights/i }).should("not.exist");
      });
    });
  });

  describe("oss", { tags: "@OSS" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should never appear in OSS", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      H.openQuestionInfoSidesheet().within(() => {
        cy.findByRole("tab", { name: "Overview" }).should("be.visible");
        cy.findByRole("link", { name: /Insights/i }).should("not.exist");
      });

      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.openDashboardInfoSidebar().within(() => {
        cy.findByRole("tab", { name: "Overview" }).should("be.visible");
        cy.findByRole("link", { name: /Insights/i }).should("not.exist");
      });
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
