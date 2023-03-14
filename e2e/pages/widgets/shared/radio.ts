import { LocatorFn } from "../../types";

export class Radio {
  static byTestId = (testId: string) =>
    new Radio(() => cy.findByTestId(testId));
  static byLabel = (label: string) =>
    new Radio(() => cy.findByRole("radio", { name: label }));

  constructor(private _locator: LocatorFn) {}

  select = (value: string) => {
    this._locator().contains(value).click();
    return this;
  };

  verifySelected = (value: string) =>
    this._locator().contains(value).get("input").should("be.checked");
}
