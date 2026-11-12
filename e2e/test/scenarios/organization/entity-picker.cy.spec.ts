const { H } = cy;
import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  NO_COLLECTION_PERSONAL_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { DashboardCard } from "metabase-types/api";

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
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("data picker", () => {
    describe("tables", () => {
      it("should search by table display names and not real names", () => {
        cy.signInAsAdmin();
        cy.request("PUT", `/api/table/${ORDERS_ID}`, {
          display_name: "Events",
        });
        cy.signInAsNormalUser();
        H.startNewQuestion();
        H.miniPickerBrowseAll().click();

        cy.log("real table name should give no results");
        H.entityPickerModal().within(() => {
          H.entityPickerModalItem(0, "Databases").click();
          enterSearchText({
            text: "Orders",
            placeholder: "Search…",
          });
          localSearchTab("Databases").should("be.checked");
          assertSearchResults({
            notFoundItems: ["Orders"],
          });
        });

        cy.log("display table name should be used to search for a table");
        H.entityPickerModal().within(() => {
          enterSearchText({
            text: "Events",
            placeholder: "Search…",
          });
          localSearchTab("Databases").should("be.checked");
          assertSearchResults({
            foundItems: ["Events"],
            notFoundItems: ["Orders"],
            totalFoundItemsCount: 1,
          });
          cy.findByText("Events").click();
        });
        H.getNotebookStep("data").findByText("Events").should("be.visible");
      });

      it(
        "should search for tables when there are multiple databases",
        { tags: "@external" },
        () => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          cy.log("first database");
          H.startNewQuestion();
          H.miniPickerBrowseAll().click();
          H.entityPickerModal().within(() => {
            H.entityPickerModalItem(0, "Databases").click();
            enterSearchText({
              text: "prod",
              placeholder: "Search…",
            });
            localSearchTab("Databases").should("be.checked");
            assertSearchResults({
              foundItems: ["Products"],
            });
          });

          cy.log("second database");
          H.entityPickerModal().within(() => {
            H.entityPickerModalItem(0, "Databases").click();
            enterSearchText({
              text: "s",
              placeholder: "Search…",
            });
            localSearchTab("Databases").should("be.checked");
            assertSearchResults({
              foundItems: ["Birds"],
            });
          });
        },
      );

      it(
        "should search for tables in a multi-schema database",
        { tags: "@external" },
        () => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          H.startNewQuestion();
          H.miniPickerBrowseAll().click();
          H.entityPickerModal().within(() => {
            H.entityPickerModalItem(0, "Databases").click();
            cy.findByText("Writable Postgres12").click();
            enterSearchText({
              text: "anim",
              placeholder: "Search…",
            });
            localSearchTab("Databases").should("be.checked");
            cy.findByRole("link", { name: /animals.*wild/i }).should("exist");
            cy.findByRole("link", { name: /animals.*domestic/i }).should(
              "exist",
            );
          });
        },
      );

      it(
        "should search for tables in a schema-less database",
        { tags: "@external" },
        () => {
          H.restore("mysql-8");
          cy.signInAsAdmin();
          H.startNewQuestion();
          H.miniPickerBrowseAll().click();
          H.entityPickerModal().within(() => {
            H.entityPickerModalItem(0, "Databases").click();
            cy.findByText("QA MySQL8").click();
            enterSearchText({
              text: "orders",
              placeholder: "Search…",
            });
            localSearchTab("Databases").should("be.checked");
            cy.findByRole("link", { name: /orders.*QA MySQL8/i }).should(
              "exist",
            );
          });
        },
      );
    });

    describe("cards", () => {
      it("should search for cards when there is no access to the root collection", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.log("grant `nocollection` user access to `First collection`");
        cy.log("personal collections are always available");
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        cy.signIn("nocollection");
        H.startNewQuestion();
        H.miniPickerBrowseAll().click();
        testCardSearchForInaccessibleRootCollection();
      });
    });
  });

  describe("question picker", () => {
    it("should search for cards when there is no access to the root collection", () => {
      cy.signInAsAdmin();
      createTestCards();
      cy.log("grant `nocollection` user access to `First collection`");
      cy.log("personal collections are always available");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });

      cy.signIn("nocollection");
      selectQuestionFromDashboard({ collection_id: FIRST_COLLECTION_ID });
      testCardSearchForInaccessibleRootCollection();

      cy.log("select a card from the search results");
      findSearchItem("No collection personal collection question 1").click();
      H.entityPickerModal().should("not.exist");
      H.getDashboardCard()
        .findByText("No collection personal collection question 1")
        .should("be.visible");
    });
  });

  describe("collection picker", () => {
    it("should search for collections when there is no access to the root collection", () => {
      cy.signInAsAdmin();
      createTestCollections();
      cy.log(
        "grant `nocollection` user access to `First collection` and `Another collection",
      );
      cy.log("personal collections are always available");
      cy.get("@anotherCollection").then((anotherCollectionId) => {
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "write",
            [anotherCollectionId]: "write",
          },
        });
      });

      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      cy.signIn("nocollection");
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      cy.log("root collection");
      H.entityPickerModal().within(() => {
        cy.findByText("Collections").click();
        enterSearchText({
          text: "collection",
          placeholder: "Search…",
        });
        globalSearchTab().should("be.checked");
        assertSearchResults({
          foundItems: ["Another collection"],
          notFoundItems: ["First Collection"],
        });
      });

      cy.log("personal collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, /Personal Collection/).click();
        enterSearchText({
          text: "personal collection 2",
          placeholder: "Search…",
        });
        localSearchTab(/no collection/i).should("be.checked");
        assertSearchResults({
          foundItems: ["No collection personal collection 2"],
          notFoundItems: [
            "No collection personal collection 1",
            "Admin personal collection 2",
            "Normal personal collection 2",
          ],
        });
      });

      cy.log("move the question to a collection from the search results");
      H.entityPickerModal().within(() => {
        findSearchItem("No collection personal collection 2").click();
        cy.button("Move").click();
      });
      H.undoToast()
        .findByText("No collection personal collection 2")
        .should("be.visible");
      cy.reload();
      H.appBar()
        .findByText("No collection personal collection 2")
        .should("be.visible");
    });
  });

  describe("dashboard picker", () => {
    it("should search for dashboards when there is no access to the root collection", () => {
      cy.signInAsAdmin();
      createTestDashboards();
      cy.log("grant `nocollection` user access to `First collection`");
      cy.log("personal collections are always available");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      cy.signIn("nocollection");
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Add to dashboard").click();

      cy.log("root collection");
      H.entityPickerModal().within(() => {
        cy.findByText("Collections").click();
        enterSearchText({
          text: "dashboard 1",
          placeholder: "Search…",
        });
        globalSearchTab().should("be.checked");
        assertSearchResults({
          foundItems: ["Regular dashboard 1"],
          notFoundItems: ["Regular dashboard 2", "Root dashboard 1"],
        });
      });

      cy.log("personal collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, /Personal Collection/).click();
        enterSearchText({
          text: "personal dashboard 2",
          placeholder: "Search…",
        });
        localSearchTab(/no collection/i).should("be.checked");
        assertSearchResults({
          foundItems: ["No collection personal dashboard 2"],
          notFoundItems: [
            "No collection personal dashboard 1",
            "Root dashboard 2",
            "Admin personal dashboard 2",
            "Normal personal dashboard 2",
          ],
        });
      });

      cy.log("add the question to a dashboard from the search results");
      H.entityPickerModal().within(() => {
        findSearchItem("No collection personal dashboard 2").click();
        cy.button("Select").click();
      });
      H.getDashboardCard(0).findByText("Orders").should("be.visible");
    });
  });

  describe("misc entity picker stuff", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should grow in width as needed, but not shrink (metabase#55690)", () => {
      cy.viewport(1500, 800);
      cy.visit("/");

      // New Collection Flow
      H.startNewCollectionFromSidebar();
      cy.findByTestId("new-collection-modal")
        .findByLabelText(/Collection it's saved in/)
        .click();

      //Initial width of entity picker
      cy.findByRole("dialog", { name: "Select a collection" })
        .should("have.css", "width")
        .and("eq", "920px");

      H.entityPickerModalItem(1, "First collection").click();

      //Entity picker should grow
      cy.findByRole("dialog", { name: "Select a collection" })
        .should("have.css", "width")
        .and("eq", "1097px");

      H.entityPickerModalItem(2, "Second collection").click();

      //Max width is 80% of the viewport. Here, we get horizontal scrolling
      cy.findByRole("dialog", { name: "Select a collection" })
        .should("have.css", "width")
        .and("eq", "1200px");

      H.entityPickerModalItem(0, "Our analytics").click();
      //Entity picker should not shrink if we go back in the collection tree
      cy.findByRole("dialog", { name: "Select a collection" })
        .should("have.css", "width")
        .and("eq", "1198px");
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

  types.forEach((type) => {
    suffixes.forEach((suffix) => {
      collections.forEach(({ id, name }) => {
        H.createQuestion({
          ...cardDetails,
          name: `${name} ${type} ${suffix}`,
          type,
          collection_id: id,
        });
      });
    });
  });

  suffixes.forEach((suffix) => {
    H.createQuestion({
      ...cardDetails,
      name: `Orders Dashboard question ${suffix}`,
      dashboard_id: ORDERS_DASHBOARD_ID,
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

  suffixes.forEach((suffix) => {
    collections.forEach((collection) =>
      H.createCollection({
        ...collection,
        name: `${collection.name} ${suffix}`,
      }),
    );
  });

  H.createCollection({
    name: "Another collection",
    parent_id: null,
    alias: "anotherCollection",
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

  suffixes.forEach((suffix) => {
    dashboards.forEach((dashboard) =>
      H.createDashboard({ ...dashboard, name: `${dashboard.name} ${suffix}` }),
    );
  });
}

function createTestDashboardWithEmptyCard(
  dashboardDetails: DashboardDetails = {},
) {
  const dashcardDetails: Partial<DashboardCard>[] = [
    {
      id: -1,
      card_id: null,
      dashboard_tab_id: null,
      row: 5,
      col: 0,
      size_x: 24,
      size_y: 1,
      visualization_settings: {
        virtual_card: {
          name: null,
          dataset_query: {},
          display: "placeholder",
          visualization_settings: {},
          archived: false,
        },
      },
      parameter_mappings: [],
    },
  ];

  return H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    return H.updateDashboardCards({
      dashboard_id: dashboard.id,
      cards: dashcardDetails,
    }).then(() => dashboard);
  });
}

function selectQuestionFromDashboard(dashboardDetails?: DashboardDetails) {
  createTestDashboardWithEmptyCard(dashboardDetails).then((dashboard) => {
    H.visitDashboard(dashboard.id);
    H.editDashboard();
    H.getDashboardCard().button("Select question").click();
  });
}

function enterSearchText({
  text,
  placeholder,
}: {
  text: string;
  placeholder: string | RegExp;
}) {
  cy.findByPlaceholderText(placeholder).clear().type(text);
}

function globalSearchTab() {
  return cy.findByLabelText("Everywhere");
}

function localSearchTab(selectedItem: string | RegExp) {
  return cy.findByLabelText(selectedItem);
}

function findSearchItem(item: string) {
  //entityPickerModalItem can also match the search tab, so we need to scope down to the scroll container
  return (
    H.entityPickerModalLevel(1)
      .findByTestId("scroll-container")
      // see the comment in entityPickerModalItem
      .findByText(item, { ignore: '[data-testid="picker-item-location"]' })
  );
}

function assertSearchResults({
  totalFoundItemsCount,
  foundItems = [],
  notFoundItems = [],
}: {
  foundItems?: string[];
  notFoundItems?: string[];
  totalFoundItemsCount?: number;
}) {
  foundItems.forEach((item) => {
    findSearchItem(item).should("exist");
  });

  notFoundItems.forEach((item) => {
    findSearchItem(item).should("not.exist");
  });

  if (totalFoundItemsCount != null) {
    cy.findAllByTestId("result-item").should(
      "have.length",
      totalFoundItemsCount,
    );
  }
}

function testCardSearchForInaccessibleRootCollection() {
  cy.log("regular collection");
  H.entityPickerModal().within(() => {
    H.pickEntity({ path: ["Collections", "First collection"] });
    enterSearchText({
      text: "1",
      placeholder: "Search…",
    });
    localSearchTab("First collection").should("be.checked");
    assertSearchResults({
      foundItems: ["Regular question 1", "Regular model 1", "Regular metric 1"],
      notFoundItems: [
        "Root question 1",
        "Regular question 2",
        "Admin personal collection question 1",
        "Normal personal collection question 1",
        "No collection personal collection question 1",
      ],
    });
  });

  cy.log("inaccessible root collection");
  H.entityPickerModal().within(() => {
    H.entityPickerModalItem(0, "Collections").click();
    enterSearchText({
      text: "2",
      placeholder: "Search…",
    });
    globalSearchTab().should("be.checked");
    assertSearchResults({
      notFoundItems: [
        "Root metric 1",
        "Regular metric 1",
        "Admin personal collection metric 1",
        "Normal personal collection metric 2",
      ],
    });
  });

  cy.log("personal collection");
  H.entityPickerModal().within(() => {
    H.entityPickerModalItem(0, /Personal Collection/).click();
    enterSearchText({
      text: "1",
      placeholder: "Search…",
    });
    localSearchTab(/no collection/i).should("be.checked");
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
}
