/**
 * Make sure you have ldap mock server running locally:
 * `docker run -p 3004:3004 -v $PWD/test_resources/ldap/conf.json:/srv/ldap-server-mock-conf.json -v $PWD/test_resources/ldap/users.json:/srv/ldap-server-mock-users.json thoteam/ldap-server-mock`
 * or
 * `npx ldap-server-mock --conf=./test_resources/ldap/conf.json --database=./test_resources/ldap/users.json`
 */
export const setupLDAP = () => {
  cy.log("Set up LDAP mock server");

  cy.request("PUT", "/api/ldap/settings", {
    "ldap-host": "localhost",
    "ldap-port": "3004",
    "ldap-user-base": "dc=test",
    "ldap-attribute-firstname": "givenname",
    "ldap-group-base": "dc=test",
  });
};
