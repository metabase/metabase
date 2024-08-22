import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NODATA_USER_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  assertDatasetIsSandboxed,
  assertQueryBuilderRowCount,
  commandPaletteSearch,
  describeEE,
  entityPickerModal,
  filterWidget,
  getFullName,
  modal,
  onlyOnEE,
  openQuestionActions,
  openSharingMenu,
  popover,
  restore,
  setTokenFeatures,
  setupSMTP,
  sidebar,
  startNewQuestion,
  visitDashboard,
  visitQuestion,
  visitQuestionAdhoc,
  withDatabase,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;
const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID, PRODUCTS } =
  SAMPLE_DATABASE;
const { nocollection } = USERS;

const PG_DB_ID = 2;

// NOTE: This issue wasn't specifically related to PostgreSQL. We simply needed to add another DB to reproduce it.
describe.skip("issue 13347", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("postgres-12");
    cy.signInAsAdmin();

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        1: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
        [PG_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    });

    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "read" },
    });

    withDatabase(
      PG_DB_ID,
      ({ ORDERS_ID }) =>
        cy.createQuestion({
          name: "Q1",
          query: { "source-table": ORDERS_ID },
          database: PG_DB_ID,
        }),

      cy.createNativeQuestion({
        name: "Q2",
        native: { query: "SELECT * FROM ORDERS" },
        database: PG_DB_ID,
      }),
    );
  });

  ["QB", "Native"].forEach(test => {
    it(`${test.toUpperCase()} version:\n should be able to select question (from "Saved Questions") which belongs to the database user doesn't have data-permissions for (metabase#13347)`, () => {
      cy.signIn("none");

      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved Questions").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      test === "QB" ? cy.findByText("Q1").click() : cy.findByText("Q2").click();

      cy.wait("@dataset", { timeout: 5000 });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("37.65");
    });
  });
});

describeEE("postgres > user > query", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    setTokenFeatures("all");

    // Update basic permissions (the same starting "state" as we have for the "Sample Database")
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [PG_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [DATA_GROUP]: {
        [PG_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
      [COLLECTION_GROUP]: {
        [PG_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
    });

    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");
  });

  it("should handle the use of `regexextract` in a sandboxed table (metabase#14873)", () => {
    const CC_NAME = "Firstname";
    // We need ultra-wide screen to avoid scrolling (custom column is rendered at the last position)
    cy.viewport(2200, 1200);

    withDatabase(PG_DB_ID, ({ PEOPLE, PEOPLE_ID }) => {
      // Question with a custom column created with `regextract`
      cy.createQuestion({
        name: "14873",
        query: {
          "source-table": PEOPLE_ID,
          expressions: {
            [CC_NAME]: [
              "regex-match-first",
              ["field-id", PEOPLE.NAME],
              "^[A-Za-z]+",
            ],
          },
        },
        database: PG_DB_ID,
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.sandboxTable({
          table_id: PEOPLE_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field-id", PEOPLE.ID]],
          },
        });

        cy.signOut();
        cy.signInAsSandboxedUser();

        visitQuestion(QUESTION_ID);

        cy.findByText(CC_NAME);
        cy.findByText(/^Hudson$/);
        assertQueryBuilderRowCount(1); // test that user is sandboxed - normal users has over 2000 rows
        assertDatasetIsSandboxed(`@cardquery${QUESTION_ID}`);
      });
    });
  });
});

describe.skip("issue 17777", () => {
  function hideTables(tables) {
    cy.request("PUT", "/api/table", {
      ids: tables,
      visibility_type: "hidden",
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    hideTables([ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID]);
  });

  it("should still be able to set permissions on individual tables, even though they are hidden in data model (metabase#17777)", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Permissions for the All Users group");
    cy.findByTextEnsureVisible("Sample Database").click();

    cy.location("pathname").should(
      "eq",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    cy.findByTestId("permission-table").within(() => {
      cy.findByText("Orders");
      cy.findByText("Products");
      cy.findByText("Reviews");
      cy.findByText("People");
    });

    cy.findAllByText("No self-service").first().click();

    popover().contains("Unrestricted");
  });
});

describe("issue 19603", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Archive second collection (nested under the first one)
    cy.request("GET", "/api/collection/").then(({ body }) => {
      const { id } = body.find(c => c.slug === "second_collection");

      cy.archiveCollection(id);
    });
  });

  it("archived subcollection should not show up in permissions (metabase#19603)", () => {
    cy.visit("/admin/permissions/collections");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("First collection").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Second collection").should("not.exist");
  });
});

describeEE("issue 20436", () => {
  const url = `/admin/permissions/data/group/${ALL_USERS_GROUP}`;

  function changePermissions(from, to) {
    cy.findAllByText(from).first().click();

    popover().contains(to).click();
  }

  function saveChanges() {
    cy.button("Save changes").click();
    cy.button("Yes").click();
  }

  beforeEach(() => {
    cy.intercept("PUT", "/api/permissions/graph").as("updatePermissions");

    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        1: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });
  });

  it("should display correct permissions on the database level after changes on the table level (metabase#20436)", () => {
    cy.visit(url);

    cy.findByTestId("permission-table").within(() => {
      cy.findByText("Query builder only").click();
    });

    popover().within(() => {
      cy.findByText("Granular").click();
    });

    // Change the permission levels for ANY of the tables - it doesn't matter which one
    changePermissions("Query builder only", "No");

    saveChanges();
    cy.wait("@updatePermissions");

    // Now turn it back to previous value
    changePermissions("No", "Query builder only");

    saveChanges();
    cy.wait("@updatePermissions");

    cy.visit(url);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Query builder only");
  });
});

describe("UI elements that make no sense for users without data permissions (metabase#22447, metabase##22449, metabase#22450)", () => {
  beforeEach(() => {
    restore();
  });

  it("should not offer to save question to users with no data permissions", () => {
    cy.signIn("nodata");

    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTestId("viz-settings-button");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();

    cy.findByTestId("display-options-sensible");
    cy.icon("line").click();
    cy.findByTestId("Line-button").realHover();
    cy.findByTestId("Line-button").within(() => {
      cy.icon("gear").click();
    });

    cy.findByTextEnsureVisible("Line options");
    cy.findByTestId("qb-save-button")
      .as("saveButton")
      .should("have.attr", "data-disabled");

    cy.get("@saveButton").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You don't have permission to save this question.");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.icon("refresh").should("not.exist");
    });

    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();

    popover()
      .should("contain", "Dashboard")
      .and("contain", "Collection")
      .and("not.contain", "Question");
  });

  it("should not show visualization or question settings to users with block data permissions", () => {
    onlyOnEE();

    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
    });

    cy.signIn("nodata");

    visitQuestion(ORDERS_QUESTION_ID);

    cy.findByTextEnsureVisible("There was a problem with your question");

    cy.findByTestId("viz-settings-button").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("not.exist");

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.icon("refresh").should("not.exist");
    });
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();

    popover()
      .should("contain", "Dashboard")
      .and("contain", "Collection")
      .and("not.contain", "Question");
  });
});

describe("issue 22473", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("nocollection user should be able to view and unsubscribe themselves from a subscription", () => {
    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    openSharingMenu("Subscriptions");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${nocollection.first_name} ${nocollection.last_name}{enter}`)
      .blur();
    sidebar().within(() => {
      cy.button("Done").click();
    });

    cy.signIn("nocollection");
    cy.visit("/account/notifications");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard").should("exist");
    cy.findByTestId("notifications-list").within(() => {
      cy.findByLabelText("close icon").click();
    });
    modal().within(() => {
      cy.button("Unsubscribe").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard").should("not.exist");
  });
});

describeEE("issue 22695 ", () => {
  function assert() {
    cy.visit("/");

    commandPaletteSearch("S");
    cy.wait("@searchResults");

    cy.findAllByTestId("search-result-item-name")
      .should("have.length.above", 0)
      .and("not.contain", "Sample Database");
  }

  beforeEach(() => {
    cy.intercept("GET", "/api/search?*").as("searchResults");

    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
      [DATA_GROUP]: {
        [SAMPLE_DB_ID]: { "view-data": "blocked" },
      },
    });
  });

  // https://github.com/metabase/metaboat/issues/159
  it("should not expose database names to which the user has no access permissions (metabase#22695)", () => {
    // Nocollection user belongs to a "data" group which we blocked for this repro,
    // but they have access to data otherwise (as name suggests)
    cy.signIn("nocollection");
    assert();

    cy.signOut();

    // Nodata user belongs to the group that has access to collections,
    // but has no-self-service data permissions
    cy.signIn("nodata");
    assert();
  });
});

describe("issue 22726", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createCard");

    restore();
    cy.signInAsAdmin();

    // Let's give all users a read only access to "Our analytics"
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "read" },
    });

    cy.signIn("nocollection");
  });

  it("should offer to duplicate a question in a view-only collection (metabase#22726)", () => {
    visitQuestion(ORDERS_QUESTION_ID);

    openQuestionActions();
    popover().findByText("Duplicate").click();
    cy.findByTextEnsureVisible(
      `${getFullName(nocollection)}'s Personal Collection`,
    );

    cy.button("Duplicate").click();
    cy.wait("@createCard");
  });
});

describe("issue 22727", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Let's give all users a read only access to "Our analytics"
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "read" },
    });

    cy.signIn("nocollection");
  });

  it("should not offer to save question in view only collection (metabase#22727, metabase#20717)", () => {
    // It is important to start from a saved question and to alter it.
    // We already have a reproduction that makes sure "Our analytics" is not offered when starting from an ad-hoc question (table).
    visitQuestion(ORDERS_QUESTION_ID);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("31.44").click();
    popover().contains("=").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByTestId("save-question-modal").then(modal => {
      // This part reproduces https://github.com/metabase/metabase/issues/20717
      cy.findByText(/^Replace original qeustion/).should("not.exist");

      // This part is an actual repro for https://github.com/metabase/metabase/issues/22727
      cy.findByLabelText(/Which collection should this go in/)
        .invoke("text")
        .should("not.eq", "Our analytics");
    });
  });
});

describe("issue 23981", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Let's revoke access to "Our analytics" from "All users"
    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "none" },
    });

    cy.signIn("nocollection");
  });

  it("should not show the root collection name in breadcrumbs if the user does not have access to it (metabase#23981)", () => {
    visitQuestionAdhoc({
      name: "23981",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
        },
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${getFullName(nocollection)}'s Personal Collection`).click();

    entityPickerModal().within(() => {
      cy.findByText("Our analytics").should("not.exist");
      cy.log('ensure that "Collections" is not selectable');
      cy.findByText("Collections").should("be.visible").click();
      cy.button("Select").should("be.disabled");
    });
  });
});

describeEE("issue 24966", () => {
  const sandboxingQuestion = {
    name: "geadsfasd",
    native: {
      query:
        "select products.category,PRODUCTS.title from PRODUCTS where true [[AND products.CATEGORY = {{category}}]]",
      "template-tags": {
        category: {
          id: "411b40bb-1374-9787-6ffb-20604df56d73",
          name: "category",
          "display-name": "Category",
          type: "text",
        },
      },
    },
    parameters: [
      {
        id: "411b40bb-1374-9787-6ffb-20604df56d73",
        type: "category",
        target: ["variable", ["template-tag", "category"]],
        name: "Category",
        slug: "category",
      },
    ],
  };

  const dashboardFilter = {
    name: "Text",
    slug: "text",
    id: "ec00b255",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [dashboardFilter] };

  beforeEach(() => {
    restore("default-ee");
    cy.signInAsAdmin();
    setTokenFeatures("all");

    // Add user attribute to existing user
    cy.request("PUT", `/api/user/${NODATA_USER_ID}`, {
      login_attributes: { attr_cat: "Gizmo" },
    });

    cy.createNativeQuestion(sandboxingQuestion).then(({ body: { id } }) => {
      visitQuestion(id);

      cy.sandboxTable({
        table_id: PRODUCTS_ID,
        card_id: id,
        attribute_remappings: {
          attr_cat: ["variable", ["template-tag", "category"]],
        },
      });
    });

    // Add the saved products table to the dashboard
    cy.createQuestionAndDashboard({
      questionDetails: {
        query: {
          "source-table": PRODUCTS_ID,
          limit: 10,
        },
      },
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");
      cy.wrap(id).as("dashcardId");

      // Connect the filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            col: 0,
            row: 0,
            size_x: 16,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: dashboardFilter.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              },
            ],
          },
        ],
      });
    });
  });

  it("should correctly fetch field values for a filter when native question is used for sandboxing (metabase#24966)", () => {
    cy.signIn("nodata");
    visitDashboard("@dashboardId");
    filterWidget().click();
    cy.findByLabelText("Gizmo").click();
    cy.button("Add filter").click();
    cy.location("search").should("eq", "?text=Gizmo");

    cy.signInAsSandboxedUser();
    visitDashboard("@dashboardId");
    filterWidget().click();
    cy.findByLabelText("Widget").click();
    cy.button("Add filter").click();
    cy.location("search").should("eq", "?text=Widget");
    cy.get("@dashcardId").then(id => {
      assertDatasetIsSandboxed(`@dashcardQuery${id}`);
    });
  });
});
