export const createMetric = ({ name, description, table_id, field_id }) => {
  cy.log(`Create a metric: ${name}`);
  return cy.request("POST", "/api/metric", {
    name,
    description,
    table_id,
    field_id,
  });
};

export const createSegment = ({ name, description, table_id, field_id }) => {
  cy.log(`Create a segment: ${name}`);
  return cy.request("POST", "/api/segment", {
    name,
    description,
    table_id,
    field_id,
  });
};
