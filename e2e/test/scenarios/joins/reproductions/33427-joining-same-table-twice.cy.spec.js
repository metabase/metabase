import {
  openNotebook,
  openQuestionActions,
  popover,
  restore,
  visitModel,
} from "e2e/support/helpers";

const MODEL_DETAILS = {
  dataset: true,
  native: {
    query: `
      SELECT o.ID, p1.TITLE AS CREATED_BY, p2.TITLE AS UPDATED_BY
      FROM ORDERS o
      JOIN PRODUCTS p1 ON p1.ID = o.PRODUCT_ID
      JOIN PRODUCTS p2 ON p2.ID = o.USER_ID
    `,
  },
};

const CREATED_BY_NAME = "Title - created by";
const UPDATED_BY_NAME = "Title - updated by";

describe("issue 33427", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display proper column names in the fields picker (metabase#33427)", () => {
    cy.createNativeQuestion(MODEL_DETAILS).then(({ body: card }) => {
      visitModel(card.id);
    });

    cy.url().then(modelUrl => cy.wrap(modelUrl).as("modelUrl"));

    openQuestionActions();
    popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("CREATED_BY").click();
    mapColumnToProductsTitle();
    changeColumnDisplayName("Title", CREATED_BY_NAME);

    cy.findAllByTestId("header-cell").contains("UPDATED_BY").click();
    mapColumnToProductsTitle();
    changeColumnDisplayName("Title", UPDATED_BY_NAME);

    cy.button("Save changes").click();
    cy.get("@modelUrl").then(modelUrl => cy.url().should("equal", modelUrl));

    openNotebook();
    cy.findByTestId("fields-picker").click();
    popover().within(() => {
      cy.findByText("ID").should("exist");
      cy.findByText(CREATED_BY_NAME).should("exist");
      cy.findByText(UPDATED_BY_NAME).should("exist");
    });
  });
});

const mapColumnToProductsTitle = () => {
  cy.findByTestId("sidebar-right")
    .findByText("Database column this maps to")
    .closest("#formField-id")
    .findByTestId("select-button")
    .click();
  popover().findByText("Products").click();
  popover().findByText("Title").click();
};

const changeColumnDisplayName = (currentName, newName) => {
  cy.findByTestId("sidebar-right")
    .findByTitle("Display name")
    .should("have.value", currentName)
    .clear()
    .type(newName)
    .blur();

  cy.findAllByTestId("header-cell").contains(newName).should("exist");
};
