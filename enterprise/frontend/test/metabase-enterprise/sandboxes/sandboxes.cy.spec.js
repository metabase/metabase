import {
  describeWithToken,
  openOrdersTable,
  popover,
  restore,
  signInAsAdmin,
  signInAsNormalUser,
  signOut,
  withSampleDataset,
} from "__support__/cypress";

const new_user = {
  first_name: "Barb",
  last_name: "Tabley",
  username: "new@metabase.com",
};

// TODO: If we ever have the need to use this user across multiple tests, extract it to `__support__/cypress`
const sandboxed_user = {
  first_name: "User",
  last_name: "1",
  email: "u1@metabase.test",
  password: "12341234",
  login_attributes: {
    user_id: "1",
  },
  // Because of the specific restrictions and the way testing dataset was set up,
  // this user needs to also have access to "collections" (group_id: 4) in order to see saved questions
  group_ids: [1, 4],
};

function createUser(user) {
  return cy.request("POST", "/api/user", user);
}

describeWithToken("formatting > sandboxes", () => {
  before(restore);

  describe("Setup for sandbox tests", () => {
    beforeEach(signInAsAdmin);

    it("should make SQL question", () => {
      withSampleDataset(({ PEOPLE }) => {
        cy.request("POST", "/api/card", {
          name: "sql param",
          dataset_query: {
            type: "native",
            native: {
              query: "select id,name,address,email from people where {{cid}}",
              "template-tags": {
                cid: {
                  id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
                  name: "cid",
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
        });
      });
    });

    it("should make a JOINs table", () => {
      openOrdersTable();
      cy.wait(1000)
        .get(".Icon-notebook")
        .click();
      cy.wait(1000)
        .findByText("Join data")
        .click();
      cy.findByText("Products").click();
      cy.findByText("Visualize").click();
      cy.findByText("Save").click();

      cy.findByLabelText("Name")
        .clear()
        .wait(1)
        .type("test joins table");
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Not now").click();
    });
  });

  describe("Sandboxes should work", () => {
    beforeEach(signInAsNormalUser);

    it("should add key attributes to new user and existing user", () => {
      signOut();
      signInAsAdmin();

      // Existing user
      cy.visit("/admin/people");
      cy.get(".Icon-ellipsis")
        .last()
        .click();
      cy.findByText("Edit user").click();
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("3");
      cy.findByText("Update").click();

      // New user
      cy.visit("/admin/people");
      cy.findByText("Add someone").click();
      cy.findByPlaceholderText("Johnny").type(new_user.first_name);
      cy.findByPlaceholderText("Appleseed").type(new_user.last_name);
      cy.findByPlaceholderText("youlooknicetoday@email.com").type(
        new_user.username,
      );
      cy.findByText("Add an attribute").click();
      cy.findByPlaceholderText("Key").type("User ID");
      cy.findByPlaceholderText("Value").type("1");
      cy.findAllByText("Create").click();
      cy.findByText("Done").click();
    });

    it("should change sandbox permissions as admin", () => {
      signOut();
      signInAsAdmin();
      const ADMIN_GROUP = 2;
      const DATA_GROUP = 5;

      // Changes Orders permssions to use filter and People to use SQL filter
      withSampleDataset(
        ({ ORDERS_ID, PEOPLE_ID, PRODUCTS_ID, REVIEWS_ID, ORDERS }) => {
          cy.request("POST", "/api/mt/gtap", {
            id: 1,
            group_id: DATA_GROUP,
            table_id: ORDERS_ID,
            card_id: null,
            attribute_remappings: {
              "User ID": ["dimension", ["field-id", ORDERS.USER_ID]],
            },
          });
          cy.request("POST", "/api/mt/gtap", {
            group_id: DATA_GROUP,
            table_id: PEOPLE_ID,
            card_id: 4,
            attribute_remappings: {
              "User ID": ["dimension", ["template-tag", "cid"]],
            },
          });
          cy.request("PUT", "/api/permissions/graph", {
            revision: 1,
            groups: {
              [ADMIN_GROUP]: { "1": { native: "write", schemas: "all" } },
              [DATA_GROUP]: {
                "1": {
                  schemas: {
                    PUBLIC: {
                      [ORDERS_ID]: { query: "segmented", read: "all" },
                      [PEOPLE_ID]: { query: "segmented", read: "all" },
                      [PRODUCTS_ID]: "all",
                      [REVIEWS_ID]: "all",
                    },
                  },
                },
              },
            },
          });
        },
      );
    });

    it("should be sandboxed with a filter (on normal table)", () => {
      cy.visit("/browse/1");
      cy.findByText("Orders").click();

      // Table filter - only 10 rows should show up
      cy.contains("Showing 10");

      // And those rows should only show the User ID of 3
      // First get the number of columns...
      // And then find the index of the column that contains "User ID"
      // Then ensure every nth element of that column only contains the desired User ID
      // TODO: If we use this again, it should go in a helper
      cy.get(".TableInteractive-headerCellData")
        .its("length")
        .then(columnCount => {
          cy.contains(".TableInteractive-headerCellData", "User ID")
            .invoke("index")
            .then(userIDIndex => {
              cy.get(".cellData")
                .its("length")
                .then(cellCountWithHeaders => {
                  const range = (start, stop, step) =>
                    Array.from(
                      { length: (stop - start) / step + 1 },
                      (_, i) => start + i * step,
                    );
                  // Loop over the columns starting at the zero-indexed second row (first row is headers)
                  // userIDIndex is already zero-indexed, so we just add that to the number of columns
                  const genArr = range(
                    columnCount + userIDIndex,
                    cellCountWithHeaders,
                    columnCount,
                  );
                  cy.wrap(genArr).each(index => {
                    cy.get(".cellData")
                      .eq(index)
                      .should("have.text", "3");
                  });
                });
            });
        });

      // Notebook filter
      cy.get(".Icon-notebook").click();
      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Visualize").click();
      cy.get(".ScalarValue");
      cy.findByText("18,760").should("not.exist");
      cy.findByText("10");
    });

    it("should be sandboxed with a filter (on a saved JOINed question)", () => {
      cy.visit("/question/5");

      cy.wait(2000)
        .get(".TableInteractive-cellWrapper--firstColumn")
        .should("have.length", 11);
    });

    it("should be sandbox with a filter (after applying a filter to a JOINed question)", () => {
      cy.visit("/question/5");

      // Notebook filter
      cy.get(".Icon-notebook").click();
      cy.wait(2000)
        .findByText("Filter")
        .click();
      cy.findAllByText("Total")
        .last()
        .click();
      cy.findByText("Equal to").click();
      cy.findByText("Greater than").click();
      cy.findByPlaceholderText("Enter a number").type("100");
      cy.findByText("Add filter").click();
      cy.findByText("Visualize").click();
      cy.wait(2000)
        .get(".TableInteractive-cellWrapper--firstColumn")
        .should("have.length", 7);
    });

    it("should filter categories on saved SQL question (for a new question - column number)", () => {
      cy.visit("/question/new?database=1&table=3");
      cy.get(".TableInteractive-cellWrapper--firstColumn").should(
        "have.length",
        2,
      );
    });

    it("should filter categories on saved SQL question (for a new question - row number)", () => {
      cy.visit("/question/new?database=1&table=3");
      cy.get(".TableInteractive-headerCellData").should("have.length", 4);
    });
  });

  describe("Sandboxing reproductions", () => {
    beforeEach(() => {
      restore();
      signInAsAdmin();
      createUser(sandboxed_user).then(({ body: { id: USER_ID } }) => {
        // dismiss the "it's ok to play around" modal
        cy.request("PUT", `/api/user/${USER_ID}/qbnewb`, {});
      });
    });

    it.skip("SB question with `case` CC should substitue the `else` argument's table (metabase-enterprise#548)", () => {
      const QUESTION_NAME = "EE_548";
      const CC_NAME = "CC_548"; // Custom column
      const COLLECTION_GROUP_ID = 4;

      withSampleDataset(({ ORDERS, ORDERS_ID }) => {
        cy.log("**-- 1. Sandbox `Orders` table on `user_id` attribute --**");

        cy.request("POST", "/api/mt/gtap", {
          attribute_remappings: {
            user_id: ["dimension", ["field-id", ORDERS.USER_ID]],
          },
          card_id: null,
          group_id: COLLECTION_GROUP_ID,
          table_id: ORDERS_ID,
        });

        /**
         * As per definition for `PUT /graph` from `permissions.clj`:
         *
         * This should return the same graph, in the same format,
         * that you got from `GET /api/permissions/graph`, with any changes made in the wherever necessary.
         * This modified graph must correspond to the `PermissionsGraph` schema.
         *
         * That's why we must chain GET and PUT requests one after the other.
         */

        cy.log("**-- 2. Fetch permissions graph --**");

        cy.request("GET", "/api/permissions/graph", {}).then(
          ({ body: { groups, revision } }) => {
            // Update permissions for `collections` group [id: 4]
            // This mutates the original `groups` object => we'll pass it next to the `PUT` request
            groups[COLLECTION_GROUP_ID] = {
              1: {
                schemas: {
                  PUBLIC: {
                    [ORDERS_ID]: { query: "segmented", read: "all" },
                  },
                },
              },
            };

            cy.log("**-- 3. Update/save permissions --**");

            cy.request("PUT", "/api/permissions/graph", {
              groups,
              revision,
            });
          },
        );

        cy.log("**-- 4. Create and save a question --**");

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

          cy.log("**-- Logging in as sandboxed user --**");
          cy.request("POST", "/api/session", {
            username: sandboxed_user.email,
            password: sandboxed_user.password,
          });

          cy.server();
          cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

          // Assertion phase starts here
          cy.visit(`/question/${QUESTION_ID}`);
          cy.findByText(QUESTION_NAME);

          cy.log("**Reported failing since v1.36.4**");
          cy.wait("@cardQuery").then(xhr => {
            expect(xhr.response.body.error).to.not.exist;
          });

          cy.findByText(CC_NAME);
        });
      });
    });

    it.skip("Should allow drill-through for sandboxed user (metabase-enterprise#535)", () => {
      cy.visit("/");

      cy.get(".Icon-gear")
        .first()
        .click();
      cy.findByText("Admin").click();
      cy.findByText("Permissions").click();
      cy.findByText("View tables").click();

      /**
       * Give sandboxed access for Orders (first x)
       * 
       |          | All users | collection |
       |----------|-----------|------------|
       | Orders   |     x     |      x     |
       | People   |     x     |      x     |
       | Products |     x     |      x     |
       | Reviews  |     x     |      x     |
       */
      cy.get(".Icon-close")
        .eq(0)
        .click();
      cy.findByText("Grant sandboxed access").click();
      cy.findByText("Change").click();
      cy.findByText("Pick a column").click();
      cy.findByText("User ID").click();
      cy.findByText("Pick a user attribute").click();
      cy.findByText("user_id").click();
      cy.findByText("Save").click();

      /**
       * Give unrestricted access for Products (fourth x)
       * 
       |          | All users | collection |
       |----------|-----------|------------|
       | Orders   |     s     |      x     |
       | People   |     x     |      x     |
       | Products |     x     |      x     |
       | Reviews  |     x     |      x     |
       */
      cy.get(".Icon-close")
        .eq(3)
        .click();
      cy.findByText("Grant unrestricted access").click();
      cy.findByText("Save Changes").click();

      // Save all changes to permissions
      cy.get(".Modal").within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Yes").click();
      });

      // Go straight to orders table in custom questions
      cy.visit("/question/new?database=1&table=2&mode=notebook");

      // Orders join Products, Count by Category
      cy.get(".Icon-join_left_outer").click();
      popover().within(() => cy.findByText("Products").click());
      cy.findByText("Summarize").click();
      popover().within(() => cy.findByText("Count of rows").click());
      cy.findByText("Pick a column to group by").click();
      popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Category").click();
      });

      const questionTitle = "Question 1";
      // Save question,
      cy.findByText("Save").click();
      cy.findByLabelText("Name")
        .clear() // clear pre-populated name,
        .type(questionTitle);
      cy.get(".Modal").within(() => {
        cy.findByText("Save").click();
      });
      // and don't save it to a dashboard
      cy.findByText("Not now").click();

      signOut();

      // Sign in as newly created sandboxed_user ("User 1")
      cy.visit("/");
      cy.findByLabelText("Email address").type(sandboxed_user.email);
      cy.findByLabelText("Password").type(sandboxed_user.password);
      cy.findByText("Sign in").click();

      // Find saved question in "Our analytics"
      cy.findByText("Browse all items").click();
      cy.findByText(questionTitle).click();

      // The question is originally displayed as table
      // Set its visualization/graph to "Bar"
      cy.findByText("Visualization").click();
      cy.get(".Icon-bar").click();
      cy.findByText("Done").click();
      cy.get(".Visualization").within(() => {
        // and click on any of the 4 bars in the graph
        cy.get(".bar")
          .eq(0) // there is no special reason we chose the first one
          .click({ force: true });
      });
      cy.server();
      cy.route("POST", "/api/dataset").as("view-dataset");
      popover().within(() => cy.findByText("View these Orders").click());
      cy.wait("@view-dataset");

      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
    });
  });
});
