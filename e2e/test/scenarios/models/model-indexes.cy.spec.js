const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createModelIndex } from "e2e/support/helpers/e2e-model-index-helper";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > model indexes", () => {
  let modelId;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/model-index").as("modelIndexCreate");
    cy.intercept("DELETE", "/api/model-index/*").as("modelIndexDelete");
    cy.intercept("PUT", "/api/card/*").as("cardUpdate");
    cy.intercept("GET", "/api/card/*").as("cardGet");

    H.createQuestion(
      {
        name: "Products Model",
        query: { "source-table": PRODUCTS_ID },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );

    cy.get("@modelId").then((_modelId) => {
      modelId = _modelId;
    });
  });

  it("should create, delete, and re-create a model index on product titles", () => {
    cy.visit(`/model/${modelId}`);
    cy.wait("@dataset");

    editTitleMetadata();
    toggleSurfaceIndividualRecords();
    saveModelIndexChanges();
    cy.wait("@modelIndexCreate");
    assertIndexedValueSearchable();

    editTitleMetadata();
    getSurfaceIndividualRecordsToggle().should("be.checked");
    toggleSurfaceIndividualRecords();
    saveModelIndexChanges();
    cy.wait("@modelIndexDelete");
    cy.wait("@dataset");

    editTitleMetadata();
    getSurfaceIndividualRecordsToggle().should("not.be.checked");
    toggleSurfaceIndividualRecords();
    saveModelIndexChanges();

    // the deleted index must not linger in the cached model index list (metabase#31094)
    cy.wait("@modelIndexCreate");
    assertIndexedValueSearchable();
  });

  it("should not allow indexing when a primary key has been unassigned", () => {
    cy.visit(`/model/${modelId}`);
    cy.wait("@dataset");

    editTitleMetadata();
    toggleSurfaceIndividualRecords();

    H.openColumnOptions("ID");

    // change the entity key to a foreign key so no key exists
    H.sidebar()
      .findByDisplayValue(/entity key/i)
      .click();

    H.popover()
      .findByText(/foreign key/i)
      .click();

    saveModelIndexChanges();

    cy.wait("@cardUpdate");
    // The editor closes once the model indexes have been updated
    cy.findByTestId("dataset-edit-bar").should("not.exist");
    H.tableInteractive().findByText("Rustic Paper Wallet").should("be.visible");

    // search should fail
    H.commandPaletteSearch("marble shoes", false);

    H.commandPalette()
      .findByRole("option", { name: /No results for/ })
      .should("exist");
  });

  it("should not reload the model for record in the same model", () => {
    createModelIndex({ modelId, pkName: "ID", valueName: "TITLE" });

    cy.visit("/");

    H.commandPaletteSearch("marble shoes", false);
    H.commandPalette()
      .findByRole("option", { name: "Small Marble Shoes" })
      .click();

    cy.wait("@dataset");

    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("heading", { name: "Small Marble Shoes" }).should(
        "be.visible",
      );
      cy.findAllByText("Small Marble Shoes").should("have.length", 2);
      cy.findByText("Doohickey").should("be.visible");
    });

    expectCardQueries(1);

    cy.get("body").type("{esc}");

    H.commandPaletteSearch("silk coat", false);
    H.commandPalette()
      .findByRole("option", { name: "Ergonomic Silk Coat" })
      .click();

    cy.findByTestId("object-detail").within(() => {
      cy.findByRole("heading", { name: "Ergonomic Silk Coat" }).should(
        "be.visible",
      );
      cy.findByText("Upton, Kovacek and Halvorson");
    });

    expectCardQueries(1);
  });
});

function editTitleMetadata() {
  H.openQuestionActions();
  H.popover().findByText("Edit metadata").click();
  cy.url().should("include", "/columns");
  H.tableInteractive().findByTextEnsureVisible("Title");

  H.openColumnOptions("Title");
}

function getSurfaceIndividualRecordsToggle() {
  return H.sidebar().findByLabelText(/surface individual records/i);
}

function toggleSurfaceIndividualRecords() {
  // needs to be forced because Mantine
  getSurfaceIndividualRecordsToggle().click({ force: true });
}

function saveModelIndexChanges() {
  cy.findByTestId("dataset-edit-bar").button("Save changes").click();
}

function assertIndexedValueSearchable() {
  // The editor closes once the model indexes have been updated
  cy.findByTestId("dataset-edit-bar").should("not.exist");
  H.commandPaletteSearch("marble shoes", false);
  H.commandPalette()
    .findByRole("option", { name: "Small Marble Shoes" })
    .should("exist");
  cy.get("body").type("{esc}");
  H.commandPalette().should("not.exist");
}

const expectCardQueries = (num) =>
  cy.get("@cardGet.all").then((interceptions) => {
    expect(interceptions).to.have.length(num);
  });
