const { H } = cy;

type GroupMappingCardOptions = {
  sectionTestId: string;
  nameLabel: string;
  // the label of the button that starts a mapping, which the JWT card calls "New mapping"
  newMappingLabel?: string;
  // alias of the intercepted request a switch click sends
  switchRequestAlias?: string;
  // path of the new on/off value inside that request's body, for instance "group-sync.enabled"
  switchValuePath?: string;
  // alias of the intercepted request that saves the mappings
  mappingsRequestAlias?: string;
};

/**
 * Helpers for the group mapping card the SSO pages share.
 * The spec intercepts the card's requests itself.
 * By default the switch sends `PUT /api/setting/*`, aliased `updateSetting`, with the new value at `body.value`, and the mappings are saved with `PUT /api/setting`, aliased `updateSettings`.
 */
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

  // Mantine hides the switch input, so the click goes to the title label wired to it
  const clickGroupMappingSwitch = () => {
    // a click during a write is ignored, so wait for the switch to be free first
    groupMappingSwitch().should("not.have.attr", "aria-disabled");
    groupMappingSection().contains("label", "Group mapping").click();
  };

  const toggleGroupMapping = (enabled: boolean) => {
    groupMappingSwitch().should(enabled ? "not.be.checked" : "be.checked");
    clickGroupMappingSwitch();
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
