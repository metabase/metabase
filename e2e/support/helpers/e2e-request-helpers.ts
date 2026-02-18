/**
 * Some XHR requests might be called but cancelled shortly after.
 * In case you wouldn't like to count these, use this helper:
 *
 *
 * const { interceptor, spy } = spyRequestFinished("name")
 * cy.intercept(
 *              "POST",
 *              "/api/dashboard/",
 *              interceptor,
 * )
 *
 * AND use cypress's should
 *
 * cy.get("@name").should("have.callCount", 2)
 *
 * OR sinon's should directly
 *
 * cy.get("@dashcardRequestSpy").should(spy => {
 *
 *    expect(spy.getCalls().length).to.eq(2);
 * });
 */
export function spyRequestFinished(name = "requestFinishedSpy") {
  const spy = cy.spy().as(name);
  return {
    interceptor: (req: any) => req.continue((res: any) => spy(req, res)),
    spy,
  };
}

const WAIT_TIMEOUT = 10000;
const WAIT_INTERVAL = 100;

export function retryRequest<T>(
  callback: () => Cypress.Chainable<T>,
  condition: (result: T) => boolean,
  timeout = WAIT_TIMEOUT,
): Cypress.Chainable<T> {
  return callback().then((result) => {
    if (condition(result)) {
      return cy.wrap(result);
    } else if (timeout > 0) {
      cy.wait(WAIT_INTERVAL);
      return retryRequest(callback, condition, timeout - WAIT_INTERVAL);
    } else {
      throw new Error("Retry timeout");
    }
  });
}
