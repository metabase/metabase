(ns metabase.staleness.core
  "Central staleness contract. Each stale-eligible model defines its own `find-stale-query` method
  in the model's own namespace. Consumers (the EE stale module's `find-candidates`) enumerate an
  explicit set of models and call this multimethod per model.

  Kept dependency-light (no model requires) so model namespaces can require it without creating a
  load cycle."
  (:require
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]))

(mr/def ::predicate
  "A HoneySQL boolean expression as used by [[find-stale-query]]'s `:where`/`:left-join` clauses: a bare
  column keyword, a scalar value, or an operator keyword applied to nested predicates/values."
  [:or
   :keyword
   :string
   number?
   boolean?
   :time/local-date
   h2x/Literal
   [:set [:maybe :int]]
   [:cat :keyword [:* [:maybe [:ref ::predicate]]]]])

(mr/def ::select-entry
  [:or :keyword [:tuple [:or :keyword h2x/Literal] :keyword]])

(mr/def ::query
  "The shape [[find-stale-query]] must return, and [[metabase-enterprise.stale.db]] consumes: a HoneySQL
  map selecting `id`/`model`/`name`/`last_used_at` from a single table."
  [:map {:closed true, :probe/id "src/metabase/staleness/core.clj:31"}
   [:select    [:sequential ::select-entry]]
   [:from      :keyword]
   [:left-join {:optional true} [:sequential [:or :keyword ::predicate]]]
   [:where     {:optional true} ::predicate]])

(defmulti find-stale-query
  "Return a HoneySQL map selecting stale candidates for `model`:

    {:select [<id> [\"Model\" :model] [<name> :name] [<recency-ts> :last_used_at]] :from … :where …}

  `args` is `{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}` (the same
  `FindStaleContentArgs` map the EE stale module threads through). The returned maps are
  UNION-ALL'd by the caller, so every method MUST select the same column shape:
  `id`, `model`, `name`, `last_used_at`."
  {:arglists '([model args])}
  (fn [model _args] model))
