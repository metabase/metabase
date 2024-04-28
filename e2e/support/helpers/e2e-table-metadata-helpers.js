export const createMetric = ({
  name,
  table_id,
  definition,
  description = null,
}) => {
  cy.log(`Create a metric: ${name}`);
  return cy.request("POST", "/api/legacy-metric", {
    name,
    description,
    table_id,
    definition,
  });
};

export const createSegment = ({
  name,
  table_id,
  definition,
  description = null,
}) => {
  cy.log(`Create a segment: ${name}`);
  return cy.request("POST", "/api/segment", {
    name,
    description,
    table_id,
    definition,
  });
};
