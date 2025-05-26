(ns metabase.actions.core
  "API namespace for the `metabase.actions` module."
  (:require
   [metabase.actions.actions]
   [metabase.actions.error]
   [metabase.actions.events]
   [metabase.actions.execution]
   [metabase.actions.http-action]
   [metabase.actions.models]
   [metabase.actions.scope]
   [potemkin :as p]))

(comment
  metabase.actions.actions/keep-me
  metabase.actions.error/keep-me
  metabase.actions.execution/keep-me
  metabase.actions.http-action/keep-me
  metabase.actions.models/keep-me
  metabase.actions.scope/keep-me)

(p/import-vars
 [metabase.actions.actions
  cached-value
  check-actions-enabled!
  check-data-editing-enabled-for-database!
  cached-database
  cached-database-via-table-id
  handle-effects!*
  perform-action!
  ;; allow actions to be defined in the data-editing module
  perform-action!*
  perform-nested-action!
  action-arg-map-spec
  normalize-action-arg-map]
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
  apply-json-query]
 [metabase.actions.models
  dashcard->action
  select-action
  select-actions
  table-primitive-action
  unpack-encoded-action-id]
 [metabase.actions.events
  publish-action-success!]
 [metabase.actions.scope
  hydrate-scope
  normalize-scope])
