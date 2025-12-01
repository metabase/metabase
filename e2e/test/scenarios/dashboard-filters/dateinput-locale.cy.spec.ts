import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";

import "dayjs/locale/de";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import * as DateFilter from "e2e/test/scenarios/native-filters/helpers/e2e-date-filter-helpers";

const { H } = cy;

// Enable LL token in the test runner
dayjs.extend(localizedFormat);

const localesAndExpected = [
  {
    localeName: "English",
    expectedDateRange: {
      startDate: "January 2, 2025",
      endDate: "February 3, 2025",
    },
  },
  {
    localeName: "German",
    expectedDateRange: {
      startDate: "2. Januar 2025",
      endDate: "3. Februar 2025",
    },
  },
];

const selectLocale = (localeName: string) => {
  cy.visit("/", {
    // set the browser language as per:
    // https://glebbahmutov.com/blog/cypress-tips-and-tricks/index.html#control-navigatorlanguage
    onBeforeLoad(win) {
      Object.defineProperty(win.navigator, "language", {
        value: localeName,
      });
    },
  });
};

const dashboard = () => cy.findByTestId("dashboard");

describe("scenarios > dashboard > date filter locale", () => {
  describe("Dashboard date picker format should respect locale settings", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    localesAndExpected.forEach(({ localeName, expectedDateRange }) => {
      it(`shows LL-formatted values for specific date range for ${localeName} language`, () => {
        selectLocale(localeName);
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
        const filterType = "Date Range";
        H.setFilter("Date picker", filterType);
        dashboard().findByText("Select…").click();

        H.popover().contains("Created At").first().click();
        H.saveDashboard();
        H.filterWidget().eq(0).click();
        DateFilter.setDateRange(expectedDateRange);

        cy.findByRole("dialog").within(() => {
          cy.findByLabelText("Start date").should(
            "have.value",
            expectedDateRange.startDate,
          );
          cy.findByLabelText("End date").should(
            "have.value",
            expectedDateRange.endDate,
          );
          cy.findByText("Add filter").click();
        });
        dashboard()
          .findByLabelText("Date")
          .findByTestId("parameter-value")
          .should(
            "have.text",
            `${expectedDateRange.startDate} - ${expectedDateRange.endDate}`,
          );
      });
    });
  });
});
