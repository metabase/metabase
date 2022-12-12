---
title: LDAP
---

# LDAP

Metabase can use LDAP for authentication. [This article][ldap-learn] explains how to set it up, and the guide below will help you troubleshoot if anything goes wrong. If your problem isn't specific to LDAP, go to [our troubleshooting guide for logging in](./cant-log-in.md).

## LDAP sample configuration

You can test Metabase with LDAP by using this `docker-compose` definition:

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
    environment:
      - "MB_LDAP_BIND_DN=cn=admin,dc=example,dc=org"
      - "MB_LDAP_ENABLED=true"
      - "MB_LDAP_GROUP_BASE=cn=readers"
      - "MB_LDAP_HOST=openldap"
      - "MB_LDAP_PASSWORD=adminpassword"
      - "MB_LDAP_PORT=1389"
      - "MB_LDAP_USER_BASE=ou=users,dc=example,dc=org"
      - "MB_LDAP_ATTRIBUTE_EMAIL=uid"
      # We are using the same field for email and first name, just for this example to work without modifications to the LDAP objects
      - "MB_LDAP_ATTRIBUTE_FIRSTNAME=uid"
      - "MB_LDAP_ATTRIBUTE_LASTNAME=sn"
  openldap:
    image: bitnami/openldap:2.4.57
    hostname: openldap
    container_name: openldap
    ports:
      - 1389:1389
    environment:
      - LDAP_ADMIN_USERNAME=admin
      - LDAP_ADMIN_PASSWORD=adminpassword
      - LDAP_USERS=user01@metabase.com,user02@metabase.com
      - LDAP_PASSWORDS=password1!,password2!
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

If you don't pass environment variables to Metabase and you want to configure the environment manually, you can go to the Admin Panel, selectin "Settings", select "Authentication", and then select "LDAP Configuration" and enter the following values:

- `USERNAME OR DN`: `cn=admin,dc=example,dc=org`
- `PASSWORD`: `adminpassword`
- `USER SEARCH BASE`: `ou=users,dc=example,dc=org`
- `USER FILTER`: `(&(objectClass=inetOrgPerson)(|(uid={login})))`
- `GROUP SEARCH BASE`: `cn=readers`

For the `USER FILTER`, you can leave the default value, which will look for the user ID in both the `uid` or `email` field.

## Related software for troubleshooting

If you run into an issue, check that you can login to your LDAP directory and issue queries using software like [Apache Directory Studio][apache-directory-studio]. It will let you see the whole LDAP tree and view the logs of your LDAP application to see queries run.

<h2 id="current-limitations">Current limitations</h2>

- When using Metabase Enterprise with a MySQL database and LDAP enabled, make sure that you disable synchronization of binary fields from your LDAP directory by using the `MB_LDAP_SYNC_USER_ATTRIBUTES_BLACKLIST` environment variable. If you do not, you may hit the 60K field size limitation of the text field in MySQL, which will prevent you from creating users or those users from logging in.

[apache-directory-studio]: https://directory.apache.org/studio/
[ldap-learn]: https://www.metabase.com/learn/permissions/ldap-auth-access-control.html
[ldap-docs]: ../people-and-groups/google-and-ldap.md#enabling-ldap-authentication

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
