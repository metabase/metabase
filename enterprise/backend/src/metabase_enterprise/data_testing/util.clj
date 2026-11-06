(ns metabase-enterprise.data-testing.util
  "Helpers shared across the module."
  (:require
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn fold-identifier :- [:maybe :string]
  "`identifier` — a schema or a table name — as this module compares it, or nil when there is none.

  Every comparison here ignores case: a reference against a declared input, a declared schema against the database's
  default one, and two declared inputs against each other. That is how the rewrite matches, and how an engine reads an
  unquoted identifier."
  [identifier :- [:maybe :string]]
  (some-> identifier u/lower-case-en))

(mu/defn ->definition :- ::data-testing.schema/transform-test.definition
  "What the saved `transform-test` checks, as a client writes it."
  [transform-test :- ::data-testing.schema/transform-test]
  (select-keys transform-test [:name :description :inputs :expectations]))
