const { H } = cy;

/**
 * Helpers for the group mapping card the SSO pages share.
 * Callers alias PUT /api/setting/* as @updateSetting and PUT /api/setting as @updateSettings.
 */
export const groupMappingCardHelpers = ({ sectionTestId, nameLabel }) => {
  const groupMappingSection = () => cy.findByTestId(sectionTestId);

  const groupMappingSwitch = () =>
    cy.findByRole("switch", { name: "Group mapping" });

  const mappingRow = (name) =>
    cy.contains('[data-testid="group-mapping-row"]', name);

  const newMappingButton = () =>
    groupMappingSection().findByRole("button", { name: "New" });

  const groupsPicker = () => cy.findByLabelText("Metabase groups");

  // Mantine hides the switch input, so the click goes to the title label wired to it
  const clickGroupMappingSwitch = () =>
    groupMappingSection().contains("label", "Group mapping").click();

  const toggleGroupMapping = (enabled) => {
    groupMappingSwitch().should(enabled ? "not.be.checked" : "be.checked");
    clickGroupMappingSwitch();
    cy.wait("@updateSetting")
      .its("request.body")
      .should("deep.equal", { value: enabled });
  };

  const addMapping = (name, groups) => {
    newMappingButton().click();
    cy.findByLabelText(nameLabel).type(name);
    groupsPicker().click();
    groups.forEach((group) => {
      cy.findByRole("option", { name: group }).click();
    });
    cy.button("Add mapping").click();
    cy.wait("@updateSettings");
    mappingRow(name).should("contain", groups.join(", "));
  };

  const deleteMapping = (name, consequenceLabel, confirmLabel) => {
    mappingRow(name).findByLabelText("Delete mapping").click();
    H.modal().within(() => {
      cy.findByText("Remove this group mapping?").should("be.visible");
      cy.findByRole("radio", { name: consequenceLabel }).click();
      cy.button(confirmLabel).click();
    });
    cy.wait("@updateSettings");
    mappingRow(name).should("not.exist");
  };

  return {
    groupMappingSection,
    groupMappingSwitch,
    mappingRow,
    newMappingButton,
    groupsPicker,
    toggleGroupMapping,
    addMapping,
    deleteMapping,
  };
};
