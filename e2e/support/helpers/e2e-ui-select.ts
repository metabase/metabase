export function selectHasValue(label: string, value: string) {
  return cy.findByRole("textbox", { name: label }).should("have.value", value);
}
