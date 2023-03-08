import { popover } from "e2e/support/helpers";

export class Select {
  static byTestId = testId => {
    return new Select(() => cy.findByTestId(testId));
  };

  static byLabel = label => {
    return new Select(() => cy.findByLabelText(label));
  };

  constructor(locator) {
    this.locator = locator;
  }

  select = value => {
    this.locator().click();
    popover().within(() => {
      cy.findAllByRole("option").contains(value).scrollIntoView().click();
    });
    return this;
  };

  verifySelectedValue = value => {
    this.locator().should("have.text", value);
    return this;
  };

  verifyOptionExists = value => {
    this.locator().click();
    popover().within(() => {
      cy.findAllByRole("option").contains(value);
    });
    return this;
  };
}
