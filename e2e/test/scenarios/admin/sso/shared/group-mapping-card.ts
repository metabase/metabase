const { H } = cy;

type GroupMappingCardOptions = {
  sectionTestId: string;
  nameLabel: string;
  newMappingLabel?: string;
  switchRequestAlias?: string;
  switchValuePath?: string;
  mappingsRequestAlias?: string;
};

/** The calling spec must alias the intercepts these helpers wait on. */
export const groupMappingCardHelpers = ({
  sectionTestId,
  nameLabel,
  newMappingLabel = "New",
  switchRequestAlias = "updateSetting",
  switchValuePath = "value",
  mappingsRequestAlias = "updateSettings",
}: GroupMappingCardOptions) => {
  const groupMappingSection = () => cy.findByTestId(sectionTestId);

  const groupMappingSwitch = () =>
    cy.findByRole("switch", { name: "Group mapping" });

  const mappingRow = (name: string) =>
    cy.contains('[data-testid="group-mapping-row"]', name);

  const newMappingButton = () =>
    groupMappingSection().findByRole("button", { name: newMappingLabel });

  const groupsPicker = () => cy.findByLabelText("Metabase groups");

  const toggleGroupMapping = (enabled: boolean) => {
    groupMappingSwitch().should(enabled ? "not.be.checked" : "be.checked");
    // a click during a write is ignored, so wait for the switch to be free first
    groupMappingSwitch().should("not.have.attr", "aria-disabled");
    groupMappingSection().contains("label", "Group mapping").click();
    cy.wait(`@${switchRequestAlias}`)
      .its(`request.body.${switchValuePath}`)
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
    cy.wait(`@${mappingsRequestAlias}`);
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
    cy.wait(`@${mappingsRequestAlias}`);
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
