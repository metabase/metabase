export function expectedRouteCalls({ route_alias, calls } = {}) {
  const requestsCount = alias =>
    cy.state("requests").filter(req => req.alias === alias);
  // It is hard and unreliable to assert that something didn't happen in Cypress
  // This solution was the only one that worked out of all others proposed in this SO topic: https://stackoverflow.com/a/59302542/8815185
  cy.get("@" + route_alias).then(() => {
    expect(requestsCount(route_alias)).to.have.length(calls);
  });
}
