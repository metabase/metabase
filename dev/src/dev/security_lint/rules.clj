(ns dev.security-lint.rules
  "Loads every rule namespace.

  Adding a rule means adding a `defrule` to one of these namespaces -- or a new namespace listed here. Nothing in
  the engine or the reporters needs to change."
  (:require
   [dev.security-lint.rule :as rule]
   [dev.security-lint.rules.authorization]
   [dev.security-lint.rules.crypto]
   [dev.security-lint.rules.deserialization]
   [dev.security-lint.rules.disclosure]
   [dev.security-lint.rules.drivers]
   [dev.security-lint.rules.endpoints]
   [dev.security-lint.rules.honeysql]
   [dev.security-lint.rules.injection]
   [dev.security-lint.rules.models]
   [dev.security-lint.rules.network]
   [dev.security-lint.rules.origins]
   [dev.security-lint.rules.rendering]
   [dev.security-lint.rules.secrets]))

(set! *warn-on-reflection* true)

(defn all
  "Every registered rule.

  Requiring this namespace is what loads the rule namespaces; each `defrule` registers itself at load time."
  []
  (rule/all))
