import {
  restore,
  startNewQuestion,
  enterCustomColumnDetails,
  visualize,
  popover,
} from "__support__/e2e/helpers";

const connectionConfig = {
  user: "metabase",
  password: "metasample123",
  host: "localhost",
  database: "sample",
  ssl: false,
  port: 5432,
};

const query = `
DROP TABLE IF EXISTS colors;

CREATE TABLE colors (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  color VARCHAR ( 255 ) UNIQUE NOT NULL
);

INSERT INTO colors (color) VALUES ('red');
INSERT INTO colors (color) VALUES ('green');
INSERT INTO colors (color) VALUES ('blue');
`;

describe.skip("issue 27745", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.task("connectAndQueryDB", {
      connectionConfig,
      query,
    });

    cy.request("POST", "/api/database/2/sync_schema");
  });

  it("should display all summarize options if the only numeric field is a custom column (metabase#27745)", () => {
    startNewQuestion();
    cy.findByText("QA Postgres12").click();
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
        cy.findByTestId("aggregation-item").should("contain", "Sum of Numeric");
      });
  });
});
