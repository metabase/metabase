import { dayjs } from "metabase/dayjs";

const { H } = cy;

const STARTING_FROM_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "quarters",
  "years",
];

describe("scenarios > question > relative-datetime", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("starting from", () => {
    STARTING_FROM_UNITS.forEach((unit) =>
      it(`should work with Past filters (${unit} ago)`, () => {
        const now = dayjs().utc();
        nativeSQL([
          now,
          now.add(-1, unit),
          now.add(-14, unit),
          now.add(-15, unit),
          now.add(-30, unit),
        ]);
        withStartingFrom("Previous", [10, unit], [10, unit]);
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Showing 2 rows").should("exist");
      }),
    );

    STARTING_FROM_UNITS.forEach((unit) =>
      it(`should work with Next filters (${unit} from now)`, () => {
        const now = dayjs().utc();
        nativeSQL([
          now,
          now.add(1, unit),
          now.add(14, unit),
          now.add(15, unit),
          now.add(30, unit),
        ]);
        withStartingFrom("Next", [10, unit], [10, unit]);
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Showing 2 rows").should("exist");
      }),
    );

    it("should not clobber filter when value is set to 1", () => {
      H.openOrdersTable();

      H.tableHeaderClick("Created At");

      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Previous 30 days").should("be.visible");
        cy.icon("chevronleft").should("not.exist");
        cy.findByText("Previous 30 days").click();
      });

      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is in the previous 30 days")
        .click();

      setRelativeDatetimeValue(1);
      setRelativeDatetimeUnit("year");
      addStartingFrom();
      setStartingFromValue(2);

      H.popover().button("Update filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is in the previous year, starting 2 years ago")
        .should("be.visible");
    });
  });

  function assertOptions(expectedOptions) {
    cy.findAllByRole("option").should(($options) => {
      expect(Cypress._.map($options, "textContent")).to.deep.equal(
        expectedOptions,
      );
    });
  }

  describe("basic functionality", () => {
    it("starting from should contain units only equal or greater than the filter unit", () => {
      H.openOrdersTable();

      H.tableHeaderClick("Created At");
      H.clickActionsPopover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative date range…").click();
      });

      addStartingFrom();

      H.clickActionsPopover()
        .findByRole("textbox", { name: "Starting from unit" })
        .click();

      assertOptions([
        "days ago",
        "weeks ago",
        "months ago",
        "quarters ago",
        "years ago",
      ]);

      setRelativeDatetimeUnit(/quarters/);
      H.clickActionsPopover()
        .findByRole("textbox", { name: "Starting from unit" })
        .click();

      assertOptions(["quarters ago", "years ago"]);
    });

    it("should go back to shortcuts view", () => {
      H.openOrdersTable();

      H.tableHeaderClick("Created At");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Fixed date range…").click();
        cy.icon("chevronleft").first().click();
        cy.findByText("Fixed date range…").should("exist");
        cy.findByText("Between").should("not.exist");
      });
    });

    it("relative dates should default to past filter and current filters should work (metabase#22027, metabase#21977)", () => {
      H.openOrdersTable();

      H.tableHeaderClick("Created At");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative date range…").click();
        cy.findByDisplayValue("days").should("exist");
        cy.findByText("Day").should("not.exist");
        cy.findByText("Quarter").should("not.exist");
        cy.findByText("Month").should("not.exist");
        cy.findByText("Year").should("not.exist");

        cy.findByText("Current").click();
        cy.findByText("Year").click();
      });
      cy.wait("@dataset");

      H.queryBuilderMain()
        .findByText("There was a problem with your question")
        .should("not.exist");

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is this year")
        .should("be.visible");
    });

    it("should match the starting from units and allow changing values with starting from (metabase#22222, metabase#22227)", () => {
      H.openOrdersTable();

      openCreatedAt("Previous");
      addStartingFrom();
      setRelativeDatetimeUnit("months");
      H.clickActionsPopover().within(() => {
        cy.findByDisplayValue("months ago").should("exist");
        cy.findByDisplayValue("days ago").should("not.exist");
      });
      setRelativeDatetimeValue(1);
      H.popover().button("Add filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText(
          "Created At is in the previous month, starting 7 months ago",
        )
        .click();
      setRelativeDatetimeValue(3);
      H.popover().button("Update filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText(
          "Created At is in the previous 3 months, starting 7 months ago",
        )
        .click();
      setStartingFromValue(30);
      H.popover().button("Update filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText(
          "Created At is in the previous 3 months, starting 30 months ago",
        )
        .should("be.visible");
    });

    it("starting from option should set correct sign (metabase#22228)", () => {
      H.openOrdersTable();

      openCreatedAt("Next");
      addStartingFrom();
      H.popover().button("Add filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel").within(() => {
        const baseName = "Created At is in the next 30 days";
        cy.findByText(`${baseName}, starting 7 days from now`).should(
          "be.visible",
        );
        cy.findByText(`${baseName}, starting 7 days ago`).should("not.exist");
      });
    });
  });
});

const nativeSQL = (values) => {
  cy.intercept("POST", "/api/dataset").as("dataset");

  const queries = values.map((value) => {
    const date = dayjs(value).utc();
    return `SELECT '${date.toISOString()}'::timestamp as "testcol"`;
  });

  H.createNativeQuestion(
    {
      name: "datetime",
      native: {
        query: queries.join(" UNION ALL "),
      },
    },
    { visitQuestion: true },
  );

  cy.findByText("Explore results").click();
  cy.wait("@dataset");
};

const openCreatedAt = (tab) => {
  H.tableHeaderClick("Created At");
  H.popover().within(() => {
    cy.findByText("Filter by this column").click();
    cy.findByText("Relative date range…").click();
    if (tab) {
      cy.findByText(tab).click();
    }
  });
};

const addStartingFrom = () => {
  H.popover()
    .findByLabelText(/Starting from/)
    .click();
};

const setRelativeDatetimeUnit = (unit) => {
  cy.findByRole("textbox", { name: "Unit" }).click();
  cy.findByRole("option", { name: unit }).click();
};

const setRelativeDatetimeValue = (value) => {
  cy.findByLabelText("Interval").click().clear().type(value).blur();
};

const setStartingFromValue = (value) => {
  cy.findByLabelText("Starting from interval")
    .click()
    .clear()
    .type(value)
    .blur();
};

const withStartingFrom = (dir, [num, unit], [startNum, startUnit]) => {
  H.tableHeaderClick("testcol");
  cy.findByTextEnsureVisible("Filter by this column").click();
  cy.findByTextEnsureVisible("Relative date range…").click();
  H.clickActionsPopover().within(() => {
    cy.findByText(dir).click();
  });

  H.relativeDatePicker.setValue({ unit, value: num }, H.clickActionsPopover);
  H.relativeDatePicker.addStartingFrom(
    {
      value: startNum,
      unit: startUnit + (dir === "Previous" ? " ago" : " from now"),
    },
    H.clickActionsPopover,
  );

  cy.intercept("POST", "/api/dataset").as("dataset");
  H.clickActionsPopover().within(() => cy.findByText("Add filter").click());
  cy.wait("@dataset");
};
