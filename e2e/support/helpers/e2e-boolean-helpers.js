import { H2_SAMPLE_DB_ID } from "../cypress_data";

import { createNativeQuestion } from "./api";

// The SQLite sample DB has no native boolean type and rejects the `::boolean`
// casts below, so this runs against the H2 sample DB. Callers must first
// restore the "default-with-h2" snapshot.
export function setupBooleanQuery(questionName = "Boolean Query") {
  cy.intercept("POST", "/api/dataset").as("dataset");

  createNativeQuestion(
    {
      name: questionName,
      database: H2_SAMPLE_DB_ID,
      native: {
        query: BOOLEAN_QUERY,
        "template-tags": {},
      },
      visualization_settings: {
        "table.pivot_column": "boolean",
        "table.cell_column": "integer",
      },
    },
    { visitQuestion: true },
  );

  cy.findByText("Explore results").click();
  cy.wait("@dataset");
}

const BOOLEAN_QUERY =
  'select 0::integer as "integer", true::boolean AS "boolean" union all \nselect 1::integer as "integer", false::boolean AS "boolean" union all \nselect null as "integer", true::boolean AS "boolean" union all \nselect -1::integer as "integer", null AS "boolean"';
