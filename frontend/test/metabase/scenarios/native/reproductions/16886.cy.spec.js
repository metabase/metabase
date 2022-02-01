import { restore, openNativeEditor } from "__support__/e2e/cypress";

const ORIGINAL_QUERY = "select 1 from orders";
const SELECTED_TEXT = "select 1";

const moveCursorToBeginning = "{selectall}{leftarrow}";
const highlightSelectedText = "{shift}{rightarrow}".repeat(
  SELECTED_TEXT.length,
);

describe("issue 16886", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it(`shouldn't remove parts of the query when choosing "Run selected text" (metabase#16886)`, () => {
    openNativeEditor().type(
      ORIGINAL_QUERY + moveCursorToBeginning + highlightSelectedText,
      { delay: 50 },
    );

    cy.get(".NativeQueryEditor .Icon-play").click();

    cy.get(".ScalarValue").invoke("text").should("eq", "1");

    cy.get("@editor").contains(ORIGINAL_QUERY);
  });
});
