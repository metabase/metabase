import { restore, describeWithToken } from "__support__/e2e/cypress";

const TOOLS_ERRORS_URL = "/admin/tools/errors";

// The filter is required but doesn't have a default value set
const brokenQuestionDetails = {
  name: "Broken SQL",
  native: {
    "template-tags": {
      filter: {
        id: "ce8f111c-24c4-6823-b34f-f704404572f1",
        name: "filter",
        "display-name": "Filter",
        type: "text",
        required: true,
      },
    },
    query: "select {{filter}}",
  },
  display: "scalar",
};

describeWithToken("admin > tools > erroring questions ", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("without broken questions", () => {
    it('should render the "Tools" tab and navigate to the "Erroring Questions" by clicking on it', () => {
      cy.visit("/admin");

      cy.get("nav")
        .contains("Tools")
        .click();

      cy.location("pathname").should("eq", TOOLS_ERRORS_URL);

      cy.findByText("No results");

      cy.findByRole("link", { name: "Erroring Questions" })
        .should("have.attr", "href")
        .and("eq", TOOLS_ERRORS_URL);
    });

    it.skip("should disable search input fields (metabase#18050)", () => {
      cy.visit(TOOLS_ERRORS_URL);

      // When the issue gets fixed, it's safe to merge these assertions with the main test above
      cy.findByPlaceholderText("Error name").should("be.disabled");
      cy.findByPlaceholderText("DB name").should("be.disabled");
      cy.findByPlaceholderText("Collection name").should("be.disabled");
    });

    it.skip('should disable "Rerun Selected" button (metabase#18048)', () => {
      cy.visit(TOOLS_ERRORS_URL);

      // When the issue gets fixed, it's safe to merge these assertions with the main test above
      cy.button("Rerun Selected").should("be.disabled");
    });
  });

  describe("with the existing broken questions", () => {
    beforeEach(() => {
      cy.createNativeQuestion(brokenQuestionDetails, {
        loadMetadata: true,
      });

      cy.visit(TOOLS_ERRORS_URL);
    });

    it.skip('should disable "Rerun Selected" button (metabase#18048)', () => {
      // When the issue gets fixed, merge it with the main test below
      cy.button("Rerun Selected").should("be.disabled");
    });

    it("should render correctly", () => {
      cy.wait("@dataset");

      selectQuestion(brokenQuestionDetails.name);

      cy.button("Rerun Selected")
        .should("not.be.disabled")
        .click();

      cy.wait("@dataset");

      // The question is still there because we didn't fix it
      cy.findByText(brokenQuestionDetails.name);

      cy.findByPlaceholderText("Error name").should("not.be.disabled");
      cy.findByPlaceholderText("DB name").should("not.be.disabled");
      cy.findByPlaceholderText("Collection name")
        .should("not.be.disabled")
        .type("foo");

      cy.wait("@dataset");

      cy.findByText("No results");
    });

    it("should remove fixed question on a rerun", () => {
      fixQuestion(brokenQuestionDetails.name);

      cy.visit(TOOLS_ERRORS_URL);

      selectQuestion(brokenQuestionDetails.name);

      cy.button("Rerun Selected")
        .should("not.be.disabled")
        .click();

      cy.wait("@dataset");

      cy.findByText("No results");
    });
  });
});

function fixQuestion(name) {
  cy.visit("/collection/root");
  cy.findByText(name).click();
  cy.findByText("Open Editor").click();

  cy.icon("variable").click();
  cy.findByPlaceholderText("Enter a default value...").type("Foo");

  cy.findByText("Save").click();

  cy.get(".Modal").within(() => {
    cy.button("Save").click();
  });
}

function selectQuestion(name) {
  cy.findByText(name)
    .closest("tr")
    .within(() => {
      cy.findByRole("checkbox")
        .click()
        .should("be.checked");
    });
}
