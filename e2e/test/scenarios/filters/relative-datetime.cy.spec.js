import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  openOrdersTable,
  queryBuilderMain,
  createNativeQuestion,
} from "e2e/support/helpers";

const { ORDERS } = SAMPLE_DATABASE;

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
  const now = moment().utc();

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("starting from", () => {
    const date = values =>
      values.reduce((val, [num, unit]) => val.add(num, unit), now.clone());

    STARTING_FROM_UNITS.forEach(unit =>
      it(`should work with Past filters (${unit} ago)`, () => {
        nativeSQL([
          now,
          date([[-1, unit]]),
          date([[-14, unit]]),
          date([[-15, unit]]),
          date([[-30, unit]]),
        ]);
        withStartingFrom("Past", [10, unit], [10, unit]);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Showing 2 rows").should("exist");
      }),
    );

    STARTING_FROM_UNITS.forEach(unit =>
      it(`should work with Next filters (${unit} from now)`, () => {
        nativeSQL([
          now,
          date([[1, unit]]),
          date([[14, unit]]),
          date([[15, unit]]),
          date([[30, unit]]),
        ]);
        withStartingFrom("Next", [10, unit], [10, unit]);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Showing 2 rows").should("exist");
      }),
    );

    it("should not clobber filter when value is set to 1", () => {
      openOrdersTable();

      queryBuilderMain().findByText("Created At").click();

      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.icon("chevronleft").should("not.exist");
        cy.findByText("Last 30 days").click();
      });

      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is in the previous 30 days")
        .click();

      setRelativeDatetimeValue(1);
      setRelativeDatetimeUnit("year");
      addStartingFrom();
      setStartingFromValue(2);

      popover().button("Update filter").should("be.enabled");
    });

    it("should be able to set starting from in a default SQL filter (metabase#46342)", () => {
      const questionDetails = {
        name: "46342",
        native: {
          "template-tags": {
            foo: {
              type: "dimension",
              name: "foo",
              id: "73b962fc-86f5-4b10-8958-7c7754334f9f",
              "display-name": "Foo",
              default: "past30days",
              dimension: ["field", ORDERS.CREATED_AT, null],
              "widget-type": "date/all-options",
              options: null,
            },
          },
          query: "select * from orders where {{foo}}",
        },
        parameters: [
          {
            id: "73b962fc-86f5-4b10-8958-7c7754334f9f",
            type: "date/all-options",
            target: ["dimension", ["template-tag", "foo"]],
            name: "Foo",
            slug: "foo",
            default: "past30days",
          },
        ],
      };

      createNativeQuestion(questionDetails, { visitQuestion: true });

      cy.log("Open sidebar filter options");
      cy.findByTestId("visibility-toggler").click();
      cy.findByTestId("native-query-editor-sidebar").icon("variable").click();
      cy.findByTestId("sidebar-right")
        .findByDisplayValue("Previous 30 Days")
        .click();

      cy.log("Set 'Starting from' to the default filter");
      cy.findByTestId("date-picker").findByLabelText("Options").click();
      popover().last().findByText("Starting from...").click();
      cy.findByTestId("date-picker").within(() => {
        cy.findByText("Starting from").should("be.visible");
        cy.findByTestId("starting-from-value")
          .should("be.visible")
          .and("have.value", "7");
        cy.findByTestId("starting-from-unit")
          .should("be.visible")
          .and("contain", "days ago");
        cy.button("Update filter").click();
      });

      cy.location("search").should("eq", "?foo=past30days-from-7days");
    });
  });

  function assertOptions(expectedOptions) {
    cy.findAllByRole("option").each(($option, index) => {
      cy.wrap($option).should("have.text", expectedOptions[index]);
    });
  }

  describe("basic functionality", () => {
    it("starting from should contain units only equal or greater than the filter unit", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative dates…").click();
      });

      addStartingFrom();

      popover().findByLabelText("Starting from unit").click();

      assertOptions([
        "days ago",
        "weeks ago",
        "months ago",
        "quarters ago",
        "years ago",
      ]);

      setRelativeDatetimeUnit("quarters");
      popover().findByLabelText("Starting from unit").click();

      assertOptions(["quarters ago", "years ago"]);
    });

    it("should go back to shortcuts view", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Specific dates…").click();
        cy.icon("chevronleft").first().click();
        cy.findByText("Specific dates…").should("exist");
        cy.findByText("Between").should("not.exist");
      });
    });

    it("current filters should work (metabase#21977)", () => {
      openOrdersTable();

      queryBuilderMain().findByText("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative dates…").click();
        cy.findByText("Current").click();
        cy.findByText("Year").click();
      });
      cy.wait("@dataset");

      queryBuilderMain()
        .findByText("There was a problem with your question")
        .should("not.exist");

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is this year")
        .should("be.visible");
    });

    it("Relative dates should default to past filter (metabase#22027)", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative dates…").click();
        cy.findByText("Day").should("not.exist");
        cy.findByText("Quarter").should("not.exist");
        cy.findByText("Month").should("not.exist");
        cy.findByText("Year").should("not.exist");
        cy.findByDisplayValue("days").should("exist");
      });
    });

    it("should change the starting from units to match (metabase#22222)", () => {
      openOrdersTable();

      openCreatedAt("Past");
      addStartingFrom();
      setRelativeDatetimeUnit("months");
      popover().within(() => {
        cy.findByDisplayValue("days ago").should("not.exist");
        cy.findByDisplayValue("months ago").should("exist");
      });
    });

    it("should allow changing values with starting from (metabase#22227)", () => {
      openOrdersTable();

      openCreatedAt("Past");
      addStartingFrom();
      setRelativeDatetimeUnit("months");
      setRelativeDatetimeValue(1);
      popover().button("Add filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText(
          "Created At is in the previous month, starting 7 months ago",
        )
        .click();
      setRelativeDatetimeValue(3);
      popover().button("Update filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText(
          "Created At is in the previous 3 months, starting 7 months ago",
        )
        .click();
      setStartingFromValue(30);
      popover().button("Update filter").click();
      cy.wait("@dataset");

      cy.findByTestId("qb-filters-panel")
        .findByText(
          "Created At is in the previous 3 months, starting 30 months ago",
        )
        .should("be.visible");
    });

    it("starting from option should set correct sign (metabase#22228)", () => {
      openOrdersTable();

      openCreatedAt("Next");
      addStartingFrom();
      popover().button("Add filter").click();
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

const nativeSQL = values => {
  cy.intercept("POST", "/api/dataset").as("dataset");

  const queries = values.map(value => {
    const date = moment(value).utc();
    return `SELECT '${date.toISOString()}'::timestamp as "testcol"`;
  });

  cy.createNativeQuestion(
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

const openCreatedAt = tab => {
  cy.findByTextEnsureVisible("Created At").click();
  popover().within(() => {
    cy.findByText("Filter by this column").click();
    cy.findByText("Relative dates…").click();
    tab && cy.findByText(tab).click();
  });
};

const addStartingFrom = () => {
  popover().findByLabelText("Options").click();
  popover()
    .last()
    .findByText(/Starting from/)
    .click();
};

const setRelativeDatetimeUnit = unit => {
  cy.findByLabelText("Unit").click();
  cy.findAllByText(unit).last().click();
};

const setRelativeDatetimeValue = value => {
  cy.findByLabelText("Interval").click().clear().type(value).blur();
};

const setStartingFromUnit = unit => {
  cy.findByLabelText("Starting from unit").click();
  cy.findAllByText(unit).last().click();
};

const setStartingFromValue = value => {
  cy.findByLabelText("Starting from interval")
    .click()
    .clear()
    .type(value)
    .blur();
};

const withStartingFrom = (dir, [num, unit], [startNum, startUnit]) => {
  cy.findByTextEnsureVisible("testcol").click();
  cy.findByTextEnsureVisible("Filter by this column").click();
  cy.findByTextEnsureVisible("Relative dates…").click();
  popover().within(() => {
    cy.findByText(dir).click();
  });
  addStartingFrom();

  setRelativeDatetimeValue(num);
  setRelativeDatetimeUnit(unit);

  setStartingFromValue(startNum);
  setStartingFromUnit(startUnit + (dir === "Past" ? " ago" : " from now"));

  cy.intercept("POST", "/api/dataset").as("dataset");
  popover().within(() => cy.findByText("Add filter").click());
  cy.wait("@dataset");
};
