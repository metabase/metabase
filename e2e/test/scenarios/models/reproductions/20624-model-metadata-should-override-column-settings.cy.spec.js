import { restore } from "e2e/support/helpers";
import { openDetailsSidebar } from "../helpers/e2e-models-helpers";

const renamedColumn = "TITLE renamed";

const questionDetails = {
  name: "20624",
  dataset: true,
  native: { query: "select * from PRODUCTS limit 2" },
  visualization_settings: {
    column_settings: { '["name","TITLE"]': { column_title: renamedColumn } },
  },
};

describe.skip("issue 20624", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("models metadata should override previously defined column settings (metabase#20624)", () => {
    openDetailsSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Customize metadata").click();

    // Open settings for this column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(renamedColumn).click();
    // Let's set a new name for it
    cy.findByDisplayValue(renamedColumn).clear().type("Foo").blur();

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.get(".cellData").should("contain", "Foo");
  });
});
