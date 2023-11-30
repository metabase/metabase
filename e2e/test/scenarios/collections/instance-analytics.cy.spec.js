import {
  restore,
  navigationSidebar,
  setTokenFeatures,
  popover,
  describeEE,
  modal,
} from "e2e/support/helpers";

const ANALYTICS_COLLECTION_NAME = "Metabase analytics";
const PEOPLE_MODEL_NAME = "People";
const METRICS_DASHBOARD_NAME = "Metabase metrics";

describeEE("scenarios > Metabase Analytics Collection (AuditV2) ", () => {
  describe("admin", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/field/*/values").as("fieldValues");
      cy.intercept("POST", "/api/dataset").as("datasetQuery");
      cy.intercept("POST", "api/card").as("saveCard");
      cy.intercept("GET", "api/dashboard/*").as("getDashboard");
      cy.intercept("GET", "api/card/*").as("getCard");
      cy.intercept("POST", "api/dashboard/*/copy").as("copyDashboard");

      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
      cy.visit("/");
    });

    it("allows admins to see the instance analytics collection content", () => {
      navigationSidebar().findByText(ANALYTICS_COLLECTION_NAME).click();
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
      "should default to saving saving audit content in custom reports collection",
      { tags: "@flaky" },
      () => {
        cy.log("saving edited question");

        navigationSidebar().findByText(ANALYTICS_COLLECTION_NAME).click();

        cy.findByTestId("pinned-items")
          .findByText(PEOPLE_MODEL_NAME)
          .scrollIntoView()
          .click();

        cy.wait("@datasetQuery");

        cy.findByTestId("TableInteractive-root").within(() => {
          cy.findByText("Last Name").click();
        });

        popover().findByText("Filter by this column").click();
        cy.wait("@fieldValues");
        popover().findByText("Tableton").click();
        popover().button("Add filter").click();

        cy.wait("@datasetQuery");

        cy.findByTestId("question-row-count").findByText("Showing 6 rows");

        cy.findByTestId("qb-header").findByText("Save").click();

        modal().within(() => {
          cy.findByTextEnsureVisible("Custom reports");
          cy.button("Save").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
        });

        modal().button("Not now").click();

        cy.log("saving copied question");

        navigationSidebar().findByText(ANALYTICS_COLLECTION_NAME).click();

        cy.findByTestId("pinned-items")
          .findByText(PEOPLE_MODEL_NAME)
          .scrollIntoView()
          .click();

        cy.wait("@datasetQuery");

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

        navigationSidebar().findByText(ANALYTICS_COLLECTION_NAME).click();

        cy.findByTestId("pinned-items").findByText("Person overview").click();

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

    it("should not allow moving or archiving custom reports collection", () => {
      navigationSidebar().within(() => {
        cy.findByText(ANALYTICS_COLLECTION_NAME).click();
        cy.findByText("Custom reports").click();
      });

      cy.findByTestId("collection-menu").within(() => {
        cy.icon("ellipsis").click();
        cy.contains("Archive").should("not.exist");
        cy.contains("Move").should("not.exist");
      });

      navigationSidebar().within(() => {
        cy.findByText(ANALYTICS_COLLECTION_NAME).click();
      });

      cy.findAllByTestId("collection-entry").each(el => {
        if (el.text() === "Custom reports") {
          cy.wrap(el).within(() => {
            cy.icon("ellipsis").click();
            cy.contains("Archive").should("not.exist");
            cy.contains("Move").should("not.exist");
          });
          return false; // stop iterating
        }
      });
    });

    it.skip("should not allow editing analytics content (#36228)", () => {
      // dashboard
      navigationSidebar().findByText(ANALYTICS_COLLECTION_NAME).click();
      cy.findByTestId("pinned-items")
        .findByText(METRICS_DASHBOARD_NAME)
        .scrollIntoView()
        .click();

      cy.wait("@getDashboard");

      cy.findByTestId("dashboard-header").within(() => {
        cy.icon("pencil").should("not.exist");
      });

      // model
      navigationSidebar().findByText(ANALYTICS_COLLECTION_NAME).click();
      cy.findByTestId("pinned-items")
        .findByText(PEOPLE_MODEL_NAME)
        .scrollIntoView()
        .click();

      cy.wait("@getCard");

      cy.findByTestId("qb-header").within(() => {
        cy.icon("ellipsis").click();
      });

      popover().findByText("Edit query definition").should("not.exist");
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

    it.skip("should not allow editing analytics content (#36228)", () => {
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
