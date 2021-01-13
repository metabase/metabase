import {
  describeWithToken,
  openOrdersTable,
  openPeopleTable,
  popover,
  restore,
  signInAsAdmin,
  signInAsNormalUser,
  signOut,
  USER_GROUPS,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATASET;

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

// TODO: If we ever have the need to use this user across multiple tests, extract it to `__support__/cypress`
const sandboxed_user = {
  first_name: "User",
  last_name: "1",
  email: "u1@metabase.test",
  password: "12341234",
  login_attributes: {
    user_id: "1",
    user_cat: "Widget",
  },
  // Because of the specific restrictions and the way testing dataset was set up,
  // this user needs to also have access to "collections" (group_id: 4) in order to see saved questions
  group_ids: [ALL_USERS_GROUP, COLLECTION_GROUP],
};

const [ATTR_UID, ATTR_CAT] = Object.keys(sandboxed_user.login_attributes);

function createUser(user) {
  return cy.request("POST", "/api/user", user);
}

describeWithToken("formatting > sandboxes", () => {
  describe("admin", () => {
    beforeEach(() => {
      restore();
      signInAsAdmin();
      cy.visit("/admin/people");
    });

    it("should add key attributes to an existing user", () => {
      cy.get(".Icon-ellipsis")
        .last()
        .click();
      cy.findByText("Edit user").click();
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("3");
      cy.findByText("Update").click();
    });

    it("should add key attributes to a new user", () => {
      cy.findByText("Add someone").click();
      cy.findByPlaceholderText("Johnny").type(sandboxed_user.first_name);
      cy.findByPlaceholderText("Appleseed").type(sandboxed_user.last_name);
      cy.findByPlaceholderText("youlooknicetoday@email.com").type(
        sandboxed_user.email,
      );
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("1");
      cy.findAllByText("Create").click();
      cy.findByText("Done").click();
    });
  });

  describe("normal user", () => {
    const USER_ATTRIBUTE = "User ID";
    const ATTRIBUTE_VALUE = "3";
    const TTAG_NAME = "cid";
    const QUESTION_NAME = "Joined test";

    beforeEach(() => {
      restore();
      signInAsAdmin();

      // Add user attribute to existing ("normal" / id:2) user
      cy.request("PUT", "/api/user/2", {
        login_attributes: { [USER_ATTRIBUTE]: ATTRIBUTE_VALUE },
      });

      // Orders join Products
      createJoinedQuestion(QUESTION_NAME);

      // Sandbox Orders table on "User ID"
      cy.request("POST", "/api/mt/gtap", {
        group_id: DATA_GROUP,
        table_id: ORDERS_ID,
        card_id: null,
        attribute_remappings: {
          [USER_ATTRIBUTE]: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.log("**--Create parametrized SQL question--**");
      cy.request("POST", "/api/card", {
        name: "sql param",
        dataset_query: {
          type: "native",
          native: {
            query: `select id,name,address,email from people where {{${TTAG_NAME}}}`,
            "template-tags": {
              [TTAG_NAME]: {
                id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
                name: TTAG_NAME,
                "display-name": "CID",
                type: "dimension",
                dimension: ["field-id", PEOPLE.ID],
                "widget-type": "id",
              },
            },
          },
          database: 1,
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        // Sandbox `People` table based on previously created SQL question
        cy.request("POST", "/api/mt/gtap", {
          group_id: DATA_GROUP,
          table_id: PEOPLE_ID,
          card_id: QUESTION_ID,
          attribute_remappings: {
            [USER_ATTRIBUTE]: ["dimension", ["template-tag", TTAG_NAME]],
          },
        });
      });

      updatePermissionsGraph({
        schema: {
          [ORDERS_ID]: { query: "segmented", read: "all" },
          [PEOPLE_ID]: { query: "segmented", read: "all" },
        },
        user_group: DATA_GROUP,
      });

      signOut();
      signInAsNormalUser();
    });

    describe("table sandboxed on a user attribute", () => {
      it("should display correct number of orders", () => {
        openOrdersTable();
        // 10 rows filtered on User ID
        cy.findAllByText(ATTRIBUTE_VALUE).should("have.length", 10);
      });
    });

    describe("question with joins", () => {
      it("should be sandboxed even after applying a filter to the question", () => {
        cy.log("**--0. Open saved question with joins--**");
        cy.visit("/collection/root");
        cy.findByText(QUESTION_NAME).click();

        cy.log("**--1. Make sure user is initially sandboxed--**");
        cy.get(".TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          11,
        );

        cy.log("**--2. Add filter to a question--**");
        cy.get(".Icon-notebook").click();
        cy.findByText("Filter").click();
        popover().within(() => {
          cy.findByText("Total").click();
        });
        cy.findByText("Equal to").click();
        cy.findByText("Greater than").click();
        cy.findByPlaceholderText("Enter a number").type("100");
        cy.findByText("Add filter").click();
        cy.findByText("Visualize").click();

        cy.log("**--3. Make sure user is still sandboxed--**");
        cy.get(".TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          7,
        );
      });
    });

    describe("table sandboxed on a saved parametrized SQL question", () => {
      it("should show filtered categories", () => {
        openPeopleTable();
        cy.get(".TableInteractive-headerCellData").should("have.length", 4);
        cy.get(".TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          2,
        );
      });
    });
  });

  describe("Sandboxing reproductions", () => {
    beforeEach(() => {
      restore();
      signInAsAdmin();
      createUser(sandboxed_user).then(({ body: { id: USER_ID } }) => {
        cy.log(
          "**-- Dismiss `it's ok to play around` modal for new users --**",
        );
        cy.request("PUT", `/api/user/${USER_ID}/qbnewb`, {});
      });
    });

    it.skip("should allow joins to the sandboxed table (metabase-enterprise#154)", () => {
      cy.log(
        "**-- 1. Sandbox `People` table on `user_id` attribute for `data` group --**",
      );

      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          [ATTR_UID]: ["dimension", ["field-id", PEOPLE.ID]],
        },
        card_id: null,
        group_id: COLLECTION_GROUP,
        table_id: PEOPLE_ID,
      });

      updatePermissionsGraph({
        schema: {
          [ORDERS_ID]: "all",
          [PEOPLE_ID]: { query: "segmented", read: "all" },
          [PRODUCTS_ID]: "all",
          [REVIEWS_ID]: "all",
        },
      });

      signOut();
      signInAsSandboxedUser();

      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();

      cy.log(
        "**-- Original issue reported failure to find 'User' group / foreign key--**",
      );

      popover().within(() => {
        // Collapse "Order/s/" in order to bring "User" into view (trick to get around virtualization - credits: @flamber)
        cy.get(".List-section-header")
          .contains(/Orders?/)
          .click();

        cy.get(".List-section-header")
          .contains("User")
          .click();

        cy.get(".List-item")
          .contains("ID")
          .click();
      });

      cy.findByText("Visualize").click();
      cy.findByText("Count by User → ID");
      cy.findByText("11"); // Sum of orders for user with ID #1
    });

    it.skip("SB question with `case` CC should substitute the `else` argument's table (metabase-enterprise#548)", () => {
      const QUESTION_NAME = "EE_548";
      const CC_NAME = "CC_548"; // Custom column

      cy.log("**-- 1. Sandbox `Orders` table on `user_id` attribute --**");

      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          [ATTR_UID]: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
        card_id: null,
        group_id: COLLECTION_GROUP,
        table_id: ORDERS_ID,
      });

      updatePermissionsGraph({
        schema: {
          [ORDERS_ID]: { query: "segmented", read: "all" },
        },
      });

      cy.log("**-- 2. Create and save a question --**");

      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: {
          database: 1,
          query: {
            expressions: {
              [CC_NAME]: [
                "case",
                [
                  [
                    [">", ["field-id", ORDERS.DISCOUNT], 0],
                    ["field-id", ORDERS.DISCOUNT],
                  ],
                ],
                { default: ["field-id", ORDERS.TOTAL] },
              ],
            },
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        signOut();
        signInAsSandboxedUser();

        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        // Assertion phase starts here
        cy.visit(`/question/${QUESTION_ID}`);
        cy.findByText(QUESTION_NAME);

        cy.log("**Reported failing since v1.36.4**");
        cy.wait("@cardQuery").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });

        cy.findByText(CC_NAME);
      });
    });

    it.skip("drill-through should work on implicit joined tables with sandboxes (metabase#13641)", () => {
      const QUESTION_NAME = "13641";

      cy.log("**-- 1. Sandbox `Orders` table on `user_id` attribute --**");

      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          [ATTR_UID]: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
        card_id: null,
        group_id: COLLECTION_GROUP,
        table_id: ORDERS_ID,
      });

      updatePermissionsGraph({
        schema: {
          [PRODUCTS_ID]: "all",
          [ORDERS_ID]: { query: "segmented", read: "all" },
        },
      });

      cy.log(
        "**-- 2. Create question based on steps in [#13641](https://github.com/metabase/metabase/issues/13641)--**",
      );
      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: {
          database: 1,
          query: {
            aggregation: [["count"]],
            breakout: [
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.CATEGORY],
              ],
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "bar",
        visualization_settings: {},
      });

      signOut();
      signInAsSandboxedUser();

      cy.server();
      cy.route("POST", "/api/card/*/query").as("cardQuery");
      cy.route("POST", "/api/dataset").as("dataset");

      // Find saved question in "Our analytics"
      cy.visit("/collection/root");
      cy.findByText(QUESTION_NAME).click();

      cy.wait("@cardQuery");
      // Drill-through
      cy.get(".Visualization").within(() => {
        // Click on the first bar in a graph (Category: "Doohickey")
        cy.get(".bar")
          .eq(0)
          .click({ force: true });
      });
      cy.findByText("View these Orders").click();

      cy.log("**Reported failing on v1.37.0.2**");
      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.findByText("Category is Doohickey");
      cy.findByText("97.44"); // Subtotal for order #10
    });

    it("should allow drill-through for sandboxed user (metabase-enterprise#535)", () => {
      const PRODUCTS_ALIAS = "Products";
      const QUESTION_NAME = "EE_535";

      cy.log("**-- 1. Sandbox `Orders` table on `user_id` attribute --**");

      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          [ATTR_UID]: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
        card_id: null,
        group_id: COLLECTION_GROUP,
        table_id: ORDERS_ID,
      });

      updatePermissionsGraph({
        schema: {
          [PRODUCTS_ID]: "all",
          [ORDERS_ID]: { query: "segmented", read: "all" },
        },
      });

      cy.log(
        "**-- 2. Create question based on steps in [#535](https://github.com/metabase/metabase-enterprise/issues/535)--**",
      );
      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: {
          database: 1,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.CATEGORY]],
            ],
            joins: [
              {
                alias: PRODUCTS_ALIAS,
                condition: [
                  "=",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.ID]],
                ],
                fields: "all",
                "source-table": PRODUCTS_ID,
              },
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "bar",
        visualization_settings: {},
      });

      signOut();
      signInAsSandboxedUser();

      cy.server();
      cy.route("POST", "/api/card/*/query").as("cardQuery");
      cy.route("POST", "/api/dataset").as("dataset");

      // Find saved question in "Our analytics"
      cy.visit("/collection/root");
      cy.findByText(QUESTION_NAME).click();

      cy.wait("@cardQuery");
      // Drill-through
      cy.get(".Visualization").within(() => {
        // Click on the first bar in a graph (Category: "Doohickey")
        cy.get(".bar")
          .eq(0)
          .click({ force: true });
      });
      cy.findByText("View these Orders").click();

      cy.wait("@dataset");
      cy.log("**Reported failing on v1.36.4**");
      cy.findByText("Category is Doohickey");
      cy.findByText("97.44"); // Subtotal for order #10
    });

    it.skip("advanced sandboxing based on saved question with joins should allow sandboxed user to use joins (metabase-enterprise#524)", () => {
      const [ORDERS_ALIAS, PRODUCTS_ALIAS, REVIEWS_ALIAS] = [
        "Orders",
        "Products",
        "Reviews",
      ];

      cy.log(
        "**-- 1. Create question based on repro steps in [#524](https://github.com/metabase/metabase-enterprise/issues/524) --**",
      );

      cy.request("POST", "/api/card", {
        name: "EE_524",
        dataset_query: {
          database: 1,
          query: {
            joins: [
              // a. People join Orders
              {
                alias: ORDERS_ALIAS,
                condition: [
                  "=",
                  ["field-id", PEOPLE.ID],
                  ["joined-field", ORDERS_ALIAS, ["field-id", ORDERS.USER_ID]],
                ],
                fields: "all",
                "source-table": ORDERS_ID,
                strategy: "inner-join",
              },
              // b. Previous results join Products
              {
                alias: PRODUCTS_ALIAS,
                condition: [
                  "=",
                  [
                    "joined-field",
                    ORDERS_ALIAS,
                    ["field-id", ORDERS.PRODUCT_ID],
                  ],
                  ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.ID]],
                ],
                fields: "all",
                "source-table": PRODUCTS_ID,
                strategy: "inner-join",
              },
              // c. Previous results join Reviews
              {
                alias: REVIEWS_ALIAS,
                condition: [
                  "=",
                  ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.ID]],
                  [
                    "joined-field",
                    REVIEWS_ALIAS,
                    ["field-id", REVIEWS.PRODUCT_ID],
                  ],
                ],
                fields: "all",
                "source-table": REVIEWS_ID,
                strategy: "inner-join",
              },
            ],
            "source-table": PEOPLE_ID,
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: CARD_ID } }) => {
        cy.log(
          "**-- 2. Sandbox `Orders` table based on previous question --**",
        );

        cy.request("POST", "/api/mt/gtap", {
          attribute_remappings: {
            [ATTR_UID]: [
              "dimension",
              ["joined-field", ORDERS_ALIAS, ["field-id", ORDERS.USER_ID]],
            ],
          },
          card_id: CARD_ID,
          group_id: COLLECTION_GROUP,
          table_id: ORDERS_ID,
        });

        cy.log(
          "**-- 3. Sandbox `Products` table based on previous question --**",
        );

        cy.request("POST", "/api/mt/gtap", {
          attribute_remappings: {
            [ATTR_UID]: [
              "dimension",
              ["joined-field", REVIEWS_ALIAS, ["field-id", REVIEWS.PRODUCT_ID]],
            ],
          },
          card_id: CARD_ID,
          group_id: COLLECTION_GROUP,
          table_id: PRODUCTS_ID,
        });

        updatePermissionsGraph({
          schema: {
            [PRODUCTS_ID]: { query: "segmented", read: "all" },
            [ORDERS_ID]: { query: "segmented", read: "all" },
          },
        });

        signOut();
        signInAsSandboxedUser();

        openOrdersTable({ mode: "notebook" });

        // `Orders` join `Products`
        cy.findByText("Join data").click();
        popover()
          .contains(/Products?/i)
          .click();

        // Where `Orders.Product ID` = `Products.ID`
        popover()
          .contains("Product ID")
          .click();

        popover()
          .contains("ID")
          .click();

        // Prepare to wait for dataset XHR
        cy.server();
        cy.route("POST", "/api/dataset").as("dataset");

        cy.findByText("Visualize").click();

        cy.log("**-- Reported failing on v1.36.4 --**");
        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });

        // TODO: Add positive assertion once this issue is fixed!
      });
    });

    it.skip("advanced sandboxing should not ignore data model features like object detail of FK (metabase-enterprise#520)", () => {
      cy.log("**-- Remap Product ID's display value to `title` --**");

      cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        field_id: ORDERS.PRODUCT_ID,
        name: "Product ID",
        human_readable_field_id: PRODUCTS.TITLE,
        type: "external",
      });
      cy.log("**-- 1. Create the first native question with a filter --**");

      cy.request("POST", "/api/card", {
        name: "EE_520_Q1",
        dataset_query: {
          database: 1,
          native: {
            query:
              "SELECT * FROM ORDERS WHERE USER_ID={{sandbox}} AND TOTAL>10",
            "template-tags": {
              sandbox: {
                "display-name": "Sandbox",
                id: "1115dc4f-6b9d-812e-7f72-b87ab885c88a",
                name: "sandbox",
                type: "number",
              },
            },
          },
          type: "native",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: CARD_ID } }) => {
        cy.log("**-- 1a. Sandbox `Orders` table based on this question --**");

        cy.request("POST", "/api/mt/gtap", {
          attribute_remappings: {
            [ATTR_UID]: ["variable", ["template-tag", "sandbox"]],
          },
          card_id: CARD_ID,
          group_id: COLLECTION_GROUP,
          table_id: ORDERS_ID,
        });
      });
      cy.log("**-- 2. Create the second native question with a filter --**");

      cy.request("POST", "/api/card", {
        name: "EE_520_Q2",
        dataset_query: {
          database: 1,
          native: {
            query:
              "SELECT * FROM PRODUCTS↵WHERE CATEGORY={{sandbox}} AND PRICE>10",
            "template-tags": {
              sandbox: {
                "display-name": "Sandbox",
                id: "3d69ba99-7076-2252-30bd-0bb8810ba895",
                name: "sandbox",
                type: "text",
              },
            },
          },
          type: "native",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: CARD_ID } }) => {
        cy.log("**-- 2a. Sandbox `Products` table based on this question --**");

        cy.request("POST", "/api/mt/gtap", {
          attribute_remappings: {
            [ATTR_CAT]: ["variable", ["template-tag", "sandbox"]],
          },
          card_id: CARD_ID,
          group_id: COLLECTION_GROUP,
          table_id: PRODUCTS_ID,
        });
      });

      updatePermissionsGraph({
        schema: {
          [PRODUCTS_ID]: { query: "segmented", read: "all" },
          [ORDERS_ID]: { query: "segmented", read: "all" },
        },
      });

      signOut();
      signInAsSandboxedUser();

      openOrdersTable();

      cy.log("**-- Reported failing on v1.36.x --**");

      cy.log(
        "**It should show remapped Display Values instead of Product ID**",
      );
      cy.get(".cellData")
        .contains("Awesome Concrete Shoes")
        .click();
      cy.findByText(/View details/i).click();

      cy.log(
        "**It should show object details instead of filtering by this Product ID**",
      );
      // The name of this Vendor is visible in "details" only
      cy.findByText("McClure-Lockman");
    });

    it.skip("should work on questions with joins, with sandboxed target table, where target fields cannot be filtered (metabase#13642)", () => {
      const QUESTION_NAME = "13642";
      const PRODUCTS_ALIAS = "Products";

      cy.log("**-- 1. Sandbox `Orders` table --**");

      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          user_id: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
        card_id: null,
        table_id: ORDERS_ID,
        group_id: COLLECTION_GROUP,
      });

      cy.log("**-- 2. Sandbox `Products` table --**");

      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          user_cat: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
        },
        card_id: null,
        table_id: PRODUCTS_ID,
        group_id: COLLECTION_GROUP,
      });

      updatePermissionsGraph({
        schema: {
          [PRODUCTS_ID]: { query: "segmented", read: "all" },
          [ORDERS_ID]: { query: "segmented", read: "all" },
        },
      });

      cy.log("**-- 3. Create question with joins --**");

      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: {
          database: 1,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.CATEGORY]],
            ],
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["joined-field", PRODUCTS_ALIAS, ["field-id", PRODUCTS.ID]],
                ],
                alias: PRODUCTS_ALIAS,
              },
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        },
        display: "bar",
        visualization_settings: {},
      });

      signOut();
      signInAsSandboxedUser();

      cy.server();
      cy.route("POST", "/api/card/*/query").as("cardQuery");
      cy.route("POST", "/api/dataset").as("dataset");

      cy.visit("/collection/root");
      cy.findByText(QUESTION_NAME).click();

      cy.wait("@cardQuery");
      // Drill-through
      cy.get(".Visualization").within(() => {
        // Click on the second bar in a graph (Category: "Widget")
        cy.get(".bar")
          .eq(1)
          .click({ force: true });
      });
      cy.findByText("View these Orders").click();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.contains("37.65");
    });
  });
});

function signInAsSandboxedUser() {
  cy.log("**-- Logging in as sandboxed user --**");
  cy.request("POST", "/api/session", {
    username: sandboxed_user.email,
    password: sandboxed_user.password,
  });
}

/**
 * As per definition for `PUT /graph` from `permissions.clj`:
 *
 * This should return the same graph, in the same format,
 * that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary.
 * This modified graph must correspond to the `PermissionsGraph` schema.
 *
 * That's why we must chain GET and PUT requests one after the other.
 */

function updatePermissionsGraph({
  schema = {},
  user_group = COLLECTION_GROUP,
  database_id = 1,
} = {}) {
  if (typeof schema !== "object") {
    throw new Error("`schema` must be an object!");
  }

  cy.log("**-- Fetch permissions graph --**");
  cy.request("GET", "/api/permissions/graph", {}).then(
    ({ body: { groups, revision } }) => {
      // This mutates the original `groups` object => we'll pass it next to the `PUT` request
      groups[user_group] = {
        [database_id]: {
          schemas: {
            PUBLIC: schema,
          },
        },
      };

      cy.log("**-- Update/save permissions --**");
      cy.request("PUT", "/api/permissions/graph", {
        groups,
        revision,
      });
    },
  );
}

function createJoinedQuestion(name) {
  return cy.request("POST", "/api/card", {
    name,
    dataset_query: {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
      },
      database: 1,
    },
    display: "table",
    visualization_settings: {},
  });
}
