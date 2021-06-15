import {
  describeWithToken,
  modal,
  openOrdersTable,
  openPeopleTable,
  openReviewsTable,
  popover,
  restore,
  remapDisplayValueToFK,
} from "__support__/e2e/cypress";
import { USER_GROUPS } from "__support__/e2e/cypress_data";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

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

const { DATA_GROUP } = USER_GROUPS;

describeWithToken("formatting > sandboxes", () => {
  describe("admin", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.visit("/admin/people");
    });

    it("should add key attributes to an existing user", () => {
      cy.icon("ellipsis")
        .last()
        .click();
      cy.findByText("Edit user").click();
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("3");
      cy.findByText("Update").click();
    });

    it("should add key attributes to a new user", () => {
      cy.findByText("Invite someone").click();
      cy.findByPlaceholderText("Johnny").type("John");
      cy.findByPlaceholderText("Appleseed").type("Smith");
      cy.findByPlaceholderText("youlooknicetoday@email.com").type(
        "john@smith.test",
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
      cy.signInAsAdmin();

      // Add user attribute to existing ("normal" / id:2) user
      cy.request("PUT", "/api/user/2", {
        login_attributes: { [USER_ATTRIBUTE]: ATTRIBUTE_VALUE },
      });

      // Orders join Products
      createJoinedQuestion(QUESTION_NAME);

      cy.sandboxTable({
        table_id: ORDERS_ID,
        group_id: DATA_GROUP,
        attribute_remappings: {
          [USER_ATTRIBUTE]: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      cy.createNativeQuestion({
        name: "sql param",
        native: {
          query: `select id,name,address,email from people where {{${TTAG_NAME}}}`,
          "template-tags": {
            [TTAG_NAME]: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
              name: TTAG_NAME,
              "display-name": "CID",
              type: "dimension",
              dimension: ["field", PEOPLE.ID, null],
              "widget-type": "id",
            },
          },
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.sandboxTable({
          table_id: PEOPLE_ID,
          card_id: QUESTION_ID,
          group_id: DATA_GROUP,
          attribute_remappings: {
            [USER_ATTRIBUTE]: ["dimension", ["template-tag", TTAG_NAME]],
          },
        });
      });

      cy.signOut();
      cy.signInAsNormalUser();
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
        cy.log("Open saved question with joins");
        cy.visit("/collection/root");
        cy.findByText(QUESTION_NAME).click();

        cy.log("Make sure user is initially sandboxed");
        cy.get(".TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          11,
        );

        cy.log("Add filter to a question");
        cy.icon("notebook").click();
        cy.findByText("Filter").click();
        popover().within(() => {
          cy.findByText("Total").click();
        });
        cy.findByText("Equal to").click();
        cy.findByText("Greater than").click();
        cy.findByPlaceholderText("Enter a number").type("100");
        cy.findByText("Add filter").click();
        cy.button("Visualize").click();

        cy.log("Make sure user is still sandboxed");
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
      cy.signInAsAdmin();
    });

    it("should allow joins to the sandboxed table (metabase-enterprise#154)", () => {
      cy.sandboxTable({
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", PEOPLE.ID, null]],
        },
      });

      cy.updatePermissionsSchemas({
        schemas: {
          PUBLIC: {
            [ORDERS_ID]: "all",
            [PRODUCTS_ID]: "all",
            [REVIEWS_ID]: "all",
          },
        },
      });

      cy.signOut();
      cy.signInAsSandboxedUser();

      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();

      cy.log(
        "Original issue reported failure to find 'User' group / foreign key",
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

      cy.button("Visualize").click();
      cy.findByText("Count by User → ID");
      cy.findByText("11"); // Sum of orders for user with ID #1
    });

    // Note: This issue was ported from EE repo - it was previously known as (metabase-enterprise#548)
    it("SB question with `case` CC should substitute the `else` argument's table (metabase#14859)", () => {
      const QUESTION_NAME = "EE_548";
      const CC_NAME = "CC_548"; // Custom column

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      cy.createQuestion({
        name: QUESTION_NAME,
        query: {
          expressions: {
            [CC_NAME]: [
              "case",
              [
                [
                  [">", ["field", ORDERS.DISCOUNT, null], 0],
                  ["field", ORDERS.DISCOUNT],
                  null,
                ],
              ],
              { default: ["field", ORDERS.TOTAL, null] },
            ],
          },
          "source-table": ORDERS_ID,
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.signOut();
        cy.signInAsSandboxedUser();

        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        // Assertion phase starts here
        cy.visit(`/question/${QUESTION_ID}`);
        cy.findByText(QUESTION_NAME);

        cy.log("Reported failing since v1.36.4");
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
          cy.log("Remap Product ID's display value to `title`");
          remapDisplayValueToFK({
            display_value: ORDERS.PRODUCT_ID,
            name: "Product ID",
            fk: PRODUCTS.TITLE,
          });
        }

        cy.sandboxTable({
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        cy.updatePermissionsSchemas({
          schemas: {
            PUBLIC: {
              [PRODUCTS_ID]: "all",
            },
          },
        });

        cy.log(
          "Create question based on steps in [#13641](https://github.com/metabase/metabase/issues/13641)",
        );
        cy.createQuestion({
          name: QUESTION_NAME,
          query: {
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
            "source-table": ORDERS_ID,
          },
          display: "bar",
        });

        cy.signOut();
        cy.signInAsSandboxedUser();

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

        cy.log("Reported failing on v1.37.0.2");
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

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      cy.updatePermissionsSchemas({
        schemas: {
          PUBLIC: {
            [PRODUCTS_ID]: "all",
          },
        },
      });

      cy.log(
        "Create question based on steps in https://github.com/metabase/metabase-enterprise/issues/535",
      );
      cy.createQuestion({
        name: QUESTION_NAME,
        query: {
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
          ],
          joins: [
            {
              alias: PRODUCTS_ALIAS,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
          "source-table": ORDERS_ID,
        },
        display: "bar",
      });

      cy.signOut();
      cy.signInAsSandboxedUser();

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
      cy.log("Reported failing on v1.36.4");
      cy.findByText("Category is Doohickey");
      cy.findByText("97.44"); // Subtotal for order #10
    });

    describe("with display values remapped to use a foreign key", () => {
      beforeEach(() => {
        cy.log("Remap Product ID's display value to `title`");
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

        cy.log("Create 'Orders'-based question using QB");
        cy.createQuestion({
          name: "520_Orders",
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 10],
          },
        }).then(({ body: { id: CARD_ID } }) => {
          cy.sandboxTable({
            table_id: ORDERS_ID,
            card_id: CARD_ID,
            attribute_remappings: {
              attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
            },
          });
        });

        cy.log("Create 'Products'-based question using QB");
        cy.createQuestion({
          name: "520_Products",
          query: {
            "source-table": PRODUCTS_ID,
            filter: [">", ["field", PRODUCTS.PRICE, null], 10],
          },
        }).then(({ body: { id: CARD_ID } }) => {
          cy.sandboxTable({
            table_id: PRODUCTS_ID,
            card_id: CARD_ID,
            attribute_remappings: {
              attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          });
        });

        cy.signOut();
        cy.signInAsSandboxedUser();

        openOrdersTable();

        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });

        cy.get(".cellData")
          .contains("Awesome Concrete Shoes")
          .click();
        cy.findByText(/View details/i).click();

        cy.log(
          "It should show object details instead of filtering by this Product ID",
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

      // skipping the workaround test because the function `runAndSaveQuestion`
      // relies on the existence of a save button on a saved question that is not dirty
      // which is a bug fixed in ssue metabase#14302
      ["normal" /* , "workaround" */].forEach(test => {
        it(`${test.toUpperCase()} version:\n advanced sandboxing should not ignore data model features like object detail of FK (metabase-enterprise#520)`, () => {
          cy.server();
          cy.route("POST", "/api/card/*/query").as("cardQuery");
          cy.route("PUT", "/api/card/*").as("questionUpdate");

          cy.createNativeQuestion({
            name: "EE_520_Q1",
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
          }).then(({ body: { id: CARD_ID } }) => {
            test === "workaround"
              ? runAndSaveQuestion({ question: CARD_ID, sandboxValue: "1" })
              : null;

            cy.sandboxTable({
              table_id: ORDERS_ID,
              card_id: CARD_ID,
              attribute_remappings: {
                attr_uid: ["variable", ["template-tag", "sandbox"]],
              },
            });
          });

          cy.createNativeQuestion({
            name: "EE_520_Q2",
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
          }).then(({ body: { id: CARD_ID } }) => {
            test === "workaround"
              ? runAndSaveQuestion({
                  question: CARD_ID,
                  sandboxValue: "Widget",
                })
              : null;

            cy.sandboxTable({
              table_id: PRODUCTS_ID,
              card_id: CARD_ID,
              attribute_remappings: {
                attr_cat: ["variable", ["template-tag", "sandbox"]],
              },
            });
          });

          cy.signOut();
          cy.signInAsSandboxedUser();

          openOrdersTable();

          cy.log("Reported failing on v1.36.x");

          cy.log(
            "It should show remapped Display Values instead of Product ID",
          );
          cy.get(".cellData")
            .contains("Awesome Concrete Shoes")
            .click();
          cy.findByText(/View details/i).click();

          cy.log(
            "It should show object details instead of filtering by this Product ID",
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
              cy.button("Save").click();
            });
            // Wait for an update so the other queries don't accidentally cancel it
            cy.wait("@questionUpdate");
          }
        });
      });

      it("simple sandboxing should work (metabase#14629)", () => {
        cy.server();
        cy.route("POST", "/api/dataset").as("dataset");

        cy.sandboxTable({
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        cy.updatePermissionsSchemas({
          schemas: {
            PUBLIC: {
              [PRODUCTS_ID]: "all",
            },
          },
        });

        cy.signOut();
        cy.signInAsSandboxedUser();
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
          cy.log("Remap Product ID's display value to `title`");
          remapDisplayValueToFK({
            display_value: ORDERS.PRODUCT_ID,
            name: "Product ID",
            fk: PRODUCTS.TITLE,
          });
        }

        cy.sandboxTable({
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        cy.sandboxTable({
          table_id: PRODUCTS_ID,
          attribute_remappings: {
            attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          },
        });

        cy.createQuestion({
          name: QUESTION_NAME,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
            ],
            joins: [
              {
                fields: "all",
                "source-table": PRODUCTS_ID,
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
                ],
                alias: PRODUCTS_ALIAS,
              },
            ],
            "source-table": ORDERS_ID,
          },
          display: "bar",
        });

        cy.signOut();
        cy.signInAsSandboxedUser();

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
      cy.route("GET", "/api/permissions/group").as("tablePermissions");

      // Question with differently-typed columns than the sandboxed table
      cy.createNativeQuestion({
        name: QUESTION_NAME,
        native: { query: "SELECT CAST(ID AS VARCHAR) AS ID FROM ORDERS;" },
      });

      cy.visit("/admin/permissions/databases/1/schemas");
      cy.findByText("View tables").click();
      // |                | All users | collection |
      // |--------------- |:---------:|:----------:|
      // | Orders         |   X (0)   |    X (1)   |

      cy.wait("@tablePermissions");
      cy.icon("close")
        .eq(1) // No better way of doing this, undfortunately (see table above)
        .click();
      cy.findByText("Grant sandboxed access").click();
      cy.button("Change").click();
      cy.findByText(
        "Use a saved question to create a custom view for this table",
      ).click();
      cy.findByText(QUESTION_NAME).click();
      cy.button("Save").click();

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
      cy.button("Visualize").click();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      // Number of products with ID = 1 (and ID = 19)
      cy.findAllByText("93");
    });

    it("should be able to remove columns via QB sidebar / settings (metabase#14841)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.sandboxTable({
        table_id: PRODUCTS_ID,
        attribute_remappings: {
          attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
      });

      cy.signOut();
      cy.signInAsSandboxedUser();
      createJoinedQuestion("14841").then(({ body: { id: QUESTION_ID } }) => {
        cy.visit(`/question/${QUESTION_ID}`);
      });

      cy.findByText("Settings").click();
      cy.findByTestId("sidebar-left")
        .should("be.visible")
        .within(() => {
          // Remove the "Subtotal" column from within sidebar
          cy.findByText("Subtotal")
            .parent()
            .find(".Icon-close")
            .click();
        });
      cy.button("Done").click();
      // Rerun the query
      cy.icon("play")
        .last()
        .click();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.contains("Subtotal").should("not.exist");
      cy.contains("37.65").should("not.exist");
    });

    it("should work with pivot tables (metabase#14969)", () => {
      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.sandboxTable({
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", PEOPLE.ID]],
        },
      });

      cy.sandboxTable({
        table_id: PRODUCTS_ID,
        attribute_remappings: {
          attr_cat: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
        },
      });

      cy.request("POST", "/api/card/", {
        name: "14969",
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                "source-table": PEOPLE_ID,
                condition: [
                  "=",
                  ["field-id", ORDERS.USER_ID],
                  ["joined-field", "People - User", ["field-id", PEOPLE.ID]],
                ],
                alias: "People - User",
              },
            ],
            aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
            breakout: [
              ["joined-field", "People - User", ["field-id", PEOPLE.SOURCE]],
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.CATEGORY],
              ],
            ],
          },
          database: 1,
        },
        display: "pivot",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/pivot/${QUESTION_ID}/query`).as(
          "cardQuery",
        );

        cy.signOut();
        cy.signInAsSandboxedUser();

        cy.visit(`/question/${QUESTION_ID}`);

        cy.wait("@cardQuery").then(xhr => {
          expect(xhr.response.body.cause).not.to.exist;
        });
      });

      cy.findByText("Twitter");
      cy.findByText("Row totals");
    });

    it("should show dashboard subscriptions for sandboxed user (metabase#14990)", () => {
      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.signInAsSandboxedUser();
      cy.visit("/dashboard/1");
      cy.icon("share").click();
      cy.findByText("Dashboard subscriptions").click();
      // We're starting without email or Slack being set up so it's expected to see the following:
      cy.findByText("Create a dashboard subscription");
      cy.findAllByRole("link", { name: "set up email" });
      cy.findAllByRole("link", { name: "configure Slack" });
    });

    it.skip("sandboxed user should be able to send pulses to Slack (metabase#14844)", () => {
      cy.viewport(1400, 1000);

      cy.server();
      cy.route("GET", "/api/collection/*").as("collection");

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.signOut();
      cy.signInAsSandboxedUser();

      cy.visit("/pulse/create");
      cy.wait("@collection");
      cy.findByText("Where should this data go?")
        .parent()
        .within(() => {
          cy.findByText("Email");
          cy.findByText("Slack");
        });
    });

    it.skip("should be able to visit ad-hoc/dirty question when permission is granted to the linked table column, but not to the linked table itself (metabase#15105)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: [
            "dimension",
            ["fk->", ["field-id", ORDERS.USER_ID], ["field-id", PEOPLE.ID]],
          ],
        },
      });

      cy.signOut();
      cy.signInAsSandboxedUser();
      openOrdersTable();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.contains("37.65");
    });

    it.skip("unsaved/dirty query should work on linked table column with multiple dimensions and remapping (metabase#15106)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");

      remapDisplayValueToFK({
        display_value: ORDERS.USER_ID,
        name: "User ID",
        fk: PEOPLE.NAME,
      });

      // Remap REVIEWS.PRODUCT_ID Field Type to ORDERS.ID
      cy.request("PUT", `/api/field/${REVIEWS.PRODUCT_ID}`, {
        table_id: REVIEWS_ID,
        special_type: "type/FK",
        name: "PRODUCT_ID",
        fk_target_field_id: ORDERS.ID,
        display_name: "Product ID",
      });

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.sandboxTable({
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", PEOPLE.ID]],
        },
      });

      cy.sandboxTable({
        table_id: REVIEWS_ID,
        attribute_remappings: {
          attr_uid: [
            "dimension",
            [
              "fk->",
              ["field-id", REVIEWS.PRODUCT_ID],
              ["field-id", ORDERS.USER_ID],
            ],
          ],
        },
      });
      cy.signOut();
      cy.signInAsSandboxedUser();
      openReviewsTable();

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      // Add positive assertion once this issue is fixed
    });

    it("sandboxed user should receive sandboxed dashboard subscription", () => {
      cy.request("DELETE", "http://localhost:80/email/all");
      cy.request("PUT", "/api/setting", {
        "email-smtp-host": "localhost",
        "email-smtp-port": "25",
        "email-smtp-username": "admin",
        "email-smtp-password": "admin",
        "email-smtp-security": "none",
        "email-from-address": "mailer@metabase.test",
      });
      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
        },
      });

      cy.signInAsSandboxedUser();
      cy.visit("/dashboard/1");
      cy.icon("share").click();
      cy.findByText("Dashboard subscriptions").click();
      cy.findByText("Email it").click();
      cy.findByPlaceholderText("Enter user names or email addresses").click();
      cy.findByText("User 1").click();
      cy.findByText("Send email now").click();
      cy.findByText("Email sent");
      cy.request("GET", "http://localhost:80/email").then(({ body }) => {
        expect(body[0].html).to.include("Orders in a dashboard");
        expect(body[0].html).to.include("37.65");
        expect(body[0].html).not.to.include("148.23"); // Order for user with ID 3
      });
    });
  });
});

function createJoinedQuestion(name) {
  return cy.createQuestion({
    name,

    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  });
}
