import { USER_GROUPS, SAMPLE_DB_TABLES } from "e2e/support/cypress_data";

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

const { COLLECTION_GROUP } = USER_GROUPS;

Cypress.Commands.add(
  "sandboxTable",
  ({
    attribute_remappings = {},
    card_id = null,
    group_id = COLLECTION_GROUP,
    table_id = STATIC_ORDERS_ID,
  } = {}) => {
    // Extract the name of the table, as well as `schema` and `db_id` that we'll need later on for `cy.updatePermissionsSchemas()`
    cy.request("GET", "/api/table").then(({ body: tables }) => {
      const { name, schema, db_id } = tables.find(
        table => table.id === table_id,
      );
      const attr = Object.keys(attribute_remappings).join(", "); // Account for the possiblity of passing multiple user attributes

      cy.log(`Sandbox "${name}" table on "${attr}"`);
      cy.updatePermissionsGraph({
        [group_id]: {
          [db_id]: {
            "view-data": {
              [schema]: {
                [table_id]: "sandboxed",
              },
            },
            "create-queries": "query-builder",
          },
        },
      });
      cy.request("POST", "/api/mt/gtap", {
        attribute_remappings,
        card_id,
        group_id,
        table_id,
      });
    });
  },
);
