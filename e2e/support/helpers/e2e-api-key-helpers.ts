import { H } from "e2e/support";

export const visitApiKeySettings = () => {
  cy.visit("/admin/settings/authentication/api-keys");
  return cy.wait("@getKeys");
};

export const tryToCreateApiKeyViaModal = ({
  name,
  group,
}: {
  name: string;
  group: string | RegExp;
}) => {
  cy.findByTestId("api-keys-settings-header")
    .button(/create api key/i)
    .click();
  cy.findByRole("dialog", { name: "Create a new API Key" })
    .as("modal")
    .within(() => {
      cy.findByLabelText(/Key name/).type(name);
      cy.findByLabelText(/group/).click();
    });

  H.selectDropdown()
    .findByRole("option", {
      name: group,
      // Workaround for Mantine bug where the dropdown is hidden while the modal is open
      hidden: true,
    })
    .click();

  cy.get("@modal").button("Create").click();

  return cy.wait("@createKey");
};
