import { LocatorFn } from "../../types";

export class Button {
  static byTestId = (testId: string) =>
    new Button(() => cy.findByTestId(testId));
  static byLabel = (label: string) =>
    new Button(() => cy.findByRole("button", { name: label }));

  constructor(private _locator: LocatorFn) {}

  click = () => {
    this._locator().click();
    return this;
  };

  verifyText = (text: string) => this._locator().should("have.text", text);
  verifyDisabled = () => this._locator().should("be.disabled");
  verifyEnabled = () => this._locator().should("be.enabled");
}
