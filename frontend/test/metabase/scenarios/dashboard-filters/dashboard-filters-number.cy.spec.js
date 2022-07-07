import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";

import { DASHBOARD_NUMBER_FILTERS } from "./helpers/e2e-dashboard-filter-data-objects";
import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

Object.entries(DASHBOARD_NUMBER_FILTERS).forEach(
  ([filter, { value, representativeResult }]) => {
    describe("scenarios > dashboard > filters > number", () => {
      beforeEach(() => {
        cy.intercept("GET", "/api/table/*/query_metadata").as("metadata");

        restore();
        cy.signInAsAdmin();

        visitDashboard(1);

        editDashboard();
        setFilter("Number", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("Tax")
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();
        addWidgetNumberFilter(value);

        cy.get(".Card").within(() => {
          cy.findByText(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        addWidgetNumberFilter(value);

        saveDashboard();

        cy.get(".Card").within(() => {
          cy.findByText(representativeResult);
        });
      });
    });
  },
);
