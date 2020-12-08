import { signIn, restore, popover } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { PEOPLE } = SAMPLE_DATASET;

describe("scenarios > dashboard > chained filter", () => {
  beforeEach(() => {
    restore();
    signIn();
  });

  for (const has_field_values of ["search", "list"]) {
    it(`limit ${has_field_values} options based on linked filter`, () => {
      cy.request("PUT", `/api/field/${PEOPLE.CITY}`, { has_field_values }),
        cy.visit("/dashboard/1");
      // start editing
      cy.get(".Icon-pencil").click();

      // add a state filter
      cy.get(".Icon-filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("State").click();
      });

      // connect that to people.state
      cy.findByText("Column to filter on")
        .parent()
        .within(() => {
          cy.findByText("Select…").click();
        });
      popover().within(() => {
        cy.findByText("State").click();
      });

      // open the linked filters tab, and click the click to add a City filter
      cy.findByText("Linked filters").click();
      cy.findByText("add another dashboard filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("City").click();
      });

      // connect that to person.city
      cy.findByText("Column to filter on")
        .parent()
        .within(() => {
          cy.findByText("Select…").click();
        });
      popover().within(() => {
        cy.findByText("City").click();
      });

      // Link city to state
      cy.findByText("Limit this filter's choices")
        .parent()
        .within(() => {
          // turn on the toggle
          cy.findByText("State")
            .parent()
            .within(() => {
              cy.get("a").click();
            });

          // open up the list of linked columns
          cy.findByText("State").click();
          // It's hard to assert on the "table.column" pairs.
          // We just assert that the headers are there to know that something appeared.
          cy.findByText("Filtering column");
          cy.findByText("Filtered column");
        });

      cy.findByText("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");

      // now test that it worked!
      // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
      cy.findByText("State").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("Add filter").click();
      });
      cy.findByText("City").click();
      popover().within(() => {
        cy.findByPlaceholderText(
          has_field_values === "search" ? "Search by City" : "Search the list",
        ).type("An");
        cy.findByText("Anchorage");
        cy.findByText("Anacoco").should("not.exist");
      });
    });
  }
});
