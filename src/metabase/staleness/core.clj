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
  "A `:select` element: a bare column keyword, or an aliased expression paired with its output column.
  The expression is a [[predicate]] - which covers a column, a literal, and any operator applied to
  nested values, such as the `:case` a model uses to null out a recency column."
  [:or :keyword [:tuple ::predicate :keyword]])

(mr/def ::derived-table
  "A sub-select joined as a derived table, paired with its alias."
  [:tuple
   [:map {:closed true}
    [:select   [:sequential [:ref ::select-entry]]]
    [:from     [:or :keyword [:sequential :keyword]]]
    [:group-by {:optional true} [:sequential :keyword]]
    [:where    {:optional true} ::predicate]]
   :keyword])

(mr/def ::query
  "The shape [[find-stale-query]] must return, and [[metabase-enterprise.stale.db]] consumes: a HoneySQL
  map selecting `id`/`model`/`name`/`last_used_at` from a single table."
  [:map {:closed true}
   [:select    [:sequential ::select-entry]]
   [:from      :keyword]
   [:left-join {:optional true} [:sequential [:or :keyword ::derived-table ::predicate]]]
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

(defn collection-filter
  "HoneySQL condition scoping `collection-id-column` to `(:collection-ids args)`, or nil (no filtering)
  when `:collection-ids` is `:all`. A nil member of the set selects root-level content."
  [collection-id-column {:keys [collection-ids]}]
  (when (set? collection-ids)
    [:or
     (when (contains? collection-ids nil)
       [:is collection-id-column nil])
     [:in collection-id-column collection-ids]]))
