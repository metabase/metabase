---
title: "Metabase config file template"
---

# Metabase config file template

You can generate this doc page by changing into the top-level Metabase directory and running:

```
clojure -M:doc:ee config-template
```

The template lists example `database`, `user`, and `settings` sections for the [config file](./config-file.md).


```yaml
# A config file template for Metabase.
# You'll need to update (or remove) the `users` and `databases` sections.
# The settings in `settings` include default values. We recommend removing
# or commenting out settings that you don't set.
# To use an env var, you can use a template string: "{{ env YOUR_ENV_VAR }}"
# Note the quote marks wrapping the env var template.
# For more on the configuration file, see:
# https://www.metabase.com/docs/latest/configuring-metabase/config-file
# For more on what each setting does, check out:
# https://www.metabase.com/docs/latest/configuring-metabase/environment-variables
version: 1
config:
  users:
  - first_name: First
    last_name: Person
    password: metabot1
    email: first@example.com
  - first_name: Normal
    last_name: Person
    password: metabot1
    email: normal@example.com
  - first_name: Admin
    last_name: Person
    password: metabot1
    is_superuser: true
    email: admin@example.com
  databases:
  - name: Sample PostgreSQL
    engine: postgres
    details:
      host: postgres-data
      port: 5432
      user: metabase
      password: metasample123
      dbname: sample
  - name: Sample MySQL
    engine: mysql
    details:
      host: mysql-data
      port: 3306
      user: metabase
      password: metasample123
      dbname: sample
  api-keys:
  - name: Admin API key
    group: admin
    creator: first@example.com
    key: mb_firsttestapikey123
  - name: All Users API key
    group: all-users
    creator: first@example.com
    key: mb_secondtestapikey456
  settings:
    admin-email: null
    aggregated-query-row-limit: null
    allowed-iframe-hosts: |-
      youtube.com,
      youtu.be,
      loom.com,
      vimeo.com,
      docs.google.com,
      calendar.google.com,
      airtable.com,
      typeform.com,
      canva.com,
      codepen.io,
      figma.com,
      grafana.com,
      miro.com,
      excalidraw.com,
      notion.com,
      atlassian.com,
      trello.com,
      asana.com,
      gist.github.com,
      linkedin.com,
      twitter.com,
      x.com
    anon-tracking-enabled: true
    api-key: null
    application-colors: {}
    application-favicon-url: app/assets/img/favicon.ico
    application-font: Lato
    application-font-files: null
    application-logo-url: app/assets/img/logo.svg
    application-name: Metabase
    attachment-row-limit: null
    attachment-table-row-limit: 20
    audit-max-retention-days: null
    bcc-enabled: true
    breakout-bin-width: 10.0
    breakout-bins-num: 8
    check-for-updates: true
    config-from-file-sync-databases: true
    custom-formatting: {}
    custom-geojson: null
    custom-geojson-enabled: true
    custom-homepage: false
    custom-homepage-dashboard: null
    dashboards-save-last-used-parameters: true
    db-connection-timeout-ms: 10000
    db-query-timeout-minutes: 20
    default-maps-enabled: true
    download-row-limit: null
    email-from-address: notifications@metabase.com
    email-from-address-override: notifications@metabase.com
    email-from-name: null
    email-max-recipients-per-second: null
    email-reply-to: null
    email-smtp-host: null
    email-smtp-host-override: null
    email-smtp-password: null
    email-smtp-password-override: null
    email-smtp-port: null
    email-smtp-port-override: null
    email-smtp-security: none
    email-smtp-security-override: ssl
    email-smtp-username: null
    email-smtp-username-override: null
    embedding-app-origins-interactive: null
    embedding-app-origins-sdk: ""
    embedding-homepage: hidden
    embedding-secret-key: null
    enable-embedding-interactive: false
    enable-embedding-sdk: false
    enable-embedding-simple: false
    enable-embedding-static: false
    enable-password-login: true
    enable-pivoted-exports: true
    enable-public-sharing: true
    enable-query-caching: true
    enable-xrays: true
    follow-up-email-sent: false
    google-auth-auto-create-accounts-domain: null
    google-auth-client-id: null
    google-auth-enabled: null
    gsheets: null
    health-check-logging-enabled: true
    help-link: metabase
    help-link-custom-destination: https://www.metabase.com/help/premium
    http-channel-host-strategy: external-only
    humanization-strategy: simple
    index-update-thread-count: 2
    install-analytics-database: true
    jdbc-data-warehouse-max-connection-pool-size: 15
    jwt-attribute-email: email
    jwt-attribute-firstname: first_name
    jwt-attribute-groups: groups
    jwt-attribute-lastname: last_name
    jwt-enabled: false
    jwt-group-mappings: {}
    jwt-group-sync: false
    jwt-identity-provider-uri: null
    jwt-shared-secret: null
    jwt-user-provisioning-enabled: true
    landing-page: ''
    landing-page-illustration: default
    landing-page-illustration-custom: null
    ldap-attribute-email: mail
    ldap-attribute-firstname: givenName
    ldap-attribute-lastname: sn
    ldap-bind-dn: null
    ldap-enabled: false
    ldap-group-base: null
    ldap-group-mappings: {}
    ldap-group-membership-filter: (member={dn})
    ldap-group-sync: false
    ldap-host: null
    ldap-password: null
    ldap-port: 389
    ldap-security: none
    ldap-sync-user-attributes: true
    ldap-sync-user-attributes-blacklist: userPassword,dn,distinguishedName
    ldap-user-base: null
    ldap-user-filter: (&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))
    ldap-user-provisioning-enabled: true
    license-token-missing-banner-dismissal-timestamp: []
    load-analytics-content: true
    loading-message: doing-science
    login-page-illustration: default
    login-page-illustration-custom: null
    map-tile-server-url: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
    native-query-autocomplete-match-style: substring
    nested-field-columns-value-length-limit: 50000
    no-data-illustration: default
    no-data-illustration-custom: null
    no-object-illustration: default
    no-object-illustration-custom: null
    non-table-chart-generated: false
    not-behind-proxy: false
    notification-link-base-url: null
    notification-system-event-thread-pool-size: 5
    notification-thread-pool-size: 3
    persisted-model-refresh-cron-schedule: 0 0 0/6 * * ? *
    persisted-models-enabled: false
    premium-embedding-token: null
    query-caching-max-kb: 2000
    query-caching-max-ttl: 3024000.0
    redirect-all-requests-to-https: false
    report-timezone: null
    reset-token-ttl-hours: 48
    retry-initial-interval: 500
    retry-max-attempts: 7
    retry-max-interval-millis: 30000
    retry-multiplier: 2.0
    retry-randomization-factor: 0.1
    saml-application-name: Metabase
    saml-attribute-email: null
    saml-attribute-firstname: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname
    saml-attribute-group: null
    saml-attribute-lastname: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname
    saml-enabled: false
    saml-group-mappings: {}
    saml-group-sync: false
    saml-identity-provider-certificate: null
    saml-identity-provider-issuer: null
    saml-identity-provider-slo-uri: null
    saml-identity-provider-uri: null
    saml-keystore-alias: null
    saml-keystore-password: changeit
    saml-keystore-path: null
    saml-slo-enabled: false
    saml-user-provisioning-enabled: true
    scim-enabled: null
    sdk-encryption-validation-key: null
    search-language: null
    search-typeahead-enabled: true
    send-email-on-first-login-from-new-device: true
    send-new-sso-user-admin-email: null
    session-cookie-samesite: lax
    session-cookies: null
    session-timeout: null
    setup-embedding-autoenabled: false
    setup-license-active-at-setup: false
    show-database-syncing-modal: null
    show-google-sheets-integration: null
    show-homepage-data: true
    show-homepage-xrays: true
    show-metabase-links: true
    show-static-embed-terms: true
    site-locale: en
    site-name: Metabase
    site-url: null
    slack-app-token: null
    slack-bug-report-channel: metabase-bugs
    smtp-override-enabled: false
    source-address-header: X-Forwarded-For
    sql-jdbc-fetch-size: 500
    ssh-heartbeat-interval-sec: 180
    start-of-week: sunday
    subscription-allowed-domains: null
    surveys-enabled: true
    sync-leaf-fields-limit: 1000
    synchronous-batch-updates: false
    unaggregated-query-row-limit: null
    uploads-settings: null
    use-tenants: false
    user-visibility: all
```
