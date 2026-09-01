(ns metabase.staleness.core
  "Central staleness contract. Each stale-eligible model defines its own `find-stale-query` method
  in the model's own namespace.

  DEAD CODE: nothing dispatches through this multimethod. Its only consumer was the EE stale
  module's `find-candidates`, which now runs a static HugSQL statement
  (`metabase-enterprise.stale.stale-queries`) instead of UNION-ALL'ing one HoneySQL arm per model.
  The two methods below (`:model/Card`, `:model/Dashboard`) and their tests are likewise unused.

  Kept rather than deleted because this multimethod is the extension point added by #76649, so
  removing it is a design decision rather than cleanup. Delete this namespace and both methods if
  that extension point is not wanted; re-wire them here if a third stale model ever needs one.

  Kept dependency-light (no model requires) so model namespaces can require it without creating a
  load cycle.")

(defmulti find-stale-query
  "Return a HoneySQL map selecting stale candidates for `model`:

    {:select [<id> [\"Model\" :model] [<name> :name] [<recency-ts> :last_used_at]] :from … :where …}

  `args` is `{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}`. Methods MUST all
  select the same column shape (`id`, `model`, `name`, `last_used_at`) so they can be UNION-ALL'd.

  Unused -- see the namespace docstring."
  {:arglists '([model args])}
  (fn [model _args] model))
