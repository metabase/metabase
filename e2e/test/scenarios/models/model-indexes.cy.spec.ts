const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > model indexes", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/model-index").as("modelIndexCreate");
    cy.intercept("DELETE", "/api/model-index/*").as("modelIndexDelete");

    H.createQuestion(
      {
        name: "Products Model",
        query: { "source-table": PRODUCTS_ID },
        type: "model",
      },
      { wrapId: true, idAlias: "modelId" },
    );
  });

  it("should create, delete, and re-create a model index on product titles", () => {
    cy.get<CardId>("@modelId").then((modelId) => {
      cy.visit(`/model/${modelId}`);
    });
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
    cy.findByTestId("dataset-edit-bar").should("not.exist");

    H.commandPaletteSearch("marble shoes", false);
    H.commandPalette()
      .findByRole("option", { name: "Small Marble Shoes" })
      .click();

    cy.findByTestId("object-detail")
      .findByRole("heading", { name: "Small Marble Shoes" })
      .should("be.visible");
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
