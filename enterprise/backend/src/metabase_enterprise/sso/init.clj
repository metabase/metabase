(ns metabase-enterprise.sso.init
  (:require
   [metabase-enterprise.sso.integrations.google] ; has a `define-multi-setting` impl
   [metabase-enterprise.sso.providers.jwt]
   [metabase-enterprise.sso.providers.saml]
   [metabase-enterprise.sso.providers.slack-connect]
   [metabase-enterprise.sso.settings]))
