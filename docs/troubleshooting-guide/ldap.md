### LDAP sample configuration

In case you are running an LDAP server with an admin user of `admin` and a password like `adminpassword`, a root node of LDAP tree like `dc=example,dc=org` (example.org), user organizational unit like `users` and user group like `readers`, the configuration you need to include in Metabase is the following:

USERNAME OR DN: `cn=admin,dc=example,dc=org`
PASSWORD: `adminpassword`
USER SEARCH BASE: `ou=users,dc=example,dc=org`
USER FILTER: `(&(objectClass=inetOrgPerson)(|(uid={login})))` // could be left with the default value which will look for the user id both in the uid or email field
GROUP SEARCH BASE: `cn=readers`

### Related software for troubleshooting

If you run into an issue, check that you can login and use your LDAP directory with a software like [Apache Directory Studio](https://directory.apache.org/studio/). You can use Directory Studio to see the whole LDAP tree and view the logs of your LDAP application to see the queries run.

### Current limitations

Metabase will populate the user profile with the name and surname a user has on LDAP on the first login. In case the user changes the name on the directory, it won't be automatically updated on Metabase.

### Sample docker-compose file for LDAP

You can use this docker-compose.yml snippet to start a stack of Metabase + Open LDAP to test the functionality

```
version: '3.7'
services:
  metabase-ldap:
    image: metabase/metabase:latest
    container_name: metabase-ldap
    hostname: metabase-ldap
    volumes: 
    - /dev/urandom:/dev/random:ro
    ports:
      - 3000:3000
    networks:
      - metanet1
  openldap:
    image: bitnami/openldap:2.4.57
    hostname: openldap
    container_name: openldap
    ports:
      - 1389:1389
    environment:
      - LDAP_ADMIN_USERNAME=admin
      - LDAP_ADMIN_PASSWORD=adminpassword
      - LDAP_USERS=user01@metabase.com,user02@theawfulcompetition.com
      - LDAP_PASSWORDS=Password1!,password2!
      - LDAP_PORT_NUMBER=1389
      - LDAP_ROOT=dc=example,dc=org
      - LDAP_USER_DC=users
      - LDAP_GROUP=readers
    networks:
      - metanet1
networks: 
  metanet1:
    driver: bridge
```
