import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type StructuredQuestionDetails,
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  resetTestTable,
  restore,
  resyncDatabase,
  startNewQuestion,
} from "e2e/support/helpers";
const { ORDERS_ID } = SAMPLE_DATABASE;

const cardDetails: StructuredQuestionDetails = {
  name: "Question",
  type: "question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

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
          selectedItem: "Public",
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
            selectedItem: "Public",
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
            selectedItem: "Domestic",
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
            selectedItem: "Public",
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
            selectedItem: "Domestic",
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
            selectedItem: "Wild",
            foundItems: ["Animals", "Birds"],
          });
        },
      );
    });

    describe("cards", () => {
      it("should search for cards for a normal user", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.signInAsNormalUser();
        startNewQuestion();

        const tabs = ["Saved questions", "Models", "Metrics"];
        tabs.forEach(tab => {
          cy.log("root collection - automatically selected");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this collection or everywhere…",
            searchText: "2",
            selectedItem: "Our analytics",
            foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
            notFoundItems: [
              "Root question 1",
              "Regular question 2",
              "Admin personal question 2",
              "Normal personal question 2",
            ],
          });

          cy.log("regular collection");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("First collection").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this collection or everywhere…",
            searchText: "1",
            selectedItem: "First collection",
            foundItems: [
              "Regular question 1",
              "Regular model 1",
              "Regular metric 1",
            ],
            notFoundItems: [
              "Root question 1",
              "Regular question 2",
              "Admin personal question 1",
              "Normal personal question 1",
            ],
          });

          cy.log("root collection - manually selected");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("Our analytics").click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this collection or everywhere…",
            searchText: "2",
            selectedItem: "Our analytics",
            foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
            notFoundItems: [
              "Root model 1",
              "Regular model 2",
              "Admin personal model 2",
              "Normal personal model 2",
            ],
          });

          cy.log("personal collection");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText(/Personal Collection/).click();
          });
          testLocalSearch({
            searchPlaceholder: "Search this collection or everywhere…",
            searchText: "1",
            selectedItem: "Robert Tableton's Personal Collection",
            foundItems: [
              "Normal personal question 1",
              "Normal personal model 1",
              "Normal personal metric 1",
            ],
            notFoundItems: [
              "Root metric 1",
              "Regular metric 1",
              "Admin personal metric 1",
              "Normal personal metric 2",
            ],
          });
        });
      });
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
    cy.findByLabelText(`“${selectedItem}”`).should("be.checked");
    foundItems.forEach(item => {
      cy.findByText(item).should("be.visible");
    });
    notFoundItems.forEach(item => {
      cy.findByText(item).should("not.exist");
    });
  });
}

function createTestCards() {
  const types = ["question", "model", "metric"] as const;
  const suffixes = ["1", "2"];
  const collections = [
    { id: null, name: "Root" },
    { id: FIRST_COLLECTION_ID, name: "Regular" },
    { id: ADMIN_PERSONAL_COLLECTION_ID, name: "Admin personal" },
    { id: NORMAL_PERSONAL_COLLECTION_ID, name: "Normal personal" },
  ];

  types.forEach(type => {
    suffixes.forEach(suffix => {
      collections.forEach(({ id, name }) => {
        createQuestion({
          ...cardDetails,
          name: `${name} ${type} ${suffix}`,
          type,
          collection_id: id,
        });
      });
    });
  });
}
