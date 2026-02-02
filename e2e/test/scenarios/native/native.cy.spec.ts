const { H } = cy;

describe("scenarios > question > native", () => {
  beforeEach(() => {
    cy.intercept("POST", "api/card").as("card");
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.intercept("POST", "api/dataset/native").as("datasetNative");
    H.restore();
    cy.signInAsNormalUser();
  });

  it("does not select editor text when resizing", () => {
    const queryText = Array.from({ length: 50 }, (_, index) => {
      return `select ${index} as column_${index}`;
    }).join("\n");

    H.startNewNativeQuestion({ query: queryText });

    cy.findByTestId("native-query-editor")
      .find(".cm-scroller")
      .scrollTo("bottom");

    cy.document().then((doc) => {
      expect(doc.getSelection()?.toString()).to.equal("");
    });

    const options = {
      pointer: "mouse" as const,
      button: "left" as const,
    };

    cy.findByTestId("drag-handle").should("be.visible");
    cy.findByTestId("drag-handle").then(($handle) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      $handle[0].dispatchEvent(event);
      expect(event.defaultPrevented).to.equal(true);
    });

    cy.findByTestId("drag-handle").realMouseDown(options);
    cy.findByTestId("native-query-editor")
      .should("have.length", 1)
      .find(".cm-line")
      .last()
      .then(($line) => {
        cy.wrap($line).realMouseMove(0, -100);
      });
    cy.findByTestId("native-query-editor")
      .should("have.length", 1)
      .find(".cm-line")
      .last()
      .realMouseUp(options);

    cy.document().then((doc) => {
      expect(doc.getSelection()?.toString()).to.equal("");
    });
  });
});
