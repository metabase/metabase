/**
 * Helps to select specific notebook steps like filters, joins, break outs, etc.
 *
 * Details:
 * https://github.com/metabase/metabase/pull/17708#discussion_r700082403
 *
 * @param {string} type — notebook step type (filter, join, expression, summarize, etc.)
 * @param {{stage: number; index: number}} positionConfig - indexes specifying step's position
 * @returns
 */
export function getNotebookStep(type, { stage = 0, index = 0 } = {}) {
  return cy.findByTestId(`step-${type}-${stage}-${index}`);
}
