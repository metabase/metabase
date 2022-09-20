/**
 * Make sure you have ldap mock server running locally:
 * `docker run -p 3004:3004 thoteam/ldap-server-mock`
 * or
 * `npx ldap-server-mock --conf=./test_resources/ldap/conf.json --database=./test_resources/ldap/users.json`
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
