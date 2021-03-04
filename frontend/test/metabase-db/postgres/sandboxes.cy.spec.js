import {
  signInAsAdmin,
  signOut,
  restore,
  addPostgresDatabase,
  withDatabase,
  USER_GROUPS,
  describeWithToken,
} from "__support__/cypress";

const PG_DB_NAME = "QA Postgres12";
const PG_DB_ID = 2;

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

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

function createUser(user) {
  return cy.request("POST", "/api/user", user);
}

describeWithToken("postgres > user > query", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    addPostgresDatabase(PG_DB_NAME);
    createUser(sandboxed_user).then(({ body: { id: USER_ID } }) => {
      cy.log("Dismiss `it's ok to play around` modal for new users");
      cy.request("PUT", `/api/user/${USER_ID}/qbnewb`, {});
    });
    // Update basic permissions (the same starting "state" as we have for the "Sample Dataset")
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [PG_DB_ID]: { schemas: "none", native: "none" },
      },
      [DATA_GROUP]: { [PG_DB_ID]: { schemas: "all", native: "write" } },
      [COLLECTION_GROUP]: {
        [PG_DB_ID]: { schemas: "none", native: "none" },
      },
    });
  });

  it("should handle the use of `regexextract` in a sandboxed table (metabase#14873)", () => {
    const CC_NAME = "Firstname";
    // We need ultra-wide screen to avoid scrolling (custom column is rendered at the last position)
    cy.viewport(2200, 1200);

    cy.server();
    cy.route("POST", "/api/dataset/pivot").as("pivotDataset");

    withDatabase(PG_DB_ID, ({ PEOPLE, PEOPLE_ID }) => {
      cy.log("Create question with custom column");
      cy.request("POST", "/api/card", {
        name: "14873",
        dataset_query: {
          type: "query",
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
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        cy.log("Sandbox `People` table");
        cy.request("POST", "/api/mt/gtap", {
          attribute_remappings: {
            user_id: ["dimension", ["field-id", PEOPLE.ID]],
          },
          card_id: null,
          table_id: PEOPLE_ID,
          group_id: COLLECTION_GROUP,
        });

        cy.updatePermissionsSchemas({
          database_id: PG_DB_ID,
          schemas: {
            public: {
              [PEOPLE_ID]: { query: "segmented", read: "all" },
            },
          },
        });

        signOut();
        signInAsSandboxedUser();
        cy.visit(`/question/${QUESTION_ID}`);

        cy.wait("@cardQuery").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });

        cy.findByText(CC_NAME);
        cy.findByText(/^Hudson$/);
      });
    });
  });
});

function signInAsSandboxedUser() {
  cy.log("Logging in as sandboxed user");
  cy.request("POST", "/api/session", {
    username: sandboxed_user.email,
    password: sandboxed_user.password,
  });
}
