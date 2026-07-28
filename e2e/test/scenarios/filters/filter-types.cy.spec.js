const { H } = cy;

const DATE_SHORTCUT_CASES = [
  {
    title: "today",
    shortcut: "Today",
    expectedDisplayName: "Created At is today",
  },
  {
    title: "yesterday",
    shortcut: "Yesterday",
    expectedDisplayName: "Created At is yesterday",
  },
  {
    title: "previous week",
    shortcut: "Previous week",
    expectedDisplayName: "Created At is in the previous week",
  },
  {
    title: "previous 7 days",
    shortcut: "Previous 7 days",
    expectedDisplayName: "Created At is in the previous 7 days",
  },
  {
    title: "previous 30 days",
    shortcut: "Previous 30 days",
    expectedDisplayName: "Created At is in the previous 30 days",
  },
  {
    title: "previous month",
    shortcut: "Previous month",
    expectedDisplayName: "Created At is in the previous month",
  },
  {
    title: "previous 3 months",
    shortcut: "Previous 3 months",
    expectedDisplayName: "Created At is in the previous 3 months",
  },
  {
    title: "previous 12 months",
    shortcut: "Previous 12 months",
    expectedDisplayName: "Created At is in the previous 12 months",
  },
];

describe("scenarios > filters > filter types", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("date filters", () => {
    describe("shortcuts", () => {
      DATE_SHORTCUT_CASES.forEach(
        ({ title, shortcut, expectedDisplayName }) => {
          it(title, () => {
            H.openProductsTable({ mode: "notebook" });
            H.filter({ mode: "notebook" });

            H.clauseStepPopover().within(() => {
              cy.findByText("Created At").click();
              cy.findByText(shortcut).click();
            });
            assertFilterName(expectedDisplayName);
            H.visualize();
            assertFiltersExist();
          });
        },
      );
    });
  });
});

function assertFilterName(filterName, options) {
  H.getNotebookStep("filter", options)
    .findByText(filterName)
    .should("be.visible");
}

function assertFiltersExist() {
  cy.findByTestId("qb-filters-panel").should("be.visible");
}
