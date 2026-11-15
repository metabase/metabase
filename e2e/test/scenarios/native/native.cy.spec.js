const { H } = cy;

describe("scenarios > question > native", () => {
  beforeEach(() => {
    cy.intercept("POST", "api/dataset").as("dataset");
    H.restore();
    cy.signInAsNormalUser();
  });

  it("lets you create and run a SQL question", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select count(*) from orders");

    runQuery();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("18,760");
  });

  it("runs and saves a SQL question with variables, then loads it with values from the URL", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type(
      "select * from PRODUCTS where CATEGORY = {{cat}} and RATING >= {{stars}}",
    );
    cy.findByPlaceholderText("Cat").type("Gizmo");
    cy.findByPlaceholderText("Stars").type("3");
    runQuery();
    H.assertQueryBuilderRowCount(45);

    H.saveQuestion("SQL Products", { wrapId: true });

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.get("@questionId").then((questionId) => {
      cy.visit(`/question/${questionId}?cat=Gizmo&stars=3`);
    });
    cy.wait("@cardQuery");

    cy.findByPlaceholderText("Cat").should("have.value", "Gizmo");
    cy.findByPlaceholderText("Stars").should("have.value", "3");
    H.assertQueryBuilderRowCount(45);
  });

  it("should be able to handle two sidebars on different screen sizes", () => {
    const questionDetails = {
      name: "13332",
      native: {
        query: "select * from PRODUCTS limit 5",
      },
    };

    function setViewport(width, height) {
      cy.viewport(width, height);
      cy.wait(100); // wait for UI to re-render to avoid flakiness
    }

    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.log("open editor on a normal screen size");
    cy.findByTestId("visibility-toggler").click();

    dataReferenceSidebar()
      .should("be.visible")
      // means data is loaded
      .should("contain", "Sample Database");

    cy.findByTestId("visibility-toggler").click();
    dataReferenceSidebar().should("not.be.visible");

    cy.log("open editor on a small screen size");
    setViewport(1279, 800);

    cy.log("try to open data reference sidebar on a mid size screen");
    cy.findByTestId("visibility-toggler").click();
    H.NativeEditor.get().should("be.visible");
    dataReferenceSidebar().should("not.be.visible");

    cy.log("open visualization settings sidebar, order matters");
    cy.findByTestId("viz-type-button").click();

    cy.log("open data reference sidebar");
    cy.findByTestId("native-query-editor-action-buttons")
      .icon("reference")
      .click();

    cy.log("set small viewport");
    setViewport(800, 800);

    cy.findByTestId("sidebar-left").invoke("width").should("be.gt", 350);
    cy.findByTestId("sidebar-right").invoke("width").should("be.gt", 350);
  });
});

function dataReferenceSidebar() {
  return cy.findByTestId("sidebar-right");
}

const runQuery = () => {
  cy.findByTestId("native-query-editor-container").within(() => {
    cy.button("Get Answer").click();
  });
  cy.wait("@dataset");
};
