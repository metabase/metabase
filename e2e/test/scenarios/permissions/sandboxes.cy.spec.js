import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  assertDatasetIsSandboxed,
  assertQueryBuilderRowCount,
  chartPathWithFillColor,
  describeEE,
  entityPickerModal,
  entityPickerModalTab,
  filter,
  getDashboardCards,
  modal,
  openNotebook,
  openOrdersTable,
  openPeopleTable,
  openReviewsTable,
  openSharingMenu,
  popover,
  remapDisplayValueToFK,
  restore,
  selectFilterOperator,
  sendEmailAndAssert,
  setTokenFeatures,
  setupSMTP,
  sidebar,
  startNewQuestion,
  summarize,
  visitDashboard,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

const { DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describeEE("formatting > sandboxes", () => {
  describe("admin", () => {
    beforeEach(() => {
      restore("default-ee");
      cy.signInAsAdmin();
      setTokenFeatures("all");
      cy.visit("/admin/people");
    });

    it("should add key attributes to an existing user", () => {
      cy.icon("ellipsis").first().click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit user").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Update").click();
    });

    it("should add key attributes to a new user", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Invite someone").click();
      cy.findByPlaceholderText("Johnny").type("John");
      cy.findByPlaceholderText("Appleseed").type("Smith");
      cy.findByPlaceholderText("nicetoseeyou@email.com").type(
        "john@smith.test",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("1");
      cy.findAllByText("Create").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Done").click();
    });
  });

  describe("normal user", () => {
    const USER_ATTRIBUTE = "User ID";
    const ATTRIBUTE_VALUE = "3";
    const TTAG_NAME = "cid";
    const QUESTION_NAME = "Joined test";

    beforeEach(() => {
      restore("default-ee");
      cy.signInAsAdmin();
      setTokenFeatures("all");

      // Add user attribute to existing ("normal" / id:2) user
      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
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
        assertDatasetIsSandboxed();
        // 10 rows filtered on User ID
        cy.findAllByText(ATTRIBUTE_VALUE).should("have.length", 10);
      });
    });

    describe("question with joins", () => {
      it("should be sandboxed even after applying a filter to the question", () => {
        cy.log("Open saved question with joins");
        visitQuestion("@questionId");

        cy.log("Make sure user is initially sandboxed");
        cy.get(".test-TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          11,
        );

        cy.log("Add filter to a question");
        openNotebook();
        filter({ mode: "notebook" });
        popover().findByText("Total").click();
        selectFilterOperator("Greater than");
        popover().within(() => {
          cy.findByPlaceholderText("Enter a number").type("100");
          cy.button("Add filter").click();
        });

        visualize();
        cy.log("Make sure user is still sandboxed");
        assertDatasetIsSandboxed();
        cy.get(".test-TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          7,
        );
      });
    });

    describe("table sandboxed on a saved parameterized SQL question", () => {
      it("should show filtered categories", () => {
        openPeopleTable();
        assertDatasetIsSandboxed();
        cy.get(".test-TableInteractive-headerCellData").should(
          "have.length",
          4,
        );
        cy.get(".test-TableInteractive-cellWrapper--firstColumn").should(
          "have.length",
          2,
        );
      });
    });
  });

  describe("Sandboxing reproductions", () => {
    beforeEach(() => {
      restore("default-ee");
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("should allow joins to the sandboxed table (metabase-enterprise#154)", () => {
      cy.updatePermissionsGraph({
        [COLLECTION_GROUP]: {
          [SAMPLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": {
              PUBLIC: {
                [ORDERS_ID]: "query-builder",
                [PRODUCTS_ID]: "query-builder",
                [REVIEWS_ID]: "query-builder",
              },
            },
          },
        },
      });

      cy.sandboxTable({
        table_id: PEOPLE_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", PEOPLE.ID, null]],
        },
      });

      cy.signOut();
      cy.signInAsSandboxedUser();

      openOrdersTable({ mode: "notebook" });
      summarize({ mode: "notebook" });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();

      cy.log(
        "Original issue reported failure to find 'User' group / foreign key",
      );

      popover().within(() => {
        // Collapse "Order/s/" in order to bring "User" into view (trick to get around virtualization - credits: @flamber)
        cy.get("[data-element-id=list-section-header]")
          .contains(/Orders?/)
          .click();

        cy.get("[data-element-id=list-section-header]")
          .contains("User")
          .click();

        cy.get("[data-element-id=list-item]").contains("ID").click();
      });

      visualize();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by User → ID");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("11"); // Sum of orders for user with ID #1
      assertQueryBuilderRowCount(2); // test that user is sandboxed - normal users has over 2000 rows
      assertDatasetIsSandboxed();
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

        // Assertion phase starts here
        visitQuestion(QUESTION_ID);
        cy.findByText(QUESTION_NAME);

        cy.log("Reported failing since v1.36.4");
        cy.contains(CC_NAME);
        assertQueryBuilderRowCount(11); // test that user is sandboxed - normal users has over 2000 rows
        assertDatasetIsSandboxed(`@cardQuery${QUESTION_ID}`);
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

        cy.updatePermissionsGraph({
          [COLLECTION_GROUP]: {
            [SAMPLE_DB_ID]: {
              "view-data": {
                PUBLIC: {
                  [PRODUCTS_ID]: "unrestricted",
                },
              },
              "create-queries": {
                PUBLIC: {
                  [PRODUCTS_ID]: "query-builder",
                },
              },
            },
          },
        });

        cy.sandboxTable({
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
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

        cy.intercept("POST", "/api/card/*/query").as("cardQuery");
        cy.intercept("POST", "/api/dataset").as("dataset");

        // Find saved question in "Our analytics"
        cy.visit("/collection/root");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(QUESTION_NAME).click();

        cy.wait("@cardQuery");
        // Drill-through
        cy.findByTestId("query-visualization-root").within(() => {
          // Click on the first bar in a graph (Category: "Doohickey")
          chartPathWithFillColor("#509EE3").eq(0).click();
        });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("See these Orders").click();

        cy.log("Reported failing on v1.37.0.2");
        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Product → Category is Doohickey");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("97.44"); // Subtotal for order #10
        assertQueryBuilderRowCount(2); // test that user is sandboxed - normal users has over 2000 rows
        assertDatasetIsSandboxed("@dataset");
        assertDatasetIsSandboxed("@cardQuery");
      });
    });

    it("should allow drill-through for sandboxed user (metabase-enterprise#535)", () => {
      const PRODUCTS_ALIAS = "Products";
      const QUESTION_NAME = "EE_535";

      cy.updatePermissionsGraph({
        [COLLECTION_GROUP]: {
          [SAMPLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": {
              PUBLIC: {
                [PRODUCTS_ID]: "query-builder",
              },
            },
          },
        },
      });

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
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

      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.intercept("POST", "/api/dataset").as("dataset");

      // Find saved question in "Our analytics"
      cy.visit("/collection/root");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(QUESTION_NAME).click();

      cy.wait("@cardQuery");
      // Drill-through
      cy.findByTestId("query-visualization-root").within(() => {
        // Click on the first bar in a graph (Category: "Doohickey")
        chartPathWithFillColor("#509EE3").eq(0).click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See these Orders").click();

      cy.wait("@dataset");
      cy.log("Reported failing on v1.36.4");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Products → Category is Doohickey");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("97.44"); // Subtotal for order #10
      assertQueryBuilderRowCount(2); // test that user is sandboxed - normal users has over 2000 rows
      assertDatasetIsSandboxed("@dataset");
      assertDatasetIsSandboxed("@cardQuery");
    });

    describe(
      "with display values remapped to use a foreign key",
      { tags: "@flaky" },
      () => {
        beforeEach(() => {
          cy.intercept("POST", "/api/dataset").as("datasetQuery");
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

          openOrdersTable({
            callback: xhr => expect(xhr.response.body.error).not.to.exist,
          });

          cy.wait("@datasetQuery");

          assertQueryBuilderRowCount(11); // test that user is sandboxed - normal users has over 2000 rows
          assertDatasetIsSandboxed("@datasetQuery");

          cy.findByTestId("TableInteractive-root")
            .findByText("Awesome Concrete Shoes")
            .click();
          popover()
            .findByText(/View details/i)
            .click();

          cy.log(
            "It should show object details instead of filtering by this Product ID",
          );
          cy.findByTestId("object-detail");
          cy.findAllByText("McClure-Lockman");
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
        // which is a bug fixed in issue metabase#14302
        ["normal" /* , "workaround" */].forEach(test => {
          it(
            `${test.toUpperCase()} version:\n advanced sandboxing should not ignore data model features like object detail of FK (metabase-enterprise#520)`,
            { tags: "@quarantine" },
            () => {
              cy.intercept("POST", "/api/card/*/query").as("cardQuery");
              cy.intercept("PUT", "/api/card/*").as("questionUpdate");

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
              cy.get("[data-testid=cell-data]")
                .contains("Awesome Concrete Shoes")
                .click();
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText(/View details/i).click();

              cy.log(
                "It should show object details instead of filtering by this Product ID",
              );
              // The name of this Vendor is visible in "details" only
              cy.findByTestId("object-detail");
              cy.findAllByText("McClure-Lockman");

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
            },
          );
        });

        it("simple sandboxing should work (metabase#14629)", () => {
          cy.updatePermissionsGraph({
            [COLLECTION_GROUP]: {
              [SAMPLE_DB_ID]: {
                "view-data": {
                  PUBLIC: {
                    [PRODUCTS_ID]: "unrestricted",
                  },
                },
              },
            },
          });

          cy.sandboxTable({
            table_id: ORDERS_ID,
            attribute_remappings: {
              attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
            },
          });

          cy.signOut();
          cy.signInAsSandboxedUser();
          openOrdersTable({
            callback: xhr => expect(xhr.response.body.error).not.to.exist,
          });
          assertQueryBuilderRowCount(11); // test that user is sandboxed - normal users has over 2000 rows
          assertDatasetIsSandboxed();

          // Title of the first order for User ID = 1
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Awesome Concrete Shoes");

          cy.signOut();
          cy.signInAsAdmin();
          cy.visit(
            "/admin/permissions/data/group/3/database/1/schema/PUBLIC/5/segmented",
          );
        });
      },
    );

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

        cy.intercept("POST", "/api/card/*/query").as("cardQuery");
        cy.intercept("POST", "/api/dataset").as("dataset");

        cy.visit("/collection/root");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(QUESTION_NAME).click();

        cy.wait("@cardQuery");
        assertQueryBuilderRowCount(2); // test that user is sandboxed - normal users has 4

        // Drill-through
        cy.findByTestId("query-visualization-root").within(() => {
          // Click on the second bar in a graph (Category: "Widget")
          chartPathWithFillColor("#509EE3").eq(1).click();
        });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("See these Orders").click();

        cy.wait("@dataset").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("37.65");
        assertQueryBuilderRowCount(6); // test that user is sandboxed - normal users has over 2000
      });
    });

    it("attempt to sandbox based on question with differently-typed columns than a sandboxed table should provide meaningful UI error (metabase#14612)", () => {
      const QUESTION_NAME = "Different type";
      const ERROR_MESSAGE =
        "Sandbox Questions can't return columns that have different types than the Table they are sandboxing.";

      cy.intercept("POST", "/api/mt/gtap/validate").as("sandboxTable");
      cy.intercept("GET", "/api/permissions/group").as("tablePermissions");

      // Question with differently-typed columns than the sandboxed table
      cy.createNativeQuestion({
        name: QUESTION_NAME,
        native: { query: "SELECT CAST(ID AS VARCHAR) AS ID FROM ORDERS;" },
      });

      cy.visit(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
      );
      cy.wait("@tablePermissions");
      cy.icon("eye")
        .eq(1) // No better way of doing this, unfortunately (see table above)
        .click();
      popover().findByText("Sandboxed").click();
      cy.button("Change").click();
      modal()
        .findByText(
          "Use a saved question to create a custom view for this table",
        )
        .click();

      modal().findByText("Select a question").click();

      entityPickerModal().findByText(QUESTION_NAME).click();
      modal().button("Save").click();
      cy.wait("@sandboxTable").then(({ response }) => {
        expect(response.statusCode).to.eq(400);
        expect(response.body.message).to.eq(ERROR_MESSAGE);
      });
      modal().scrollTo("bottom");
      modal().findByText(ERROR_MESSAGE);
    });

    it("should be able to use summarize columns from joined table based on a saved question (metabase#14766)", () => {
      createJoinedQuestion("14766_joined");

      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        cy.findByText("14766_joined").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick the metric you want to see").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Products? → ID/).click();

      visualize(response => {
        expect(response.body.error).to.not.exist;
      });

      // Number of products with ID = 1 (and ID = 19)
      cy.findAllByText("93");
    });

    it("should be able to remove columns via QB sidebar / settings (metabase#14841)", () => {
      cy.intercept("POST", "/api/dataset").as("dataset");

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
      createJoinedQuestion("14841", { visitQuestion: true });

      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("sidebar-left")
        .should("be.visible")
        .within(() => {
          // Remove the "Subtotal" column from within sidebar
          cy.findByText("Subtotal").parent().find(".Icon-eye_outline").click();
        });

      cy.button("Done").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Subtotal").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("37.65").should("not.exist");
      assertQueryBuilderRowCount(11); // test that user is sandboxed - normal users has over 2000 rows
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
          database: SAMPLE_DB_ID,
        },
        display: "pivot",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.signOut();
        cy.signInAsSandboxedUser();

        visitQuestion(QUESTION_ID);
        assertDatasetIsSandboxed(`@cardQuery${QUESTION_ID}`);
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Twitter");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Row totals");
      assertQueryBuilderRowCount(6); // test that user is sandboxed - normal users has 30
    });

    it("should show dashboard subscriptions for sandboxed user (metabase#14990)", () => {
      setupSMTP();

      cy.sandboxTable({
        table_id: ORDERS_ID,
        attribute_remappings: {
          attr_uid: ["dimension", ["field-id", ORDERS.USER_ID]],
        },
      });

      cy.signInAsSandboxedUser();
      visitDashboard(ORDERS_DASHBOARD_ID);
      openSharingMenu("Subscriptions");

      // should forward to email since that is the only one setup
      sidebar().findByText("Email this dashboard").should("exist");

      // test that user is sandboxed - normal users has over 2000 rows
      getDashboardCards().findByText("Rows 1-6 of 11").should("exist");
      assertDatasetIsSandboxed(`@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`);
    });

    it.skip("should be able to visit ad-hoc/dirty question when permission is granted to the linked table column, but not to the linked table itself (metabase#15105)", () => {
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

      openOrdersTable({
        callback: xhr => expect(xhr.response.body.error).not.to.exist,
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("37.65");
    });

    it("unsaved/dirty query should work on linked table column with multiple dimensions and remapping (metabase#15106)", () => {
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

      openReviewsTable({
        callback: xhr => expect(xhr.response.body.error).not.to.exist,
      });

      assertQueryBuilderRowCount(57); // test that user is sandboxed - normal users has 1,112 rows
      assertDatasetIsSandboxed();

      // Add positive assertion once this issue is fixed
    });

    it(
      "sandboxed user should receive sandboxed dashboard subscription",
      { tags: "@external" },
      () => {
        setupSMTP();

        cy.sandboxTable({
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: ["dimension", ["field", ORDERS.USER_ID, null]],
          },
        });

        cy.signInAsSandboxedUser();
        visitDashboard(ORDERS_DASHBOARD_ID);

        // test that user is sandboxed - normal users has over 2000 rows
        getDashboardCards().findByText("Rows 1-6 of 11").should("exist");
        assertDatasetIsSandboxed(
          `@dashcardQuery${ORDERS_DASHBOARD_DASHCARD_ID}`,
        );

        openSharingMenu("Subscriptions");

        sidebar()
          .findByPlaceholderText("Enter user names or email addresses")
          .click();
        popover().findByText("User 1").click();
        sendEmailAndAssert(email => {
          expect(email.html).to.include("Orders in a dashboard");
          expect(email.html).to.include("37.65");
          expect(email.html).not.to.include("148.23"); // Order for user with ID 3
        });
      },
    );
  });
});

function createJoinedQuestion(name, { visitQuestion = false } = {}) {
  return cy.createQuestion(
    {
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
    },
    { wrapId: true, visitQuestion },
  );
}
