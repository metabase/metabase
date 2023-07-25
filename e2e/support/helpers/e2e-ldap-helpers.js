/**
  Make sure you have the ldap test server running locally:
    docker run -p 389:389 \
      --env LDAP_ADMIN_PASSWORD=adminpass \
      --env LDAP_USERS=user01@example.org,user02@example.org \
      --env LDAP_PASSWORDS=123456,123465 \
      --env LDAP_ROOT=dc=example,dc=org \
      --env LDAP_PORT_NUMBER=389 \
      bitnami/openldap:2.6.4
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
