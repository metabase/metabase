import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";

import { DASHBOARD_LOCATION_FILTERS } from "./helpers/e2e-dashboard-filter-data-objects";
import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

Object.entries(DASHBOARD_LOCATION_FILTERS).forEach(
  ([filter, { value, representativeResult }]) => {
    describe("scenarios > dashboard > filters > location", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        visitDashboard(1);

        editDashboard();
        setFilter("Location", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("City")
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();
        addWidgetStringFilter(value);

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        addWidgetStringFilter(value);

        saveDashboard();

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });
    });
  },
);
