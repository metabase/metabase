import {
  restore,
  signInAsAdmin,
  openOrdersTable,
  openReviewsTable,
  popover,
} from "__support__/cypress";

describe("scenarios > admin > datamodel > metadata", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should correctly show remapped column value", () => {
    // go directly to Data Model page for Sample Dataset
    cy.visit("/admin/datamodel/database/1");
    // edit "Product ID" column in "Orders" table
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

  it("should correctly apply and display custom remapping for numeric values", () => {
    // this test also indirectly reproduces metabase#12771
    const customMap = {
      1: "Awful",
      2: "Unpleasant",
      3: "Meh",
      4: "Enjoyable",
      5: "Perfecto",
    };

    // go directly to Data Model page for Sample Dataset
    cy.visit("/admin/datamodel/database/1");
    // edit "Rating" values in "Reviews" table
    cy.findByText("Reviews").click();
    cy.findByDisplayValue("Rating")
      .parent()
      .find(".Icon-gear")
      .click();

    // apply custom remapping for "Rating" values 1-5
    cy.findByText("Use original value").click();
    cy.findByText("Custom mapping").click();
    cy.findByText(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    Object.entries(customMap).forEach(([key, value]) => {
      cy.findByDisplayValue(key)
        .click()
        .clear()
        .type(value);
    });
    cy.findByText("Save").click();

    cy.log("**Numeric ratings should be remapped to custom strings**");
    openReviewsTable();
    Object.values(customMap).forEach(rating => {
      cy.findAllByText(rating);
    });
  });
});
