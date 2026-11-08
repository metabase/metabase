(ns metabase.remote-sync.spec
  "The multimethod through which each model says how remote sync syncs it.")

(defmulti spec
  "How remote sync syncs `model`, every key optional: `:label`, a fn of an entity returning its name for people,
  `:name` by default; `:collection-id`, a fn of a row returning the id of the collection the UI shows its changes
  under, `:collection_id` by default; `:synced-filter-clause`, a fn of a table alias returning the HoneySQL
  where-clause over the columns of the model's table, so aliased, selecting the rows it syncs, all of them by default;
  and `:built-in-filter-clause`, the same for the rows every instance has with the same entity id, which synced content
  can depend on without syncing them, none by default."
  {:arglists '([model])}
  identity)
