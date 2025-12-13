(ns metabase.channel.email.core
  "API namespace for the parts of [[metabase.channel.email.internal]] we want to expose outside of the namespace.

  TODO (Cam 2025-12-11) the `channel` module still lacks a proper API namespace, this should get rolled into that
  whenever we make one."
  (:require
   [metabase.channel.email.internal]
   [potemkin :as p]))

(comment metabase.channel.email.internal/keep-me)

(p/import-vars
 [metabase.channel.email.internal
  app-name-trs
  button-style
  common-context
  generate-notification-unsubscribe-hash
  generate-pulse-unsubscribe-hash
  logo-url
  pulse->alert-condition-kwd])
