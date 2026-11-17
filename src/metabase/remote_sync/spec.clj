(ns metabase.remote-sync.spec
  "The multimethod through which each model says how remote sync syncs it.")

(defmulti spec
  "How remote sync syncs `model`: `:synced-items`, required unless the model is a SerDes child, whose rows show within their
  parent's, a fn of primary keys returning those rows of the model, hydrated with what the UI shows of them, such as
  their collection and its ancestors; and, all optional, `:name`, a fn of an exported entity returning its name for
  people, `:name` by default; `:synced-filter-clause`, a fn of a table alias and the
  `::metabase.remote-sync.schema/synced-filter-opts` returning the HoneySQL where-clause over the columns of the
  model's table, so aliased, selecting the rows it syncs, all of them by default; and `:built-in-filter-clause`, the
  same for the rows every instance has with the same entity id, which synced content can depend on without syncing
  them, none by default."
  {:arglists '([model])}
  identity)
