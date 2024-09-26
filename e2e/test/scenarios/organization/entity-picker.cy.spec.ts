import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  NO_COLLECTION_PERSONAL_COLLECTION_ID,
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
const { ALL_USERS_GROUP } = USER_GROUPS;

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
          enterSearchText({
            text: "prod",
            placeholder: "Search this database or everywhere…",
          });
          localSearchTab("Public").should("be.checked");
          assertSearchResults({
            foundItems: ["Products"],
            notFoundItems: ["Orders"],
          });
          cy.findByText("Products").click();
        });
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
            enterSearchText({
              text: "prod",
              placeholder: "Search this database or everywhere…",
            });
            localSearchTab("Public").should("be.checked");
            assertSearchResults({
              foundItems: ["Products"],
              notFoundItems: ["Orders"],
            });
          });

          cy.log("second database");
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Writable Postgres12").click();
            enterSearchText({
              text: "s",
              placeholder: "Search this schema or everywhere…",
            });
            localSearchTab("Domestic").should("be.checked");
            assertSearchResults({
              foundItems: ["Animals"],
              notFoundItems: ["Birds"],
            });
          });

          cy.log("first database - manually selected");
          startNewQuestion();
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Sample Database").click();
            enterSearchText({
              text: "prod",
              placeholder: "Search this database or everywhere…",
            });
            localSearchTab("Public").should("be.checked");
            assertSearchResults({
              foundItems: ["Products"],
              notFoundItems: ["Orders"],
            });
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
            enterSearchText({
              text: "s",
              placeholder: "Search this schema or everywhere…",
            });
            localSearchTab("Domestic").should("be.checked");
            assertSearchResults({
              foundItems: ["Animals"],
              notFoundItems: ["Birds"],
            });
          });

          cy.log("second schema");
          entityPickerModal().within(() => {
            entityPickerModalTab("Tables").click();
            cy.findByText("Wild").click();
            enterSearchText({
              text: "s",
              placeholder: "Search this schema or everywhere…",
            });
            localSearchTab("Wild").should("be.checked");
            assertSearchResults({
              foundItems: ["Animals", "Birds"],
            });
          });
        },
      );
    });

    describe("cards", () => {
      const tabs = ["Saved questions", "Models", "Metrics"];

      it("should search for cards for a normal user", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.signInAsNormalUser();
        startNewQuestion();

        tabs.forEach(tab => {
          cy.log("root collection - automatically selected");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            enterSearchText({
              text: "2",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("Our analytics").should("be.checked");
            assertSearchResults({
              foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
              notFoundItems: [
                "Root question 1",
                "Regular question 2",
                "Admin personal question 2",
                "Normal personal question 2",
              ],
            });
          });

          cy.log("regular collection");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("First collection").click();
            enterSearchText({
              text: "1",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("First collection").should("be.checked");
            assertSearchResults({
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
          });

          cy.log("root collection - manually selected");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("Our analytics").click();
            enterSearchText({
              text: "2",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("Our analytics").should("be.checked");
            assertSearchResults({
              foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
              notFoundItems: [
                "Root model 1",
                "Regular model 2",
                "Admin personal model 2",
                "Normal personal model 2",
              ],
            });
          });

          cy.log("personal collection");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText(/Personal Collection/).click();
            enterSearchText({
              text: "1",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("Robert Tableton's Personal Collection").should(
              "be.checked",
            );
            assertSearchResults({
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

      it("should search for cards when there is no access to the root collection", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.log("grant `nocollection` user access to `First collection`");
        cy.log("personal collections are always available");
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        cy.signIn("nocollection");
        startNewQuestion();

        tabs.forEach(tab => {
          cy.log("inaccessible root collection - automatically selected");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            enterSearchText({
              text: "1",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("Collections").should("be.checked");
            assertSearchResults({
              notFoundItems: [
                "Root metric 1",
                "Regular metric 1",
                "Admin personal metric 1",
                "Normal personal metric 2",
              ],
            });
            cy.findByText("Didn't find anything").should("be.visible");
          });

          cy.log("regular collection");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("First collection").click();
            enterSearchText({
              text: "1",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("First collection").should("be.checked");
            assertSearchResults({
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
                "No collection personal question 1",
              ],
            });
          });

          cy.log("inaccessible root collection - manually selected");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("Collections").click();
            enterSearchText({
              text: "1",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab("Collections").should("be.checked");
            assertSearchResults({
              notFoundItems: [
                "Root metric 1",
                "Regular metric 1",
                "Admin personal metric 1",
                "Normal personal metric 2",
              ],
            });
            cy.findByText("Didn't find anything").should("be.visible");
          });

          cy.log("personal collection");
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText(/Personal Collection/).click();
            enterSearchText({
              text: "1",
              placeholder: "Search this collection or everywhere…",
            });
            localSearchTab(
              "No Collection Tableton's Personal Collection",
            ).should("be.checked");
            assertSearchResults({
              foundItems: [
                "No collection personal question 1",
                "No collection personal model 1",
                "No collection personal metric 1",
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
});

function createTestCards() {
  const types = ["question", "model", "metric"] as const;
  const suffixes = ["1", "2"];
  const collections = [
    { id: null, name: "Root" },
    { id: FIRST_COLLECTION_ID, name: "Regular" },
    { id: ADMIN_PERSONAL_COLLECTION_ID, name: "Admin personal" },
    { id: NORMAL_PERSONAL_COLLECTION_ID, name: "Normal personal" },
    {
      id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
      name: "No collection personal",
    },
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

// function globalSearchTab() {
//   return cy.findByLabelText("Everywhere");
// }

function localSearchTab(selectedItem: string) {
  return cy.findByLabelText(`“${selectedItem}”`);
}

function enterSearchText({
  text,
  placeholder,
}: {
  text: string;
  placeholder: string;
}) {
  cy.findByPlaceholderText(placeholder).clear().type(text);
}

function assertSearchResults({
  foundItems = [],
  notFoundItems = [],
}: {
  foundItems?: string[];
  notFoundItems?: string[];
}) {
  foundItems.forEach(item => {
    cy.findByText(item).should("be.visible");
  });
  notFoundItems.forEach(item => {
    cy.findByText(item).should("not.exist");
  });
}
