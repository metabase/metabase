/**
 * Make sure you have the ldap test server running locally:
 * `docker run -p 389:389 osixia/openldap:1.5.0`
 */
export const setupLdap = ({ enabled = true } = {}) => {
  cy.log("Set up LDAP mock server");

  cy.request("PUT", "/api/ldap/settings", {
    "ldap-enabled": enabled,
    "ldap-host": "localhost",
    "ldap-port": "389",
    "ldap-bind-dn": "cn=admin,dc=example,dc=org",
    "ldap-password": "admin",
    "ldap-user-base": "dc=example,dc=org",
  });
};
