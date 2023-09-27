import {
  restore,
  openQuestionActions,
  popover,
  sidebar,
  openColumnOptions,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    cy.intercept("PUT", "/api/card/*").as("cardUpdate");
    cy.intercept("GET", "/api/card/*").as("cardGet");

    cy.createQuestion({
      name: "Products Model",
      query: { "source-table": PRODUCTS_ID },
      dataset: true,
    });
  });

  it("should create, delete, and re-create a model index on product titles", () => {
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

    cy.wait("@dataset");

    editTitleMetadata();

    sidebar()
      .findByLabelText(/surface individual records/i)
      .click();

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.button("Save changes").click();
    });

    // this tests redux cache invalidation (#31407)
    cy.wait("@modelIndexCreate").then(({ request, response }) => {
      expect(request.body.model_id).to.equal(modelId);

      // this will likely change when this becomes an async process
      expect(response.body.state).to.equal("indexed");
      expect(response.body.id).to.equal(2);
    });
  });

  it("should not allow indexing when a primary key has been unassigned", () => {
    cy.visit(`/model/${modelId}`);
    cy.wait("@dataset");

    editTitleMetadata();

    sidebar()
      .findByLabelText(/surface individual records/i)
      .click();

    openColumnOptions("ID");

    // change the entity key to a foreign key so no key exists
    sidebar()
      .findByText(/entity key/i)
      .click();

    popover()
      .findByText(/foreign key/i)
      .click();

    cy.findByTestId("dataset-edit-bar").button("Save changes").click();

    cy.wait("@cardUpdate");

    // search should fail
    cy.findByTestId("app-bar")
      .findByPlaceholderText("Search…")
      .type("marble shoes");

    cy.findByTestId("search-results-list").findByText(/didn't find anything/i);
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

  it("should not reload the model for record in the same model", () => {
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

    expectCardQueries(1);

    cy.get("body").type("{esc}");

    cy.findByTestId("app-bar")
      .findByPlaceholderText("Search…")
      .clear()
      .type("silk coat");

    cy.findByTestId("search-results-list")
      .findByText("Ergonomic Silk Coat")
      .click();

    cy.findByTestId("object-detail").within(() => {
      cy.findByText("Upton, Kovacek and Halvorson");
    });

    expectCardQueries(1);
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

const expectCardQueries = num =>
  cy.get("@cardGet.all").then(interceptions => {
    expect(interceptions).to.have.length(num);
  });
