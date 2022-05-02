import moment from "moment";
import _ from "underscore";
import {
  restore,
  sidebar,
  popover,
  openOrdersTable,
} from "__support__/e2e/cypress";

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

  describe("sidebar", () => {
    it("should go to field selection with one click", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Filter").click();
      sidebar().within(() => {
        cy.contains("Created At")
          .first()
          .click();
        cy.contains("Specific dates...").should("exist");
        cy.icon("chevronleft").click();
        cy.contains("Created At").should("exist");
        cy.contains("Specific dates...").should("not.exist");
      });
    });
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
        cy.findByText("Showing 2 rows").should("exist");
      }),
    );

    it("should not clobber filter when value is set to 1", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Created At").click();
      cy.findByText("Filter by this column").click();
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByText("Last 30 Days").click();
      cy.wait("@dataset");

      cy.findByText("Created At Previous 30 Days").click();
      cy.findByDisplayValue("30")
        .clear()
        .type(1)
        .blur();
      cy.findByText("day").click();
      popover()
        .last()
        .within(() => cy.findByText("year").click());
      popover().within(() => cy.icon("ellipsis").click());
      popover()
        .last()
        .within(() => cy.findByText("Starting from...").click());
      cy.findAllByDisplayValue("1")
        .last()
        .clear()
        .type(2)
        .blur();
      cy.button("Add filter").should("be.enabled");
    });
  });

  describe("basic functionality", () => {
    it("should go back to shortcuts view", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Specific dates...").click();
        cy.icon("chevronleft")
          .first()
          .click();
        cy.findByText("Specific dates...").should("exist");
        cy.icon("chevronleft").click();
        cy.findByText("Specific dates...").should("not.exist");
        cy.findByText("Created At").click();
        cy.findByText("Specific dates...").should("exist");
        cy.findByText("Between").should("not.exist");
      });
    });

    it("current filters should work (metabase#21977)", () => {
      openOrdersTable();

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByTextEnsureVisible("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative dates...").click();
        cy.findByText("Current").click();
        cy.findByText("Year").click();
      });
      cy.wait("@dataset");

      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
      cy.findByText("No results!").should("exist");
    });

    it("Relative dates should default to past filter (metabase#22027)", () => {
      openOrdersTable();

      cy.findByTextEnsureVisible("Created At").click();
      popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Relative dates...").click();
        cy.findByText("Day").should("not.exist");
        cy.findByText("Quarter").should("not.exist");
        cy.findByText("Month").should("not.exist");
        cy.findByText("Year").should("not.exist");
        cy.findByText("days").should("exist");
      });
    });

    it("should change the starting from units to match (metabase#22222)", () => {
      openOrdersTable();

      openCreatedAt("Past");
      addStartingFrom();
      popover().within(() => cy.findByText("days").click());
      popover()
        .last()
        .within(() => cy.findByText("months").click());
      popover().within(() => {
        cy.findByText("days ago").should("not.exist");
        cy.findByText("months ago").should("exist");
      });
    });

    it("should show correct datetime preview (metabase#22225)", () => {
      openOrdersTable();

      openCreatedAt("Past");
      addStartingFrom();
      popover().within(() => cy.findByText("days").click());
      popover()
        .last()
        .within(() => cy.findByText("quarters").click());
      popover().within(() => {
        cy.findAllByDisplayValue("30")
          .clear()
          .type(1);
        cy.findAllByDisplayValue("7")
          .clear()
          .type(6)
          .blur();
        const start = moment()
          .startOf("quarter")
          .add(-7, "quarter");
        const end = start.clone().endOf("quarter");
        cy.findByText(
          `${start.format("MMM D, YYYY")} - ${end.format("MMM D, YYYY")}`,
        ).should("exist");
      });
    });

    it("should allow changing values with starting from (metabase#22227)", () => {
      openOrdersTable();

      cy.intercept("POST", "/api/dataset").as("dataset");
      openCreatedAt("Past");
      addStartingFrom();
      popover().within(() => cy.findByText("days").click());
      popover()
        .last()
        .within(() => cy.findByText("months").click());
      cy.findAllByDisplayValue("30")
        .clear()
        .type(1);
      popover().within(() => {
        cy.findByText("Add filter").click();
      });
      cy.wait("@dataset");

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByText("Created At Previous Month, starting 7 months ago").click();
      popover().within(() => {
        cy.findAllByDisplayValue("1")
          .clear()
          .type(3)
          .blur();
        cy.findByText("Update filter").click();
      });
      cy.wait("@dataset");

      cy.findByText(
        "Created At Previous 3 Months, starting 7 months ago",
      ).click();
      popover().within(() => {
        cy.findAllByDisplayValue("7")
          .clear()
          .type(30)
          .blur();
        cy.findByText("Update filter").click();
      });
      cy.wait("@dataset");
      cy.findByText(
        "Created At Previous 3 Months, starting 30 months ago",
      ).should("exist");
    });

    it("starting from option should set correct sign (metabase#22228)", () => {
      openOrdersTable();

      cy.intercept("POST", "/api/dataset").as("dataset");

      openCreatedAt("Next");
      addStartingFrom();
      popover().within(() => {
        cy.findByText("Add filter").click();
      });
      cy.wait("@dataset");

      cy.findByText("Created At Next 30 Days, starting 7 days ago").should(
        "not.exist",
      );
      cy.findByText("Created At Next 30 Days, starting 7 days from now").should(
        "exist",
      );
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
    cy.findByText("Relative dates...").click();
    tab && cy.findByText(tab).click();
  });
};

const addStartingFrom = () => {
  popover().within(() => {
    cy.icon("ellipsis").click();
  });
  popover()
    .last()
    .within(() => cy.findByText("Starting from...").click());
};

const withStartingFrom = (dir, [num, unit], [startNum, startUnit]) => {
  cy.findByText("testcol").click();
  cy.findByText("Filter by this column").click();
  cy.findByText("Relative dates...").click();
  popover().within(() => {
    cy.findByText(dir).click();
  });
  addStartingFrom();
  popover().within(() => cy.findByText("days").click());
  popover()
    .last()
    .within(() => cy.findByText(unit).click());
  popover().within(() => {
    cy.findByText(dir === "Past" ? `${unit} ago` : `${unit} from now`).click();
  });
  popover()
    .last()
    .within(() =>
      cy
        .findByText(startUnit + (dir === "Past" ? " ago" : " from now"))
        .click(),
    );

  popover().within(() => {
    cy.findAllByDisplayValue("30")
      .clear()
      .type(num);
    cy.findAllByDisplayValue("7")
      .clear()
      .type(startNum);
  });

  cy.intercept("POST", "/api/dataset").as("dataset");
  popover().within(() => cy.findByText("Add filter").click());
  cy.wait("@dataset");
};
