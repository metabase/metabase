export function getUserProvisioningInput() {
  return {
    label: cy
      .findByTestId("admin-layout-content")
      .findByText("User Provisioning"),
    input: cy
      .findByTestId("admin-layout-content")
      .findByLabelText("User Provisioning"),
  };
}

export function getSuccessUi() {
  return cy.findByTestId("admin-layout-content").findByText("Success");
}
