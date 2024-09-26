import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  NO_COLLECTION_PERSONAL_COLLECTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type StructuredQuestionDetails,
  createCollection,
  createDashboard,
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  openQuestionActions,
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  startNewQuestion,
  visitQuestion,
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
    cy.signInAsAdmin();
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
                "Admin personal collection question 2",
                "Normal personal collection question 2",
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
                "Admin personal collection question 1",
                "Normal personal collection question 1",
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
                "Admin personal collection model 2",
                "Normal personal collection model 2",
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
                "Normal personal collection question 1",
                "Normal personal collection model 1",
                "Normal personal collection metric 1",
              ],
              notFoundItems: [
                "Root metric 1",
                "Regular metric 1",
                "Admin personal collection metric 1",
                "Normal personal collection metric 2",
              ],
            });
          });
        });
      });

      it("should search for cards when there is no access to the root collection", () => {
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
                "Admin personal collection metric 1",
                "Normal personal collection metric 2",
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
                "Admin personal collection question 1",
                "Normal personal collection question 1",
                "No collection personal collection question 1",
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
                "Admin personal collection metric 1",
                "Normal personal collection metric 2",
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
                "No collection personal collection question 1",
                "No collection personal collection model 1",
                "No collection personal collection metric 1",
              ],
              notFoundItems: [
                "Root metric 1",
                "Regular metric 1",
                "Admin personal collection metric 1",
                "Normal personal collection metric 2",
              ],
            });
          });
        });
      });

      it("should not allow local search for `all personal collections`", () => {
        createTestCards();
        startNewQuestion();

        tabs.forEach(tab => {
          entityPickerModal().within(() => {
            entityPickerModalTab(tab).click();
            cy.findByText("All personal collections").click();
            enterSearchText({
              text: "root",
              placeholder: "Search…",
            });
            globalSearchTab().should("not.exist");
            localSearchTab("All personal collections").should("not.exist");
            assertSearchResults({
              foundItems: ["Root question 1", "Root model 1", "Root metric 1"],
            });
          });
        });
      });
    });
  });

  describe("collection picker", () => {
    it("should search for collections for a normal user", () => {
      createTestCollections();
      cy.signInAsNormalUser();
      visitQuestion(ORDERS_QUESTION_ID);
      openQuestionActions();
      popover().findByText("Move").click();

      cy.log("root collection - automatically selected");
      entityPickerModal().within(() => {
        enterSearchText({
          text: "collection",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Our analytics").should("be.checked");
        assertSearchResults({
          foundItems: ["First collection"],
          notFoundItems: ["Second collection"],
        });
        globalSearchTab().click({ force: true });
        assertSearchResults({
          foundItems: ["First collection", "Second collection"],
        });
        localSearchTab("Our analytics").click({ force: true });
        assertSearchResults({
          foundItems: ["First collection"],
          notFoundItems: ["Second collection"],
        });
      });

      cy.log("regular collection");
      entityPickerModal().within(() => {
        entityPickerModalTab("Collections").click();
        cy.findByText("First collection").click();
        enterSearchText({
          text: "collection",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("First collection").should("be.checked");
        assertSearchResults({
          foundItems: ["Second collection"],
          notFoundItems: ["First collection", "Third collection"],
        });
      });

      cy.log("personal collection");
      entityPickerModal().within(() => {
        entityPickerModalTab("Collections").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal collection 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Robert Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["Normal personal collection 1"],
          notFoundItems: [
            "Normal personal collection 2",
            "Admin personal collection 1",
          ],
        });
      });
    });

    it("should search for collections when there is no access to the root collection", () => {
      createTestCollections();
      cy.log("grant `nocollection` user access to `First collection`");
      cy.log("personal collections are always available");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      cy.signIn("nocollection");
      visitQuestion(ORDERS_QUESTION_ID);
      openQuestionActions();
      popover().findByText("Move").click();

      cy.log("root collection");
      entityPickerModal().within(() => {
        cy.findByText("Collections").click();
        enterSearchText({
          text: "collection",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Collections").should("be.checked");
        assertSearchResults({
          foundItems: ["First collection"],
          notFoundItems: ["No Collection Tableton's Personal Collection"],
        });
        globalSearchTab().click({ force: true });
        assertSearchResults({
          foundItems: [
            "First collection",
            "No Collection Tableton's Personal Collection",
          ],
        });
      });

      cy.log("personal collection");
      entityPickerModal().within(() => {
        entityPickerModalTab("Collections").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal collection 2",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("No Collection Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["No collection personal collection 2"],
          notFoundItems: [
            "No collection personal collection 1",
            "Admin personal collection 2",
            "Normal personal collection 2",
          ],
        });
      });
    });

    it("should not allow local search for `all personal collections`", () => {
      createTestCollections();
      visitQuestion(ORDERS_QUESTION_ID);
      openQuestionActions();
      popover().findByText("Move").click();

      entityPickerModal().within(() => {
        entityPickerModalTab("Collections").click();
        cy.findByText("All personal collections").click();
        enterSearchText({
          text: "personal collection",
          placeholder: "Search…",
        });
        globalSearchTab().should("not.exist");
        localSearchTab("All personal collections").should("not.exist");
        assertSearchResults({
          foundItems: [
            "Admin personal collection 1",
            "Admin personal collection 2",
            "Normal personal collection 1",
            "Normal personal collection 2",
          ],
        });
      });
    });
  });

  describe("dashboard picker", () => {
    it("should search for dashboards for a normal user", () => {
      createTestDashboards();
      cy.signInAsNormalUser();
      visitQuestion(ORDERS_QUESTION_ID);
      openQuestionActions();
      popover().findByText("Add to dashboard").click();

      cy.log("root collection - automatically selected");
      entityPickerModal().within(() => {
        enterSearchText({
          text: "dashboard 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Our analytics").should("be.checked");
        assertSearchResults({
          foundItems: ["Root dashboard 1"],
          notFoundItems: ["Root dashboard 2", "Regular dashboard 1"],
        });
        globalSearchTab().click({ force: true });
        assertSearchResults({
          foundItems: ["Root dashboard 1", "Regular dashboard 1"],
        });
        localSearchTab("Our analytics").click({ force: true });
        assertSearchResults({
          foundItems: ["Root dashboard 1"],
          notFoundItems: [
            "Root dashboard 2",
            "Regular dashboard 1",
            "Personal dashboard 1",
          ],
        });
      });

      cy.log("regular collection");
      entityPickerModal().within(() => {
        entityPickerModalTab("Dashboards").click();
        cy.findByText("First collection").click();
        enterSearchText({
          text: "dashboard 2",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("First collection").should("be.checked");
        assertSearchResults({
          foundItems: ["Regular dashboard 2"],
          notFoundItems: [
            "Regular dashboard 1",
            "Root dashboard 2",
            "Personal dashboard 2",
          ],
        });
      });

      cy.log("personal collection");
      entityPickerModal().within(() => {
        entityPickerModalTab("Dashboards").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal dashboard 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Robert Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["Normal personal dashboard 1"],
          notFoundItems: [
            "Normal personal dashboard 2",
            "Root dashboard 1",
            "Regular dashboard 1",
          ],
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
    { id: ADMIN_PERSONAL_COLLECTION_ID, name: "Admin personal collection" },
    { id: NORMAL_PERSONAL_COLLECTION_ID, name: "Normal personal collection" },
    {
      id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
      name: "No collection personal collection",
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

function createTestCollections() {
  const suffixes = ["1", "2"];
  const collections = [
    {
      name: "Admin personal collection",
      parent_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      name: "Normal personal collection",
      parent_id: NORMAL_PERSONAL_COLLECTION_ID,
    },
    {
      name: "No collection personal collection",
      parent_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
    },
  ];

  suffixes.forEach(suffix => {
    collections.forEach(collection =>
      createCollection({ ...collection, name: `${collection.name} ${suffix}` }),
    );
  });
}

function createTestDashboards() {
  const suffixes = ["1", "2"];
  const dashboards = [
    { name: "Root dashboard", collection_id: null },
    { name: "Regular dashboard", collection_id: FIRST_COLLECTION_ID },
    {
      name: "Admin personal dashboard",
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      name: "Normal personal dashboard",
      collection_id: NORMAL_PERSONAL_COLLECTION_ID,
    },
    {
      name: "No collection personal dashboard",
      collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
    },
  ];

  suffixes.forEach(suffix => {
    dashboards.forEach(dashboard =>
      createDashboard({ ...dashboard, name: `${dashboard.name} ${suffix}` }),
    );
  });
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

function globalSearchTab() {
  return cy.findByLabelText("Everywhere");
}

function localSearchTab(selectedItem: string) {
  return cy.findByLabelText(`“${selectedItem}”`);
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
