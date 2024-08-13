(ns metabase.actions.core
  "API namespace for the `metabase.actions` module."
  (:require
   [metabase.actions :as actions]
   [metabase.actions.error :as actions.error]
   [metabase.actions.execution :as actions.execution]
   [metabase.actions.http-action :as actions.http-action]
   [potemkin :as p]))

(comment
  actions/keep-me
  actions.error/keep-me
  actions.execution/keep-me
  actions.http-action/keep-me)

(p/import-vars
  [actions
   cached-value
   check-actions-enabled!
   check-actions-enabled-for-database!
   perform-action!*]
  [actions.error
   incorrect-value-type
   violate-foreign-key-constraint
   violate-not-null-constraint
   violate-unique-constraint]
  [actions.execution
   execute-action!
   execute-dashcard!
   fetch-values]
  [actions.http-action
   apply-json-query])
