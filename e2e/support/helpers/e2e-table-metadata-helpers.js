/**
 * @param {object} segment
 * @param {string} segment.name
 * @param {TableId} segment.table_id
 * @param {string|null} [segment.description]
 * @param {object} segment.definition
 */
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

export const createMetric = ({
  name,
  table_id,
  definition,
  description = null,
}) => {
  cy.log(`Create a metric: ${name}`);
  // This endpoint doesn't exist anymore, but we need this helper for cross-version tests
  return cy.request("POST", "/api/metric", {
    name,
    description,
    table_id,
    definition,
  });
};
