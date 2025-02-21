(ns metabase-enterprise.enhancements.init
  "Load namespaces for side effects as part of initializing this module.

  See https://metaboat.slack.com/archives/CKZEMT1MJ/p1736556522733279 for rationale behind this pattern."
  (:require
   [metabase-enterprise.enhancements.integrations.google]
   ;; Load the EE namespace up front so that the extra Settings it defines are available immediately. Otherwise, this
   ;; would only happen the first time something like [[metabase.sso.ldap/find-user]] is called.
   [metabase-enterprise.enhancements.integrations.ldap]))
