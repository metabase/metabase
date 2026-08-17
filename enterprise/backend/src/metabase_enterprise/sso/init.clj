(ns metabase-enterprise.sso.init
  (:require
   [metabase-enterprise.sso.integrations.google] ; has a `define-multi-setting` impl
   [metabase-enterprise.sso.models.relay-state]
   [metabase-enterprise.sso.providers.jwt]
   [metabase-enterprise.sso.providers.oidc]
   [metabase-enterprise.sso.providers.saml]
   [metabase-enterprise.sso.settings]
   [metabase-enterprise.sso.task.delete-expired-relay-state]
   [metabase.sso.providers.slack-connect]))
