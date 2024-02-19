export function getUserProvisioningInput() {
  return cy
    .findByTestId("admin-layout-content")
    .findByText("User Provisioning");
}

export function getSuccessUi() {
  return cy.findByTestId("admin-layout-content").findByText("Success");
}
