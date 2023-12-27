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
    interceptor: req => req.continue(res => spy(req, res)),
    spy,
  };
}

/**
 * When you need to postpone a response (to check for loading spinners or alike),
 * use this:
 *
 * `cy.intercept('POST', path, delayResponse(1000)).as('delayed')`
 *
 * `cy.wait('@delayed')` - you'll have 1000 ms until this resolves
 */
export function delayResponse(delayMs) {
  return function (req) {
    req.on("response", res => {
      res.setDelay(delayMs);
    });
  };
}
