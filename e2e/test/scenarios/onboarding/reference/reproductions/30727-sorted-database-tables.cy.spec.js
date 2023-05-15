import { restore } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const sampleDBSortedTables = ["Orders", "People", "Products", "Reviews"];

describe("issue 30727", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("database tables should be sorted alphabetically (metabase#30727)", () => {
    cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables`);

    cy.findByTestId("table-list").within(() => {
      cy.findByText("Tables in Sample Database");
      cy.findByRole("list")
        .findAllByRole("heading")
        .each((el, index) => {
          const title = el[0].innerText;
          expect(title).to.equal(sampleDBSortedTables[index]);
        });
    });
  });
});
