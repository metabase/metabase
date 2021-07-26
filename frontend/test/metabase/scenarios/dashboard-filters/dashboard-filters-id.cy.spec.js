import {
  restore,
  popover,
  mockSessionProperty,
  filterWidget,
  editDashboard,
  saveDashboard,
  setFilter,
  checkFilterLabelAndValue,
} from "__support__/e2e/cypress";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

describe("scenarios > dashboard > filters > ID", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    mockSessionProperty("field-filter-operators-enabled?", true);

    cy.visit("/dashboard/1");

    editDashboard();
    setFilter("ID");

    cy.findByText("Column to filter on")
      .next("a")
      .click();
  });

  describe("should work for the primary key", () => {
    beforeEach(() => {
      popover()
        .contains("ID")
        .first()
        .click();
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("15");

      cy.get(".Card").within(() => {
        cy.findByText("114.42");
      });
    });

    it("when set as the default filter", () => {
      cy.findByText("Default value")
        .next()
        .click();
      addWidgetStringFilter("15");

      saveDashboard();

      cy.get(".Card").within(() => {
        cy.findByText("114.42");
      });
    });
  });

  describe("should work for the foreign key", () => {
    beforeEach(() => {
      popover()
        .contains("User ID")
        .click();
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("4");

      cy.get(".Card").within(() => {
        cy.findByText("47.68");
      });

      checkFilterLabelAndValue("ID", "Arnold Adams - 4");
    });

    it("when set as the default filter", () => {
      cy.findByText("Default value")
        .next()
        .click();
      addWidgetStringFilter("4");

      saveDashboard();

      cy.get(".Card").within(() => {
        cy.findByText("47.68");
      });

      checkFilterLabelAndValue("ID", "Arnold Adams - 4");
    });
  });

  describe("should work on the implicit join", () => {
    beforeEach(() => {
      popover().within(() => {
        cy.findAllByText("ID")
          .last()
          .click();
      });
    });

    it("when set through the filter widget", () => {
      saveDashboard();

      filterWidget().click();
      addWidgetStringFilter("10");

      cy.get(".Card").within(() => {
        cy.findByText("6.75");
      });
    });

    it("when set as the default filter", () => {
      cy.findByText("Default value")
        .next()
        .click();
      addWidgetStringFilter("10");

      saveDashboard();

      cy.get(".Card").within(() => {
        cy.findByText("6.75");
      });
    });
  });
});
