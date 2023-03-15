import { LocatorFn } from "../../types";

export class Input {
  static byTestId = (testId: string) =>
    new Input(() => cy.findByTestId(testId));
  static byLabel = (label: string) =>
    new Input(() => cy.findByLabelText(content => content.startsWith(label)));

  constructor(private _locator: LocatorFn) {}

  setValue = (value: string) => {
    this.clear();

    if (value !== "") {
      this.type(value);
    }

    return this;
  };

  blur = () => {
    this._locator().blur();
    return this;
  };

  type = (value: string) => {
    this._locator().type(value);
    return this;
  };

  clear = () => {
    this._locator().clear();
    return this;
  };

  verifyValue = (value: string) => {
    this._locator().should("have.value", value);
    return this;
  };

  verifyLabel = (label: string) => {
    this._locator()
      .invoke("attr", "id")
      .then(id => cy.get(`[for=${id}]`).should("have.value", label));
    return this;
  };

  verifyValidationMessage = (message: string) => {
    this._locator()
      .get("[data-testid=field-error]")
      .should("have.text", `: ${message}`);
    return this;
  };
}
