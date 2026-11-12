const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  Card,
  CardQueryMetadata,
  Collection,
  CollectionId,
  CollectionItem,
  Dashboard,
} from "metabase-types/api";

const ANALYTICS_COLLECTION_NAME = "Usage analytics";
const CUSTOM_REPORTS_COLLECTION_NAME = "Custom reports";
const PEOPLE_MODEL_NAME = "People";
const AUDIT_DB_ID = 13371337;

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

      cy.log(
        "Even admins can't write native queries on the instance analytics database (metabase#49904)",
      );
      getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
        cy.request<CardQueryMetadata>(
          "GET",
          `/api/card/${id}/query_metadata`,
        ).then(({ body }) => {
          const auditDatabase = body.databases.find(
            (database) => database.id === AUDIT_DB_ID,
          );
          expect(auditDatabase?.native_permissions).to.eq("none");
        });
      });
    });

    it(
      "should default to saving audit content in custom reports collection (metabase#36228)",
      { requestTimeout: 15000 },
      () => {
        const savedIds: { cards: Card["id"][]; dashboards: Dashboard["id"][] } =
          { cards: [], dashboards: [] };

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
            CUSTOM_REPORTS_COLLECTION_NAME,
          );
          cy.findByText("Save").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          savedIds.cards.push(response?.body.id);
        });

        cy.log("saving copied question");

        getItemId(ANALYTICS_COLLECTION_NAME, PEOPLE_MODEL_NAME).then((id) => {
          H.visitModel(id);
        });

        cy.findByTestId("qb-header").icon("ellipsis").click();
        H.popover().findByText("Duplicate").click();

        H.modal().within(() => {
          cy.findByTextEnsureVisible(CUSTOM_REPORTS_COLLECTION_NAME);
          cy.button("Duplicate").click();
        });

        cy.wait("@saveCard").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          savedIds.cards.push(response?.body.id);
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
          cy.findByTextEnsureVisible(CUSTOM_REPORTS_COLLECTION_NAME);
          cy.button("Duplicate").click();
        });

        cy.wait("@copyDashboard").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          savedIds.dashboards.push(response?.body.id);
        });

        cy.log("all three copies are stored in the custom reports collection");
        getCollectionId(CUSTOM_REPORTS_COLLECTION_NAME).then(
          (customReportsId) => {
            cy.request<{ data: CollectionItem[] }>(
              "GET",
              `/api/collection/${customReportsId}/items`,
            ).then(({ body }) => {
              const ids = (model: CollectionItem["model"]) =>
                body.data
                  .filter((item) => item.model === model)
                  .map((item) => item.id);
              const cardIds = [...ids("card"), ...ids("dataset")];

              expect(savedIds.cards).to.have.length(2);
              expect(cardIds).to.include.members(savedIds.cards);
              expect(savedIds.dashboards).to.have.length(1);
              expect(ids("dashboard")).to.include.members(savedIds.dashboards);
            });
          },
        );
      },
    );
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
  });
});

function getCollectionId(
  collectionName: string,
): Cypress.Chainable<CollectionId> {
  return cy.request<Collection[]>("GET", "/api/collection").then(({ body }) => {
    const collection = body.find(({ name }) => name === collectionName);
    if (!collection) {
      throw new Error(`Collection "${collectionName}" not found`);
    }
    return collection.id;
  });
}

function visitCollection(collectionName: string) {
  getCollectionId(collectionName).then((id) => {
    cy.visit(`/collection/${id}`);
  });
}

function getItemId(
  collectionName: string,
  itemName: string,
): Cypress.Chainable<number> {
  return getCollectionId(collectionName).then((id) =>
    cy
      .request<{ data: CollectionItem[] }>("GET", `/api/collection/${id}/items`)
      .then(({ body }) => {
        const item = body.data.find(({ name }) => name === itemName);
        if (!item) {
          throw new Error(
            `Item "${itemName}" not found in "${collectionName}"`,
          );
        }
        return item.id;
      }),
  );
}
