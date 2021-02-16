import {
  describeWithToken,
  openOrdersTable,
  openPeopleTable,
  popover,
  modal,
  restore,
  signInAsAdmin,
  signInAsNormalUser,
  signOut,
  USER_GROUPS,
  remapDisplayValueToFK,
  sidebar,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
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

    it("should allow joins to the sandboxed table (metabase-enterprise#154)", () => {
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

    // Note: This issue was ported from EE repo - it was previously known as (metabase-enterprise#548)
    it("SB question with `case` CC should substitute the `else` argument's table (metabase#14859)", () => {
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

        cy.contains(CC_NAME);
      });
    });

    ["remapped", "default"].forEach(test => {
      it(`${test.toUpperCase()} version:\n drill-through should work on implicit joined tables with sandboxes (metabase#13641)`, () => {
        const QUESTION_NAME = "13641";

        if (test === "remapped") {
          cy.log("**-- Remap Product ID's display value to `title` --**");
          remapDisplayValueToFK({
            display_value: ORDERS.PRODUCT_ID,
            name: "Product ID",
            fk: PRODUCTS.TITLE,
          });
        }

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

    describe("with display values remapped to use a foreign key", () => {
      beforeEach(() => {
        cy.log("**-- Remap Product ID's display value to `title` --**");
        remapDisplayValueToFK({
          display_value: ORDERS.PRODUCT_ID,
          name: "Product ID",
          fk: PRODUCTS.TITLE,
        });
      });

      /**
       * There isn't an exact issue that this test reproduces, but it is basically a version of (metabase-enterprise#520)
       * that uses a query builder instead of SQL based questions.
       */
      it("should be able to sandbox using query builder saved questions", () => {
        cy.server();
        cy.route("POST", "/api/dataset").as("dataset");

        cy.log("**-- 1. Create 'Orders'-based question using QB --**");

        cy.request("POST", "/api/card", {
          name: "520_Orders",
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS_ID,
              filter: [">", ["field-id", ORDERS.TOTAL], 10],
            },
            database: 1,
          },
          display: "table",
          visualization_settings: {},
        }).then(({ body: { id: CARD_ID } }) => {
          cy.log(
            "**-- 1a. Sandbox `Orders` table based on this QB question and user attribute --**",
          );

          cy.request("POST", "/api/mt/gtap", {
            attribute_remappings: {
              [ATTR_UID]: ["dimension", ["field-id", ORDERS.USER_ID]],
            },
            card_id: CARD_ID,
            group_id: COLLECTION_GROUP,
            table_id: ORDERS_ID,
          });
        });

        cy.log("**-- 2. Create 'Products'-based question using QB --**");
        cy.request("POST", "/api/card", {
          name: "520_Products",
          dataset_query: {
            type: "query",
            query: {
              "source-table": PRODUCTS_ID,
              filter: [">", ["field-id", PRODUCTS.PRICE], 10],
            },
            database: 1,
          },
          display: "table",
          visualization_settings: {},
        }).then(({ body: { id: CARD_ID } }) => {
          cy.log(
            "**-- 2a. Sandbox `Products` table based on this QB question and user attribute --**",
          );

          cy.request("POST", "/api/mt/gtap", {
            attribute_remappings: {
              [ATTR_CAT]: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
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

        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });

        cy.get(".cellData")
          .contains("Awesome Concrete Shoes")
          .click();
        cy.findByText(/View details/i).click();

        cy.log(
          "**It should show object details instead of filtering by this Product ID**",
        );
        cy.findByText("McClure-Lockman");
      });

      /**
       * This issue (metabase-enterprise#520) has a peculiar quirk:
       *  - It works ONLY if SQL question is first run (`result_metadata` builds), and then the question is saved.
       *  - In a real-world scenario it is quite possible for an admin to save that SQL question without running it first. This fails!
       *  (more info: https://github.com/metabase/metabase-enterprise/issues/520#issuecomment-772528159)
       *
       * That's why this test has 2 versions that reflect both scenarios. We'll call them "normal" and "workaround".
       * Until the underlying issue is fixed, "normal" scenario will be skipped.
       *
       * Related issues: metabase#10474, metabase#14629
       */

      ["normal", "workaround"].forEach(test => {
        it(`${test.toUpperCase()} version:\n advanced sandboxing should not ignore data model features like object detail of FK (metabase-enterprise#520)`, () => {
          cy.server();
          cy.route("POST", "/api/card/*/query").as("cardQuery");
          cy.route("PUT", "/api/card/*").as("questionUpdate");

          cy.log("**-- 1. Create the first native question with a filter --**");
          cy.request("POST", "/api/card", {
            name: "EE_520_Q1",
            dataset_query: {
              database: 1,
              native: {
                query:
                  "SELECT * FROM ORDERS WHERE USER_ID={{sandbox}} AND TOTAL > 10",
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
            test === "workaround"
              ? runAndSaveQuestion({ question: CARD_ID, sandboxValue: "1" })
              : null;

            cy.log(
              "**-- 1a. Sandbox `Orders` table based on this question --**",
            );

            cy.request("POST", "/api/mt/gtap", {
              attribute_remappings: {
                [ATTR_UID]: ["variable", ["template-tag", "sandbox"]],
              },
              card_id: CARD_ID,
              group_id: COLLECTION_GROUP,
              table_id: ORDERS_ID,
            });
          });
          cy.log(
            "**-- 2. Create the second native question with a filter --**",
          );

          cy.request("POST", "/api/card", {
            name: "EE_520_Q2",
            dataset_query: {
              database: 1,
              native: {
                query:
                  "SELECT * FROM PRODUCTS WHERE CATEGORY={{sandbox}} AND PRICE > 10",
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
            test === "workaround"
              ? runAndSaveQuestion({
                  question: CARD_ID,
                  sandboxValue: "Widget",
                })
              : null;

            cy.log(
              "**-- 2a. Sandbox `Products` table based on this question --**",
            );

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

          /**
           * Helper function related to this test only!
           */
          function runAndSaveQuestion({ question, sandboxValue } = {}) {
            // Run the question
            cy.visit(`/question/${question}?sandbox=${sandboxValue}`);
            // Wait for results
            cy.wait("@cardQuery");
            // Save the question
            cy.findByText("Save").click();
            modal().within(() => {
              cy.findAllByRole("button", { name: "Save" }).click();
            });
            // Wait for an update so the other queries don't accidentally cancel it
            cy.wait("@questionUpdate");
          }
        });
      });

      it("simple sandboxing should work (metabase#14629)", () => {
        cy.server();
        cy.route("POST", "/api/dataset").as("dataset");

        cy.log(
          "**-- 1. Sandbox `Orders` table based on user attribute `attr_uid` --**",
        );

        cy.request("POST", "/api/mt/gtap", {
          table_id: ORDERS_ID,
          group_id: COLLECTION_GROUP,
          card_id: null,
          attribute_remappings: {
            [ATTR_UID]: ["dimension", ["field-id", ORDERS.USER_ID]],
          },
        });

        updatePermissionsGraph({
          schema: {
            [ORDERS_ID]: { query: "segmented", read: "all" },
            [PRODUCTS_ID]: "all",
          },
        });

        signOut();
        signInAsSandboxedUser();
        openOrdersTable();

        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        // Title of the first order for User ID = 1
        cy.findByText("Awesome Concrete Shoes");
      });
    });

    ["remapped", "default"].forEach(test => {
      it(`${test.toUpperCase()} version:\n should work on questions with joins, with sandboxed target table, where target fields cannot be filtered (metabase#13642)`, () => {
        const QUESTION_NAME = "13642";
        const PRODUCTS_ALIAS = "Products";

        if (test === "remapped") {
          cy.log("**-- Remap Product ID's display value to `title` --**");
          remapDisplayValueToFK({
            display_value: ORDERS.PRODUCT_ID,
            name: "Product ID",
            fk: PRODUCTS.TITLE,
          });
        }

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
                [
                  "joined-field",
                  PRODUCTS_ALIAS,
                  ["field-id", PRODUCTS.CATEGORY],
                ],
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

    it("attempt to sandbox based on question with differently-typed columns than a sandboxed table should provide meaningful UI error (metabase#14612)", () => {
      const QUESTION_NAME = "Different type";
      const ERROR_MESSAGE =
        "Sandbox Questions can't return columns that have different types than the Table they are sandboxing.";

      cy.server();
      cy.route("POST", "/api/mt/gtap").as("sandboxTable");

      cy.log(
        "**-- 1. Create question that will have differently-typed columns than the sandboxed table --**",
      );

      cy.request("POST", "/api/card", {
        name: QUESTION_NAME,
        dataset_query: {
          database: 1,
          type: "native",
          native: { query: "SELECT CAST(ID AS VARCHAR) AS ID FROM ORDERS;" },
        },
        display: "table",
        visualization_settings: {},
      });

      cy.visit("/admin/permissions/databases/1/schemas/PUBLIC/tables");
      // |                | All users | collection |
      // |--------------- |:---------:|:----------:|
      // | Orders         |   X (0)   |    X (1)   |
      cy.get(".Icon-close")
        .eq(1) // No better way of doing this, undfortunately (see table above)
        .click();
      cy.findByText("Grant sandboxed access").click();
      cy.findAllByRole("button", { name: "Change" }).click();
      cy.findByText(
        "Use a saved question to create a custom view for this table",
      ).click();
      cy.findByText(QUESTION_NAME).click();
      cy.findAllByRole("button", { name: "Save" }).click();

      cy.wait("@sandboxTable").then(xhr => {
        expect(xhr.status).to.eq(400);
        expect(xhr.response.body.message).to.eq(ERROR_MESSAGE);
      });
      cy.get(".Modal").scrollTo("bottom");
      cy.findByText(ERROR_MESSAGE);
    });

    it("should be able to use summarize columns from joined table based on a saved question (metabase#14766)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      createJoinedQuestion("14766_joined");

      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("14766_joined").click();
      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      cy.findByText(/Products? → ID/).click();
      cy.findByText("Visualize").click();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      // Number of products with ID = 1 (and ID = 19)
      cy.findAllByText("93");
    });

    it("should be able to remove columns via QB sidebar / settings (metabase#14841)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.log("**-- 1. Sandbox `Orders` table --**");
      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          [ATTR_UID]: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
        card_id: null,
        table_id: ORDERS_ID,
        group_id: COLLECTION_GROUP,
      });

      cy.log("**-- 2. Sandbox `Products` table --**");
      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings: {
          [ATTR_CAT]: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
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

      signOut();
      signInAsSandboxedUser();
      createJoinedQuestion("14841").then(({ body: { id: QUESTION_ID } }) => {
        cy.visit(`/question/${QUESTION_ID}`);
      });

      cy.findByText("Settings").click();
      sidebar()
        .should("be.visible")
        .within(() => {
          // Remove the "Subtotal" column from within sidebar
          cy.findByText("Subtotal")
            .parent()
            .find(".Icon-close")
            .click();
        });
      cy.findAllByRole("button", { name: "Done" }).click();
      // Rerun the query
      cy.get(".Icon-play")
        .last()
        .click();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.contains("Subtotal").should("not.exist");
      cy.contains("37.65").should("not.exist");
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
