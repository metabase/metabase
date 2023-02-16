import {
  restore,
  startNewQuestion,
  enterCustomColumnDetails,
  visualize,
  popover,
  queryQADB,
} from "__support__/e2e/helpers";

const createTableQueries = {
  postgres: `
    DROP TABLE IF EXISTS colors;

    CREATE TABLE colors (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      color VARCHAR ( 255 ) UNIQUE NOT NULL
    );

    INSERT INTO colors (color) VALUES ('red'), ('green'), ('blue');
  `,
  mysql: `
    DROP TABLE IF EXISTS colors;

    CREATE TABLE colors (
      id INTEGER PRIMARY KEY AUTO_INCREMENT,
      color VARCHAR ( 255 ) UNIQUE NOT NULL
    );

    INSERT INTO colors (color) VALUES ('red'), ('green'), ('blue');
  `,
};

const snapshotMap = {
  postgres: "postgres-12",
  mysql: "mysql-8",
};

["postgres", "mysql"].forEach(dialect => {
  describe.skip(`issue 27745 (${dialect})`, { tags: "@external" }, () => {
    beforeEach(() => {
      restore(snapshotMap[dialect]);
      cy.signInAsAdmin();

      queryQADB(createTableQueries[dialect], dialect);

      cy.request("POST", "/api/database/2/sync_schema");
    });

    it("should display all summarize options if the only numeric field is a custom column (metabase#27745)", () => {
      startNewQuestion();
      cy.findByText(/QA/i).click();
      cy.findByText("Colors").click();
      cy.icon("add_data").click();
      enterCustomColumnDetails({
        formula: "case([ID] > 1, 25, 5)",
        name: "Numeric",
      });
      cy.button("Done").click();

      visualize();

      cy.findAllByTestId("header-cell").contains("Numeric").click();
      popover().findByText(/^Sum$/).click();

      cy.wait("@dataset");
      cy.get(".ScalarValue").invoke("text").should("eq", "55");

      cy.findByTestId("sidebar-right")
        .should("be.visible")
        .within(() => {
          cy.findByTestId("aggregation-item").should(
            "contain",
            "Sum of Numeric",
          );
        });
    });
  });
});
