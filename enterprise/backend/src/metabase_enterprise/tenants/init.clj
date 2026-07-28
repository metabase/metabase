(ns metabase-enterprise.tenants.init
  "Loads tenants namespaces that need to be loaded for side effects on system launch. See [[metabase-enterprise.core.init]].

  [[metabase-enterprise.tenants.auth-provider]] registers the `login!` method that validates a login's tenant claim
  and stamps `:tenant_id` onto the user data. The SSO providers only `derive` from its keyword, which does not load
  the namespace — without this eager require, a freshly started instance silently skips the tenant step for JWT/SAML
  logins until something else loads the namespace, provisioning tenant users as internal users (UXW-4898)."
  (:require
   [metabase-enterprise.tenants.auth-provider]))
