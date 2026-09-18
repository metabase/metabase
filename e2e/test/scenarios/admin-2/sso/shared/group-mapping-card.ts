const { H } = cy;

type GroupMappingCardOptions = {
  sectionTestId: string;
  nameLabel: string;
  // the settings-backed pages write the switch through its own setting, the provider-backed page through the whole provider
  switchWrite?: { alias: string; valuePath: string };
  mappingsAlias?: string;
};

/**
 * Helpers for the group mapping card the SSO pages share.
 * Callers alias the writes the card makes: by default PUT /api/setting/* as @updateSetting and PUT /api/setting as @updateSettings.
 */
export const groupMappingCardHelpers = ({
  sectionTestId,
  nameLabel,
  switchWrite = { alias: "updateSetting", valuePath: "value" },
  mappingsAlias = "updateSettings",
}: GroupMappingCardOptions) => {
  const groupMappingSection = () => cy.findByTestId(sectionTestId);

  const groupMappingSwitch = () =>
    cy.findByRole("switch", { name: "Group mapping" });

  const mappingRow = (name: string) =>
    cy.contains('[data-testid="group-mapping-row"]', name);

  const newMappingButton = () =>
    groupMappingSection().findByRole("button", { name: "New" });

  const groupsPicker = () => cy.findByLabelText("Metabase groups");

  // Mantine hides the switch input, so the click goes to the title label wired to it
  const clickGroupMappingSwitch = () =>
    groupMappingSection().contains("label", "Group mapping").click();

  const toggleGroupMapping = (enabled: boolean) => {
    groupMappingSwitch().should(enabled ? "not.be.checked" : "be.checked");
    clickGroupMappingSwitch();
    cy.wait(`@${switchWrite.alias}`)
      .its(`request.body.${switchWrite.valuePath}`)
      .should("equal", enabled);
  };

  const addMapping = (name: string, groups: string[]) => {
    newMappingButton().click();
    cy.findByLabelText(nameLabel).type(name);
    groupsPicker().click();
    groups.forEach((group) => {
      cy.findByRole("option", { name: group }).click();
    });
    cy.button("Add mapping").click();
    cy.wait(`@${mappingsAlias}`);
    mappingRow(name).should("contain", groups.join(", "));
  };

  const deleteMapping = (
    name: string,
    consequenceLabel: string | RegExp,
    confirmLabel: string,
  ) => {
    mappingRow(name).findByLabelText("Delete mapping").click();
    H.modal().within(() => {
      cy.findByText("Remove this group mapping?").should("be.visible");
      cy.findByRole("radio", { name: consequenceLabel }).click();
      cy.button(confirmLabel).click();
    });
    cy.wait(`@${mappingsAlias}`);
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
