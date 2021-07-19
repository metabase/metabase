import {
  restore,
  popover,
  modal,
  openOrdersTable,
} from "__support__/e2e/cypress";

describe("scenarios > question > saved", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it.skip("should should correctly display 'Save' modal (metabase#13817)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Total").click();
    // Save the question
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText("Save").click();
    });
    cy.findByText("Not now").click();
    cy.findByText("Save").should("not.exist");

    // Add a filter in order to be able to save question again
    cy.findByText("Filter").click();
    cy.findByText(/^Total$/).click();
    cy.findByText("Equal to").click();
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").type("60");
    cy.findByText("Add filter").click();

    // Save question - opens "Save question" modal
    cy.findByText("Save").click();

    modal().within(() => {
      cy.findByText("Save question");
      cy.button("Save").as("saveButton");
      cy.get("@saveButton").should("not.be.disabled");

      cy.log(
        "**When there is no question name, it shouldn't be possible to save**",
      );
      cy.findByText("Save as new question").click();
      cy.findByLabelText("Name").should("be.empty");
      cy.findByLabelText("Description").should("be.empty");
      cy.get("@saveButton").should("be.disabled");

      cy.log(
        "**It should `always` be possible to overwrite the original question**",
      );
      cy.findByText(/^Replace original question,/).click();
      cy.get("@saveButton").should("not.be.disabled");
    });
  });

  it("view and filter saved question", () => {
    cy.visit("/question/1");
    cy.findAllByText("Orders"); // question and table name appears

    // filter to only orders with quantity=100
    cy.findByText("Quantity").click();
    popover().within(() => cy.findByText("Filter by this column").click());
    popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("100");
      cy.findByText("Update filter").click();
    });
    cy.findByText("Quantity is equal to 100");
    cy.findByText("Showing 2 rows"); // query updated

    // check that save will give option to replace
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText('Replace original question, "Orders"');
      cy.findByText("Save as new question");
      cy.findByText("Cancel").click();
    });

    // click "Started from Orders" and check that the original question is restored
    cy.findByText("Started from").within(() => cy.findByText("Orders").click());
    cy.findByText("Showing first 2,000 rows"); // query updated
    cy.findByText("Started from").should("not.exist");
    cy.findByText("Quantity is equal to 100").should("not.exist");
  });

  it("should duplicate a saved question", () => {
    cy.server();
    cy.route("POST", "/api/card").as("cardCreate");
    cy.route("POST", "/api/card/1/query").as("query");

    cy.visit("/question/1");
    cy.wait("@query");

    cy.get(".Icon-pencil").click();
    cy.findByText("Duplicate this question").click();

    modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });
  });

  it.skip("should be able to use integer filter on a saved native query (metabase#15808)", () => {
    cy.createNativeQuestion({
      name: "15808",
      native: { query: "select * from products" },
    });
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("15808").click();
    cy.findByText("Filter").click();
    cy.findByTestId("sidebar-right")
      .findByText(/Rating/i)
      .click();
    cy.get(".AdminSelect").findByText("Equal to");
    cy.findByPlaceholderText("Enter a number").type("4");
    cy.button("Add filter")
      .should("not.be.disabled")
      .click();
    cy.findByText("Synergistic Granite Chair");
    cy.findByText("Rustic Paper Wallet").should("not.exist");
  });
});
