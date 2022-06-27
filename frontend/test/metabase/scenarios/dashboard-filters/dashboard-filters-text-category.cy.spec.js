import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  visitDashboard,
} from "__support__/e2e/helpers";

import { DASHBOARD_TEXT_FILTERS } from "./helpers/e2e-dashboard-filter-data-objects";
import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

Object.entries(DASHBOARD_TEXT_FILTERS).forEach(
  ([filter, { value, representativeResult }]) => {
    describe("scenarios > dashboard > filters > text/category", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        visitDashboard(1);

        editDashboard();
        setFilter("Text or Category", filter);

        cy.findByText("Select…").click();
        popover()
          .contains("Source")
          .click();
      });

      it(`should work for "${filter}" when set through the filter widget`, () => {
        saveDashboard();

        filterWidget().click();

        applyFilterByType(filter, value);

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });

      it(`should work for "${filter}" when set as the default filter`, () => {
        cy.findByText("Default value")
          .next()
          .click();

        applyFilterByType(filter, value);

        saveDashboard();

        cy.get(".Card").within(() => {
          cy.contains(representativeResult);
        });
      });
    });
  },
);
