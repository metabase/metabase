import _ from "underscore";
import { snapshot, restore, withSampleDatabase } from "e2e/support/helpers";
import {
  USERS,
  USER_GROUPS,
  SAMPLE_DB_ID,
  SAMPLE_DB_TABLES,
  METABASE_SECRET_KEY,
} from "e2e/support/cypress_data";

const {
  STATIC_ORDERS_ID,
  STATIC_PRODUCTS_ID,
  STATIC_REVIEWS_ID,
  STATIC_PEOPLE_ID,
  STATIC_ACCOUNTS_ID,
  STATIC_ANALYTIC_EVENTS_ID,
  STATIC_FEEDBACK_ID,
  STATIC_INVOICES_ID,
} = SAMPLE_DB_TABLES;

const {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  DATA_GROUP,
  READONLY_GROUP,
  NOSQL_GROUP,
} = USER_GROUPS;
const { admin } = USERS;

describe("snapshots", () => {
  describe("default", () => {
    it("default", () => {
      snapshot("blank");
      setup();
      updateSettings();
      snapshot("setup");
      addUsersAndGroups();
      createCollections();
      withSampleDatabase(SAMPLE_DATABASE => {
        ensureTableIdsAreCorrect(SAMPLE_DATABASE);
        hideNewSampleTables(SAMPLE_DATABASE);
        createQuestionsAndDashboards(SAMPLE_DATABASE);
        cy.writeFile(
          "e2e/support/cypress_sample_database.json",
          SAMPLE_DATABASE,
        );
      });

      snapshot("default");

      restore("blank");
    });
  });

  function setup() {
    cy.request("GET", "/api/session/properties").then(
      ({ body: properties }) => {
        cy.request("POST", "/api/setup", {
          token: properties["setup-token"],
          user: admin,
          prefs: {
            site_name: "Epic Team",
            allow_tracking: false,
          },
          database: null,
        });
      },
    );
    // Dismiss `it's ok to play around` modal for admin
    cy.request("PUT", `/api/user/1/modal/qbnewb`, {});
  }

  function updateSettings() {
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    cy.request("PUT", "/api/setting/enable-embedding", { value: true });
    cy.request("PUT", "/api/setting/embedding-secret-key", {
      value: METABASE_SECRET_KEY,
    });

    // update the Sample db connection string so it is valid in both CI and locally
    cy.request("GET", `/api/database/${SAMPLE_DB_ID}`).then(response => {
      response.body.details.db =
        "./plugins/sample-database.db;USER=GUEST;PASSWORD=guest";
      cy.request("PUT", `/api/database/${SAMPLE_DB_ID}`, response.body);
    });
  }

  function addUsersAndGroups() {
    // groups
    cy.request("POST", "/api/permissions/group", { name: "collection" }).then(
      ({ body }) => {
        expect(body.id).to.eq(COLLECTION_GROUP); // 4
      },
    );
    cy.request("POST", "/api/permissions/group", { name: "data" }).then(
      ({ body }) => {
        expect(body.id).to.eq(DATA_GROUP); // 5
      },
    );
    cy.request("POST", "/api/permissions/group", { name: "readonly" }).then(
      ({ body }) => {
        expect(body.id).to.eq(READONLY_GROUP); // 6
      },
    );
    cy.request("POST", "/api/permissions/group", { name: "nosql" }).then(
      ({ body }) => {
        expect(body.id).to.eq(NOSQL_GROUP); // 7
      },
    );

    // Create all users except admin, who was already created in one of the previous steps
    Object.keys(_.omit(USERS, "admin")).forEach(user => {
      cy.createUser(user);
    });

    // Make a call to `/api/user` because some things (personal collections) get created there
    cy.request("GET", "/api/user");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "none", native: "none" } },
      },
      [DATA_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "all", native: "write" } },
      },
      [NOSQL_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "all", native: "none" } },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "none", native: "none" } },
      },
      [READONLY_GROUP]: {
        [SAMPLE_DB_ID]: { data: { schemas: "none", native: "none" } },
      },
    });

    cy.updateCollectionGraph({
      [ALL_USERS_GROUP]: { root: "none" },
      [DATA_GROUP]: { root: "none" },
      [NOSQL_GROUP]: { root: "none" },
      [COLLECTION_GROUP]: { root: "write" },
      [READONLY_GROUP]: { root: "read" },
    });
  }

  function createCollections() {
    function postCollection(name, parent_id, callback) {
      cy.request("POST", "/api/collection", {
        name,
        color: "#509ee3",
        description: `Collection ${name}`,
        parent_id,
      }).then(({ body }) => callback && callback(body));
    }

    postCollection("First collection", undefined, firstCollection =>
      postCollection(
        "Second collection",
        firstCollection.id,
        secondCollection =>
          postCollection("Third collection", secondCollection.id),
      ),
    );
  }

  function createQuestionsAndDashboards({ ORDERS, ORDERS_ID }) {
    // question 1: Orders
    const questionDetails = {
      name: "Orders",
      query: { "source-table": ORDERS_ID },
    };

    // dashboard 1: Orders in a dashboard
    const dashboardDetails = { name: "Orders in a dashboard" };

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
      cardDetails: { size_x: 16, size_y: 8 },
    });

    // question 2: Orders, Count
    cy.createQuestion({
      name: "Orders, Count",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    });

    // question 3: Orders, Count, Grouped by Created At (year)
    cy.createQuestion({
      name: "Orders, Count, Grouped by Created At (year)",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
  }

  function ensureTableIdsAreCorrect({
    ORDERS_ID,
    PRODUCTS_ID,
    REVIEWS_ID,
    PEOPLE_ID,
    ACCOUNTS_ID,
    ANALYTIC_EVENTS_ID,
    FEEDBACK_ID,
    INVOICES_ID,
  }) {
    expect(ORDERS_ID).to.eq(STATIC_ORDERS_ID);
    expect(PEOPLE_ID).to.eq(STATIC_PEOPLE_ID);
    expect(REVIEWS_ID).to.eq(STATIC_REVIEWS_ID);
    expect(PRODUCTS_ID).to.eq(STATIC_PRODUCTS_ID);
    expect(ACCOUNTS_ID).to.eq(STATIC_ACCOUNTS_ID);
    expect(ANALYTIC_EVENTS_ID).to.eq(STATIC_ANALYTIC_EVENTS_ID);
    expect(FEEDBACK_ID).to.eq(STATIC_FEEDBACK_ID);
    expect(INVOICES_ID).to.eq(STATIC_INVOICES_ID);
  }

  function hideNewSampleTables({
    ACCOUNTS_ID,
    ANALYTIC_EVENTS_ID,
    FEEDBACK_ID,
    INVOICES_ID,
  }) {
    [ACCOUNTS_ID, ANALYTIC_EVENTS_ID, FEEDBACK_ID, INVOICES_ID].forEach(id => {
      cy.request("PUT", `/api/table/${id}`, { visibility_type: "hidden" });
    });
  }

  // TODO: It'd be nice to have one file per snapshot.
  // To do that we need to enforce execution order among them.
  describe("withSqlite", () => {
    it("withSqlite", () => {
      restore("default");
      cy.signInAsAdmin();

      cy.request("POST", "/api/database", {
        engine: "sqlite",
        name: "sqlite",
        details: { db: "./resources/sqlite-fixture.db" },
        auto_run_queries: true,
        is_full_sync: true,
        schedules: {
          cache_field_values: {
            schedule_day: null,
            schedule_frame: null,
            schedule_hour: 0,
            schedule_type: "daily",
          },
          metadata_sync: {
            schedule_day: null,
            schedule_frame: null,
            schedule_hour: null,
            schedule_type: "hourly",
          },
        },
      }).then(({ body: { id } }) => {
        cy.request("POST", `/api/database/${id}/sync_schema`);
        cy.request("POST", `/api/database/${id}/rescan_values`);
        cy.wait(1000); // wait for sync
        snapshot("withSqlite");
        // TODO: Temporary HACK that requires further investigation and a better solution.
        // sqlite driver was messing with the sync of postres database in CY tests
        // ("probably some weird race condition" @Damon)
        // Deleting it here keeps snapshots intact, and enables for unobstructed postgres testing.
        cy.request("DELETE", `/api/database/${id}`);
        restore("blank");
      });
    });
  });
});
