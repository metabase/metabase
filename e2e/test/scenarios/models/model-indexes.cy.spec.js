import {
  restore,
  openQuestionActions,
  popover,
  sidebar,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { openColumnOptions } from "./helpers/e2e-models-metadata-helpers";

const { PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > model indexes", () => {
  const modelId = 4;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/search?q=*").as("searchQuery");
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/model-index").as("modelIndexCreate");
    cy.intercept("DELETE", "/api/model-index/*").as("modelIndexDelete");

    cy.createQuestion({
      name: "Products Model",
      query: { "source-table": PRODUCTS_ID },
      dataset: true,
    });
  });

  it("should create and delete a model index on product titles", () => {
    cy.visit(`/model/${modelId}`);
    cy.wait("@dataset");

    editTitleMetadata();

    sidebar()
      .findByLabelText(/surface individual records/i)
      .click();

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.button("Save changes").click();
    });

    cy.wait("@modelIndexCreate").then(({ request, response }) => {
      expect(request.body.model_id).to.equal(modelId);

      // this will likely change when this becomes an async process
      expect(response.body.state).to.equal("indexed");
      expect(response.body.id).to.equal(1);
    });

    editTitleMetadata();

    sidebar()
      .findByLabelText(/surface individual records/i)
      .click();

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.button("Save changes").click();
    });

    cy.wait("@modelIndexDelete").then(({ request, response }) => {
      expect(request.url).to.include("/api/model-index/1");
      expect(response.statusCode).to.equal(200);
    });
  });

  it("should be able to search model index values and visit detail records", () => {
    createModelIndex({ modelId, pkName: "ID", valueName: "TITLE" });

    cy.visit("/");

    cy.findByTestId("app-bar")
      .findByPlaceholderText("Search…")
      .type("marble shoes");

    cy.wait("@searchQuery");

    cy.findByTestId("search-results-list")
      .findByText("Small Marble Shoes")
      .click();

    cy.wait("@dataset");

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("Product");
      cy.findByText("Small Marble Shoes");
      cy.findByText("Doohickey");
    });
  });

  it("should be able to see details of a record outside the first 2000", () => {
    cy.createQuestion({
      name: "People Model",
      query: { "source-table": PEOPLE_ID },
      dataset: true,
    });
    createModelIndex({ modelId: 5, pkName: "ID", valueName: "NAME" });

    cy.visit("/");

    cy.findByTestId("app-bar").findByPlaceholderText("Search…").type("anais");

    cy.wait("@searchQuery");

    cy.findByTestId("search-results-list").findByText("Anais Zieme").click();

    cy.wait("@dataset");
    cy.wait("@dataset"); // second query gets the additional record

    cy.findByTestId("object-detail").within(() => {
      cy.findByText(/We're a little lost/i).should("not.exist");
      cy.findAllByText("Anais Zieme").should("have.length", 2);
    });
  });
});

function editTitleMetadata() {
  openQuestionActions();
  popover().findByText("Edit metadata").click();
  cy.url().should("include", "/metadata");
  cy.findByTestId("TableInteractive-root").findByTextEnsureVisible("Title");

  openColumnOptions("Title");
}

function createModelIndex({ modelId, pkName, valueName }) {
  // since field ids are non-deterministic, we need to get them from the api
  cy.request("GET", `/api/table/card__${modelId}/query_metadata`).then(
    ({ body }) => {
      const pkRef = [
        "field",
        body.fields.find(f => f.name === pkName).id,
        null,
      ];
      const valueRef = [
        "field",
        body.fields.find(f => f.name === valueName).id,
        null,
      ];

      cy.request("POST", "/api/model-index", {
        pk_ref: pkRef,
        value_ref: valueRef,
        model_id: modelId,
      }).then(response => {
        expect(response.body.state).to.equal("indexed");
        expect(response.body.id).to.equal(1);
      });
    },
  );
}
