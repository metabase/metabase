import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  resetTestTable,
  restore,
  resyncDatabase,
  startNewQuestion,
} from "e2e/support/helpers";

describe("scenarios > organization > entity picker", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("data picker", () => {
    describe("tables", () => {
      it("should search for tables in the only database", () => {
        startNewQuestion();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
        });
        testLocalSearch({
          searchPlaceholder: "Search this database or everywhere…",
          searchText: "prod",
          selectedItem: "“Public”",
          foundItems: ["Products"],
          notFoundItems: ["Orders"],
        });
        entityPickerModal().findByText("Products").click();
        getNotebookStep("data").findByText("Products").should("be.visible");
      });

      it(
        "should search for tables when there are multiple databases",
        { tags: "@external" },
        () => {
          resetTestTable({ type: "postgres", table: "multi_schema" });
          restore("postgres-writable");
          cy.signInAsAdmin();
          resyncDatabase({ dbId: WRITABLE_DB_ID });
          cy.signInAsNormalUser();

          cy.log("first database - pre-selected");
          startNewQuestion();
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this database or everywhere…",
            searchText: "prod",
            selectedItem: "“Public”",
            foundItems: ["Products"],
            notFoundItems: ["Orders"],
          });

          cy.log("second database");
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Writable Postgres12").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this schema or everywhere…",
            searchText: "s",
            selectedItem: "“Domestic”",
            foundItems: ["Animals"],
            notFoundItems: ["Birds"],
          });

          cy.log("first database - manually selected");
          startNewQuestion();
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Sample Database").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this database or everywhere…",
            searchText: "prod",
            selectedItem: "“Public”",
            foundItems: ["Products"],
            notFoundItems: ["Orders"],
          });
        },
      );

      it(
        "should search for tables in a multi-schema database",
        { tags: "@external" },
        () => {
          resetTestTable({ type: "postgres", table: "multi_schema" });
          restore("postgres-writable");
          cy.signInAsAdmin();
          resyncDatabase({ dbId: WRITABLE_DB_ID });
          cy.signInAsNormalUser();

          cy.log("first schema");
          startNewQuestion();
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Writable Postgres12").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this schema or everywhere…",
            searchText: "s",
            selectedItem: "“Domestic”",
            foundItems: ["Animals"],
            notFoundItems: ["Birds"],
          });

          cy.log("second schema");
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Wild").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this schema or everywhere…",
            searchText: "s",
            selectedItem: "“Wild”",
            foundItems: ["Animals", "Birds"],
          });
        },
      );
    });
  });
});

function testLocalSearch({
  searchPlaceholder,
  searchText,
  selectedItem,
  foundItems = [],
  notFoundItems = [],
}: {
  searchPlaceholder: string;
  searchText: string;
  selectedItem: string;
  foundItems?: string[];
  notFoundItems?: string[];
}) {
  entityPickerModal().within(() => {
    cy.findByPlaceholderText(searchPlaceholder).clear().type(searchText);
    cy.findByLabelText(selectedItem).should("be.checked");
    foundItems.forEach(item => {
      cy.findByText(item).should("be.visible");
    });
    notFoundItems.forEach(item => {
      cy.findByText(item).should("not.exist");
    });
  });
}
