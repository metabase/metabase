import {
  restore,
  restoreActionsDB,
  queryActionsDB,
} from "__support__/e2e/helpers";

describe("Write Actions on Dashboards", () => {
  before(() => {
    restoreActionsDB();
    restore("postgresActions");
    cy.signInAsAdmin();
  });

  beforeEach(() => {
    // restoreActionsDB();
    // restore('withActions');
    cy.signInAsAdmin();
  });

  it("should show actions_db with actions enabled", () => {
    cy.visit("/admin/databases/2");

    cy.get("#model-actions-toggle").should("be.checked");
  });

  it("can read from the test table", () => {
    cy.visit("/browse/2");
    cy.findByText("Test Table").click();

    cy.findByText("Jack").should("be.visible");
    cy.findByText("Jill").should("be.visible");
    cy.findByText("Jenny").should("be.visible");
  });

  it("creates a model from the test table", () => {
    cy.createQuestion(
      {
        database: 2,
        name: "Test Model",
        query: {
          "source-table": 9,
        },
        dataset: true,
      },
      { visitQuestion: true },
    );

    cy.findByText("Test Model").should("be.visible");
    cy.findByText("Jill").should("be.visible");
    cy.findByText("Jenny").should("be.visible");
  });

  it("creates a new custom query action", () => {
    cy.visit("/model/4-test-model/detail");
    cy.findByText("Actions").click();
    cy.findByText("New action").click();

    cy.findByRole("dialog").within(() => {
      cy.get(".ace_text-input").type(
        "INSERT INTO test_table (name) VALUES ('Blaine')",
        { force: true },
      );
      cy.findByText("Save").click();
    });

    cy.findByPlaceholderText("My new fantastic action").type("Add a Blaine");
    cy.findByText("Create").click();
  });

  it("adds a query action to a dashboard", () => {
    cy.createDashboard({ name: `action packed dash` }).then(
      ({ body: { id: dashboardId } }) => {
        cy.visit(`/dashboard/${dashboardId}`);
      },
    );

    cy.findByLabelText("pencil icon").click();
    cy.findByLabelText("click icon").click();
    cy.get("aside").within(() => {
      cy.findByText("Add a Blaine").click();
    });
    cy.findByLabelText("click icon").click();

    cy.findByText("Add a Blaine").should("be.visible");
    cy.findByText("Save").click();
  });

  it("runs a query action on a dashboard", () => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
      "executeAPI",
    );

    cy.findByText("Add a Blaine").click();

    cy.wait("@executeAPI");

    queryActionsDB("SELECT * FROM test_table WHERE name = 'Blaine'").then(
      ({ rows }) => {
        expect(rows.length).to.equal(1);
      },
    );
  });
});
