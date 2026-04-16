// eslint-disable-next-line metabase/no-direct-helper-import
import { H } from "e2e/support";

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
  H.modal().within(() => {
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

  H.modal().button("Create").click();

  return cy.wait("@createKey");
};
