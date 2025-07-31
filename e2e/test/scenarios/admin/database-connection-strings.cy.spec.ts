const { H } = cy;

export {};

beforeEach(() => {
  H.restore();
  cy.signInAsAdmin();
});

function selectFieldOption(fieldName: string, option: string) {
  cy.findByLabelText(fieldName).click();
  H.popover().contains(option).click({ force: true });
}

function chooseDatabase(database: string) {
  selectFieldOption("Database type", database);
}

describe("Database connection strings", () => {
  it("should parse a connection string", () => {
    cy.visit("/admin/databases/create");
    chooseDatabase("Athena");
    cy.findByLabelText("Connection string (optional)").paste(
      "jdbc:athena://WorkGroup=primary;Region=us-east-1;",
    );
    cy.findByLabelText("Region").should("have.value", "us-east-1");
    cy.findByLabelText("Workgroup").should("have.value", "primary");
  });
});
