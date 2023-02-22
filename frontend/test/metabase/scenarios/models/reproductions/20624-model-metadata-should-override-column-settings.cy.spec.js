import { openQuestionActions, restore } from "__support__/e2e/helpers";

const renamedColumn = "TITLE renamed";

const questionDetails = {
  name: "20624",
  dataset: true,
  native: { query: "select * from PRODUCTS limit 2" },
  visualization_settings: {
    column_settings: { '["name","TITLE"]': { column_title: renamedColumn } },
  },
};

describe("issue 20624", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("models metadata should override previously defined column settings (metabase#20624)", () => {
    openQuestionActions();
    cy.findByText("Edit metadata").click();

    // Open settings for this column
    cy.findByText("TITLE").click();
    // Let's set a new name for it
    cy.findByDisplayValue("TITLE").clear().type("Foo").blur();

    cy.button("Save changes").click();
    cy.wait("@updateCard");

    cy.get(".cellData").should("contain", "Foo");
  });
});
