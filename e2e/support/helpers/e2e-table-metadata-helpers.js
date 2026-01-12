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

/**
 * @param {object} measure
 * @param {string} measure.name
 * @param {TableId} measure.table_id
 * @param {string|null} [measure.description]
 * @param {object} measure.definition
 */
export const createMeasure = ({
  name,
  table_id,
  definition,
  description = null,
}) => {
  cy.log(`Create a measure: ${name}`);
  return cy.request("POST", "/api/measure", {
    name,
    description,
    table_id,
    definition,
  });
};

/**
 * @param {object} measure
 * @param {MeasureId} measure.id
 * @param {string} [measure.name]
 * @param {TableId} [measure.table_id]
 * @param {string|null} [measure.description]
 * @param {object} [measure.definition]
 * @param {object} [options]
 * @param {string|null} [options.revision_message]
 */
export const updateMeasure = (
  { id, name, table_id, definition, description = null },
  { revision_message = "Update measure" } = {},
) => {
  cy.log(`Update a measure: ${id}`);
  return cy.request("PUT", `/api/measure/${id}`, {
    name,
    description,
    table_id,
    definition,
    revision_message,
  });
};
