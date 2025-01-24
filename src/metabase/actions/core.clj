(ns metabase.actions.core
  "API namespace for the `metabase.actions` module."
  (:require
   [metabase.actions.actions]
   [metabase.actions.error]
   [metabase.actions.execution]
   [metabase.actions.http-action]
   [potemkin :as p]))

(comment
  metabase.actions.actions/keep-me
  metabase.actions.error/keep-me
  metabase.actions.execution/keep-me
  metabase.actions.http-action/keep-me)

(p/import-vars
 [metabase.actions.actions
  cached-value
  check-actions-enabled!
  check-actions-enabled-for-database!
  perform-action!*]
 [metabase.actions.error
  incorrect-value-type
  violate-foreign-key-constraint
  violate-not-null-constraint
  violate-unique-constraint]
 [metabase.actions.execution
  execute-action!
  execute-dashcard!
  fetch-values]
 [metabase.actions.http-action
  apply-json-query])
