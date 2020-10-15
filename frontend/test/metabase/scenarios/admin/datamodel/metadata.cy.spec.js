import {
  restore,
  signInAsAdmin,
  openOrdersTable,
  popover,
} from "__support__/cypress";

describe("scenarios > admin > datamodel > metadata", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should correctly show remapped column value", () => {
    // go directly to Data Model page for Sample Dataset
    cy.visit("/admin/datamodel/database/1");
    // edit "Product ID" columnn in "Orders" table
    cy.findByText("Orders").click();
    cy.findByDisplayValue("Product ID")
      .parent()
      .find(".Icon-gear")
      .click();

    // remap its original value to use foreign key
    cy.findByText("Use original value").click();
    cy.findByText("Use foreign key").click();
    popover().within(() => {
      cy.findByText("Title").click();
    });
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    cy.log("**Name of the product should be displayed instead of its ID**");
    openOrdersTable();
    cy.findAllByText("Awesome Concrete Shoes");
  });
});
