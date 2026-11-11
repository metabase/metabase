(ns metabase.remote-sync.spec
  "The multimethod through which each model says how remote sync syncs it.")

(defmulti spec
  "How remote sync syncs `model`, every key optional: `:label`, a fn of an entity returning its name for people,
  `:name` by default; `:collection-id`, a fn of a row returning the id of the collection the UI shows its changes
  under, `:collection_id` by default; `:collection-from-parent?`, true when the UI shows its changes under the
  collection of its parent instead, so that `:collection-id` doesn't apply, false by default; `:parent`, a fn of a row
  returning the `[model pk]` of the entity the UI shows it within, such as the table of a segment, none by default;
  `:synced-filter-clause`, a fn of the `::metabase.remote-sync.schema/synced-filter-opts` returning the HoneySQL
  where-clause fragment over the unqualified columns of the model's table selecting the rows it syncs, all of them by
  default; `:built-in-filter-clause`, a fn of no args returning the same for the rows every instance has with the same
  entity id, which synced content can depend on without syncing them, none by default; and `:ids-query`, a fn of such
  a where-clause returning the HoneySQL query fragment selecting the primary keys of the model's rows matching it,
  which models whose rows other synced rows reference need."
  {:arglists '([model])}
  identity)
