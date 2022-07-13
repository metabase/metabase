import moment from "moment";
import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";

describe("issue 22482", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitDashboard(1);

    editDashboard();
    setFilter("Time", "All Options");

    cy.findByText("Select…").click();
    popover().contains("Created At").eq(0).click();

    saveDashboard();

    filterWidget().click();
    cy.findByText("Relative dates...").click();
  });

  it("should round relative date range (metabase#22482)", () => {
    cy.findByTestId("relative-datetime-value").clear().type(15);
    cy.findByTestId("relative-datetime-unit").click();
    cy.findByText("months").click();

    const expectedRange = getFormattedRange(
      moment().startOf("month").add(-15, "month"),
      moment().add(-1, "month").endOf("month"),
    );

    cy.findByText(expectedRange);
  });
});

function getFormattedRange(start, end) {
  return `${start.format("MMM D, YYYY")} - ${end.format("MMM D, YYYY")}`;
}
