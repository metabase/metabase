(ns metabase-enterprise.transform-testing.util
  "Helpers shared across the module."
  (:require
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
