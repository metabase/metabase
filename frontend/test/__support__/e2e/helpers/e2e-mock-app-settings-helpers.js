function mockProperty(propertyOrObject, value, url) {
  cy.intercept("GET", url, req => {
    req.reply(res => {
      if (typeof propertyOrObject === "object") {
        Object.assign(res.body, propertyOrObject);
      }
      {
        res.body[propertyOrObject] = value;
      }
    });
  });
}

export function mockSessionProperty(propertyOrObject, value) {
  mockProperty(propertyOrObject, value, "/api/session/properties");
}

export function mockCurrentUserProperty(propertyOrObject, value) {
  mockProperty(propertyOrObject, value, "/api/user/current");
}
