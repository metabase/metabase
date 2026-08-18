/**
 * @param {object} segment
 * @param {string} segment.name
 * @param {TableId} segment.table_id
 * @param {string|null} [segment.description]
 * @param {object} segment.definition - a filter-only query in either legacy MBQL or MBQL 5 form; the
 *   API accepts both and normalizes to MBQL 5 on save, so fixtures written in either form keep working
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
