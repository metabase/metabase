import {
  popover,
  restore,
  selectDashboardFilter,
  editDashboard,
  showDashboardCardActions,
  filterWidget,
  sidebar,
  modal,
  openNewCollectionItemFlowFor,
  visitDashboard,
  appBar,
  rightSidebar,
  getDashboardCardMenu,
  addOrUpdateDashboardCard,
  openQuestionsSidebar,
} from "e2e/support/helpers";

import {SAMPLE_DB_ID} from "e2e/support/cypress_data";
import {SAMPLE_DATABASE} from "e2e/support/cypress_sample_database";

const {ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID} = SAMPLE_DATABASE;

describe("scenarios > dashboard card resizing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

  });

  it("should allow cards to be resized", () => {

  });
});
