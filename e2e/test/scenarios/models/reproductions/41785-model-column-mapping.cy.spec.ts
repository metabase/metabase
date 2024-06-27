import {
  entityPickerModal,
  entityPickerModalTab,
  join,
  modal,
  popover,
  queryBuilderMain,
  restore,
  startNewModel,
} from "e2e/support/helpers";

describe("issue 41785", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("does not break the question when removing column with the same mapping as another column (metabase#41785)", () => {
    // it's important to create the model through UI to reproduce this issue
    startNewModel();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    join();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });
    popover().findByText("ID").click();
    popover().findByText("ID").click();

    cy.findByTestId("run-button").click();
    cy.wait("@dataset");

    cy.button("Save").click();
    modal().button("Save").click();

    cy.findAllByTestId("cell-data").should("contain", "37.65");
    cy.findByTestId("loading-indicator").should("not.exist");

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findAllByText("Tax").should("have.length", 1);
      cy.findAllByText("Orders → Tax").should("have.length", 1);

      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findAllByText("Tax").should("have.length", 1);
      cy.findAllByText("Orders → Tax").should("have.length", 1).click();
    });

    cy.wait("@dataset");

    queryBuilderMain()
      .findByText("There was a problem with your question")
      .should("not.exist");
  });
});
