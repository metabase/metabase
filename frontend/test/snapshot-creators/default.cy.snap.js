import {
  snapshot,
  restore,
  USERS,
  withSampleDataset,
  signInAsAdmin,
} from "__support__/cypress";

describe("snapshots", () => {
  describe("default", () => {
    it("default", () => {
      snapshot("blank");
      setup();
      updateSettings();
      addUsersAndGroups();
      withSampleDataset(SAMPLE_DATASET => {
        createQuestionAndDashboard(SAMPLE_DATASET);
      });
      snapshot("default");
      restore("blank");
    });
  });

  function makeUserObject(name, groupIds) {
    return {
      first_name: USERS[name].first_name,
      last_name: USERS[name].last_name,
      email: USERS[name].username,
      password: USERS[name].password,
      group_ids: groupIds,
    };
  }

  function setup() {
    cy.request("GET", "/api/session/properties").then(
      ({ body: properties }) => {
        cy.request("POST", "/api/setup", {
          token: properties["setup-token"],
          user: makeUserObject("admin"),
          prefs: {
            site_name: "Epic Team",
            allow_tracking: false,
          },
          database: null,
        });
      },
    );
  }

  function updateSettings() {
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    cy.request("PUT", "/api/setting/enable-embedding", { value: true });
    cy.request("PUT", "/api/setting/embedding-secret-key", {
      value: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    });

    // update the Sample db connection string so it is valid in both CI and locally
    cy.request("GET", "/api/database/1").then(response => {
      response.body.details.db =
        "./resources/sample-dataset.db;USER=GUEST;PASSWORD=guest";
      cy.request("PUT", "/api/database/1", response.body);
    });
  }

  const ALL_USERS_GROUP = 1;
  const COLLECTION_GROUP = 4;
  const DATA_GROUP = 5;

  function addUsersAndGroups() {
    // groups
    cy.request("POST", "/api/permissions/group", { name: "collection" }); // 4
    cy.request("POST", "/api/permissions/group", { name: "data" }); // 5

    // additional users
    cy.request(
      "POST",
      "/api/user",
      makeUserObject("normal", [ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP]),
    );
    cy.request(
      "POST",
      "/api/user",
      makeUserObject("nodata", [ALL_USERS_GROUP, COLLECTION_GROUP]),
    );
    cy.request(
      "POST",
      "/api/user",
      makeUserObject("nocollection", [ALL_USERS_GROUP, DATA_GROUP]),
    );
    cy.request("POST", "/api/user", makeUserObject("none", [ALL_USERS_GROUP]));

    // Make a call to `/api/user` because some things (personal collections) get created there
    cy.request("GET", "/api/user");

    // permissions
    cy.request("PUT", "/api/permissions/graph", {
      revision: 0,
      groups: {
        [ALL_USERS_GROUP]: { "1": { schemas: "none", native: "none" } },
        [DATA_GROUP]: { "1": { schemas: "all", native: "write" } },
        [COLLECTION_GROUP]: { "1": { schemas: "none", native: "none" } },
      },
    });
    cy.request("PUT", "/api/collection/graph", {
      revision: 0,
      groups: {
        [ALL_USERS_GROUP]: { root: "none" },
        [DATA_GROUP]: { root: "none" },
        [COLLECTION_GROUP]: { root: "write" },
      },
    });
  }

  function createQuestionAndDashboard({ ORDERS, ORDERS_ID }) {
    // question 1: Orders
    cy.request("POST", "/api/card", {
      name: "Orders",
      display: "table",
      visualization_settings: {},
      dataset_query: {
        database: 1,
        query: { "source-table": ORDERS_ID },
        type: "query",
      },
    });

    // question 2: Orders, Count
    cy.request("POST", "/api/card", {
      name: "Orders, Count",
      display: "table",
      visualization_settings: {},
      dataset_query: {
        database: 1,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
        type: "query",
      },
    });

    cy.request("POST", "/api/card", {
      name: "Orders, Count, Grouped by Created At (year)",
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
          ],
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {},
    });

    // dashboard 1: Orders in a dashboard
    cy.request("POST", "/api/dashboard", { name: "Orders in a dashboard" });
    cy.request("POST", `/api/dashboard/1/cards`, { cardId: 1 });

    // dismiss the "it's ok to play around" modal
    Object.values(USERS).map((_, index) =>
      cy.request("PUT", `/api/user/${index + 1}/qbnewb`, {}),
    );
  }

  // TODO: It'd be nice to have one file per snapshot.
  // To do that we need to enforce execution order among them.
  describe("withSqlite", () => {
    it("withSqlite", () => {
      restore("default");
      signInAsAdmin();
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
      });
      cy.request("POST", "/api/database/2/sync_schema");
      cy.request("POST", "/api/database/2/rescan_values");
      cy.wait(1000); // wait for sync
      snapshot("withSqlite");
      restore("blank");
    });
  });
});
