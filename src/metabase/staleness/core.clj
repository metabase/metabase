(ns metabase.staleness.core
  "Central staleness contract. Each stale-eligible model defines its own `find-stale-query` method
  in the model's own namespace. Consumers (the EE stale module's `find-candidates`) enumerate an
  explicit set of models and call this multimethod per model.

  Kept dependency-light (no model requires) so model namespaces can require it without creating a
  load cycle.")

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
