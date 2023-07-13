/**
 * Make sure you have the ldap test server running locally:
 * `docker run -p 389:389 osixia/openldap:1.5.0`
 */
export const setupLdap = () => {
  cy.log("Set up LDAP mock server");

  cy.request("PUT", "/api/ldap/settings", {
    "ldap-enabled": true,
    "ldap-host": "localhost",
    "ldap-port": "389",
    "ldap-bind-dn": "cn=admin,dc=example,dc=org",
    "ldap-password": "adminpass",
    "ldap-user-base": "ou=users,dc=example,dc=org",
    "ldap-attribute-email": "uid",
    "ldap-attribute-firstname": "sn",
    "ldap-attribute-lastname": "sn",
  });
};
