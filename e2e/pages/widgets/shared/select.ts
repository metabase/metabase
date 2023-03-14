import { LocatorFn } from "e2e/pages/types";
import { popover } from "e2e/support/helpers";

export class Select {
  static byTestId = (testId: string) =>
    new Select(() => cy.findByTestId(testId));

  static byLabel = (label: string) =>
    new Select(() => cy.findByLabelText(label));

  constructor(private _locator: LocatorFn) {}

  select = (value: string) => {
    this._locator().click();
    popover().within(() => {
      cy.findAllByRole("option").contains(value).scrollIntoView().click();
    });
    return this;
  };

  verifySelectedValue = (value: string) => {
    this._locator().should("have.text", value);
    return this;
  };

  verifyOptionExists = (value: string) => {
    this._locator().click();
    popover().within(() => {
      cy.findAllByRole("option").contains(value);
    });
    return this;
  };
}
