---
title: "Metabase config file template"
---

# Metabase config file template

You can generate the following config file template by changing into the top-level Metabase directory and running:

```
clojure -M:doc:ee config-template
```

The template lists example `database`, `user`, and `settings` sections for the [config file](./config-file.md).


```yaml
# A config file template for Metabase.
# You'll need to update (or remove) the `users` and `databases` sections.
# The settings in `settings` include default values. We recommend removing
# or commenting out settings that you don't set.
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
    attachment-table-row-limit: 20
    bcc-enabled: true
    breakout-bin-width: 10.0
    breakout-bins-num: 8
    check-for-updates: true
    config-from-file-sync-databases: true
    custom-formatting: {}
    custom-geojson: null
    custom-homepage: false
    custom-homepage-dashboard: null
    db-connection-timeout-ms: 10000
    db-query-timeout-minutes: 20
    download-row-limit: null
    ee-ai-features-enabled: false
    ee-openai-api-key: null
    ee-openai-model: gpt-4-turbo-preview
    email-from-address: notifications@metabase.com
    email-from-name: null
    email-max-recipients-per-second: null
    email-reply-to: null
    email-smtp-host: null
    email-smtp-password: null
    email-smtp-port: null
    email-smtp-security: none
    email-smtp-username: null
    embedding-app-origins-interactive: null
    embedding-app-origins-sdk: localhost:*
    embedding-homepage: hidden
    embedding-secret-key: null
    enable-embedding-interactive: false
    enable-embedding-sdk: false
    enable-embedding-static: false
    enable-password-login: true
    enable-pivoted-exports: true
    enable-public-sharing: true
    enable-query-caching: true
    enable-xrays: true
    enum-cardinality-threshold: 60
    follow-up-email-sent: false
    google-auth-auto-create-accounts-domain: null
    google-auth-client-id: null
    google-auth-enabled: null
    health-check-logging-enabled: true
    help-link: metabase
    help-link-custom-destination: https://www.metabase.com/help/premium
    humanization-strategy: simple
    is-metabot-enabled: false
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
    loading-message: doing-science
    login-page-illustration: default
    login-page-illustration-custom: null
    map-tile-server-url: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
    metabot-default-embedding-model: text-embedding-ada-002
    metabot-feedback-url: https://amtix3l3qvitb2qxstaqtcoqby0monuf.lambda-url.us-east-1.on.aws/
    metabot-get-prompt-templates-url: https://stkxezsr2kcnkhusi3fgcc5nqm0ttgfx.lambda-url.us-east-1.on.aws/
    metabot-prompt-generator-token-limit: 6000
    native-query-autocomplete-match-style: substring
    nested-field-columns-value-length-limit: 50000
    no-data-illustration: default
    no-data-illustration-custom: null
    no-object-illustration: default
    no-object-illustration-custom: null
    notification-link-base-url: null
    notification-thread-pool-size: 10
    num-metabot-choices: 1
    openai-api-key: null
    openai-model: gpt-4-turbo-preview
    openai-organization: null
    persisted-model-refresh-cron-schedule: 0 0 0/6 * * ? *
    persisted-models-enabled: false
    premium-embedding-token: null
    query-analysis-enabled: true
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
    saml-attribute-group: member_of
    saml-attribute-lastname: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname
    saml-enabled: false
    saml-group-mappings: {}
    saml-group-sync: false
    saml-identity-provider-certificate: null
    saml-identity-provider-issuer: null
    saml-identity-provider-uri: null
    saml-keystore-alias: metabase
    saml-keystore-password: changeit
    saml-keystore-path: null
    saml-slo-enabled: false
    saml-user-provisioning-enabled: true
    scim-enabled: null
    search-engine: in-place
    search-typeahead-enabled: true
    send-new-sso-user-admin-email: null
    session-cookie-samesite: lax
    session-cookies: null
    session-timeout: null
    setup-embedding-autoenabled: false
    setup-license-active-at-setup: false
    show-database-syncing-modal: null
    show-homepage-data: true
    show-homepage-xrays: true
    show-metabase-links: true
    show-metabot: true
    show-static-embed-terms: true
    site-locale: en
    site-name: Metabase
    site-url: null
    slack-app-token: null
    slack-bug-report-channel: metabase-bugs
    slack-files-channel: metabase_files
    source-address-header: X-Forwarded-For
    sql-jdbc-fetch-size: 500
    sql-parsing-enabled: true
    ssh-heartbeat-interval-sec: 180
    start-of-week: sunday
    subscription-allowed-domains: null
    surveys-enabled: true
    synchronous-batch-updates: false
    unaggregated-query-row-limit: null
    update-channel: latest
    uploads-settings: null
    user-visibility: all
```
