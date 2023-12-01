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

    it("should not allow moving or archiving analytics collections", () => {
      cy.log(
        "**-- Custom Reports collection should not be archivable or movable --**",
      );
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
          });
          return false; // stop iterating
        }
      });

      popover().within(() => {
        cy.findByText("Bookmark").should("be.visible");
        cy.findByText("Archive").should("not.exist");
        cy.findByText("Move").should("not.exist");
      });

      cy.log(
        "**-- Metabase Analytics collection should not be archivable or movable --**",
      );
      navigationSidebar().within(() => {
        cy.findByText(ANALYTICS_COLLECTION_NAME).click();
        cy.findByText("Our analytics").click();
      });

      cy.findByTestId("collection-menu").within(() => {
        cy.icon("ellipsis").click();
        cy.contains("Archive").should("not.exist");
        cy.contains("Move").should("not.exist");
      });

      navigationSidebar().findByText("Our analytics").click();

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
        cy.findByText("Archive").should("not.exist");
        cy.findByText("Move").should("not.exist");
      });
    });
  });
});
