import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CollectionId, DataApp } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION_NAME = "App orders";

describe("scenarios > data apps > resource collection", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    // `bleeding-edge` grants the `data-apps` premium feature; requires the EE build.
    H.activateToken("bleeding-edge");

    cy.request<DataApp>("POST", "/api/apps", {
      name: "resource-collection",
      display_name: "Resource collection",
      bundle_path: "dist/index.js",
      bundle: "",
    }).then(({ body: app }) => {
      cy.wrap(app.resource_collection_id).as("collectionId");
      H.createQuestion(
        {
          name: QUESTION_NAME,
          query: { "source-table": ORDERS_ID },
          collection_id: app.resource_collection_id,
        },
        { wrapId: true },
      );
    });
  });

  it("offers no actions on the app's collection page", () => {
    cy.get<CollectionId>("@collectionId").then((collectionId) => {
      H.visitCollection(collectionId);
    });

    cy.findByTestId("collection-caption")
      .findByDisplayValue("Data App: resource-collection")
      .should("be.disabled");

    cy.findByTestId("collection-menu").within(() => {
      cy.icon("bookmark").should("be.visible");
      cy.findByLabelText("Create a new collection").should("not.exist");
      cy.findByLabelText("Upload data").should("not.exist");
      cy.icon("calendar").should("not.exist");
      cy.icon("ellipsis").should("not.exist");
    });

    H.collectionTable().within(() => {
      cy.findByText(QUESTION_NAME).should("be.visible");
      cy.findByLabelText("Select all items").should("not.exist");
      cy.findByRole("checkbox").should("not.exist");
      cy.icon("ellipsis").should("not.exist");
    });
  });

  it("offers no sharing, bookmark, or actions menu on the question's own page", () => {
    H.visitQuestion("@questionId");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByRole("button", { name: "More info" }).should("be.visible");
      cy.findByTestId("sharing-menu-button").should("not.exist");
      cy.findByRole("button", { name: "Bookmark" }).should("not.exist");
      cy.findByRole("button", { name: /Move, trash, and more/ }).should(
        "not.exist",
      );
    });
  });
});
