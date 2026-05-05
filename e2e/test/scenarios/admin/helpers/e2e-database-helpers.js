/**
 * Visit a database and immediately wait for the related request.
 * You can assert on the response of `GET /api/database/:id`.
 * @param {number} id - Id of the database we're about to visit.
 *
 * @example
 * visitDatabase(3)
 *
 * @example
 * visitDatabase(42).then(({response: { body }})=> {
 *  expect(body.id).to.equal(42);
 * })
 */
export function visitDatabase(id) {
  cy.intercept("GET", `/api/database/${id}`).as("loadDatabase");
  cy.visit(`/admin/databases/${id}`);
  return cy.wait("@loadDatabase");
}

// we need to check for an indefinite number of these requests because we don't know how many polls it's going to take
export function waitForDbSync(maxRetries = 10) {
  if (maxRetries === 0) {
    throw new Error("Timed out waiting for database sync");
  }
  cy.wait("@getDatabases").then(({ response }) => {
    if (
      response.body.data.some((db) => db.initial_sync_status !== "complete")
    ) {
      waitForDbSync(maxRetries - 1);
    }
  });
}
