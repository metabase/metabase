import {
  restore,
  popover,
  onlyOnOSS,
  entityPickerModalTab,
  navigationSidebar,
  entityPickerModal,
} from "e2e/support/helpers";

const modelName = "Orders Model";

// this is only testable in OSS because EE always has models from auditv2
describe("issue 19776", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore();
    cy.signInAsAdmin();
  });

  it("should show moved model in the data picker without refreshing (metabase#19776)", () => {
    cy.visit("/");

    cy.findByTestId("app-bar").button("New").click();
    popover().findByText("Question").click();
    entityPickerModalTab("Models").should("be.visible"); // now you see it
    entityPickerModal().findByLabelText("Close").click();

    // navigate without a page load
    cy.findByTestId("sidebar-toggle").click();
    navigationSidebar().findByText("Our analytics").click();

    // archive the only model
    cy.findByTestId("collection-table").within(() => {
      openEllipsisMenuFor(modelName);
    });
    popover().contains("Archive").click();
    cy.findByTestId("undo-list").findByText("Archived model");

    cy.findByTestId("app-bar").button("New").click();
    popover().findByText("Question").click();
    entityPickerModalTab("Models").should("not.exist"); // now you don't
  });
});

function openEllipsisMenuFor(item) {
  cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
}
