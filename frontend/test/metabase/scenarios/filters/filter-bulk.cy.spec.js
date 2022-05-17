import { restore, openOrdersTable } from "__support__/e2e/cypress";

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a new filter in the modal", () => {
    openOrdersTable();
  });
});
