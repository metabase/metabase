export class Input {
  static byTestId = testId => {
    return new Input(() => cy.findByTestId(testId));
  };

  static byLabel = label => {
    return new Input(() => cy.findByLabelText(label));
  };

  constructor(locator) {
    this.locator = locator;
  }

  setValue = value => {
    this.clear();

    if (value !== "") {
      this.append(value);
    }

    return this;
  };

  append = value => {
    this.locator().type(value);
    return this;
  };

  clear = value => {
    this.locator().clear(value);
    return this;
  };

  verifyValue = value => this.locator().should("have.value", value);
  verifyLabel = label =>
    this.locator()
      .invoke("attr", "id")
      .then(id => cy.get(`[for=${id}]`).should("have.value", label));
}
