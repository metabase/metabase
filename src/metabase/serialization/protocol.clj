(ns metabase.serialization.protocol
  "The store serialization reads and writes the rows of models through, in bulk.")

(defprotocol Store
  "Rows of serialized models read and written in bulk, where a non-nil `columns` names the only columns a caller needs."
  (select-by-pks [store model pks columns]
    "The rows of `model` whose primary key is in the set `pks`.")
  (select-by-refs [store model refs columns]
    "The map from each of the set `refs` to the oldest row of `model` with that ref, leaving out the refs no row has.
    The ref of a Table is `[db-name schema table-name]`, of a Field `[db-name schema table-name & field-names]`, of a
    Database its name and of a User its email; that of a row of another model is the value of its one identity column
    (see [[metabase.serialization.spec/identity-columns]]), or the vector of the values of several.")
  (select-by-parent-pks [store model parent-pks columns]
    "The rows of `model` whose parent, the row its spec's `:parent` names, has its primary key in the set
    `parent-pks`.")
  (insert-rows! [store model rows]
    "Inserts `rows` of `model`, running its hooks, and returns the inserted instances in the order of `rows`.")
  (update-row! [store model pk changes]
    "Updates the row of `model` whose primary key is `pk` with `changes`, running the model's hooks.")
  (delete-rows! [store model pks]
    "Deletes the rows of `model` whose primary key is in the set `pks`, running the model's hooks.")
  (transact [store opts f]
    "What `f` returns when called in one transaction, or a savepoint inside one, with `opts` like
    `{:isolation :repeatable-read}` or `{:retries 3}`."))
