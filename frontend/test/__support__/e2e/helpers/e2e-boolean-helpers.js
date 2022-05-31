// until we have a test dataset that includes boolean data, we can use this questions to test booleans
const BOOLEAN_QUERY =
  'select 0::integer as "integer", true::boolean AS "boolean" union all \nselect 1::integer as "integer", false::boolean AS "boolean" union all \nselect null as "integer", true::boolean AS "boolean" union all \nselect -1::integer as "integer", null AS "boolean"';

export const setupBooleanQuery = () => {
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.createNativeQuestion(
    {
      name: "16386",
      native: {
        query: BOOLEAN_QUERY,
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
};
