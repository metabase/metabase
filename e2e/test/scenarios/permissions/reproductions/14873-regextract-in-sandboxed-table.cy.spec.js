import {
  restore,
  withDatabase,
  describeEE,
  visitQuestion,
} from "e2e/support/helpers";
import { USER_GROUPS } from "e2e/support/cypress_data";

const PG_DB_ID = 2;

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describeEE("postgres > user > query", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    // Update basic permissions (the same starting "state" as we have for the "Sample Database")
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [PG_DB_ID]: { data: { schemas: "none", native: "none" } },
      },
      [DATA_GROUP]: {
        [PG_DB_ID]: { data: { schemas: "all", native: "write" } },
      },
      [COLLECTION_GROUP]: {
        [PG_DB_ID]: { data: { schemas: "none", native: "none" } },
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
      });
    });
  });
});
