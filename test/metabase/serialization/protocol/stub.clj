(ns metabase.serialization.protocol.stub
  "A [[metabase.serialization.protocol/Store]] answering with stub fns of the ids and refs of rows, for tests that
  should not touch the app DB."
  (:require
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.spec :as serialization.spec]))

(defn- unstubbed [k]
  (fn [& _]
    (throw (ex-info (str "No stub for " k) {:stub k}))))

(defn- placeholder-db
  "The stub of `:database` when there is none: an opaque id that keeps the name, so Table references still resolve."
  [db-name]
  [::db db-name])

(defn- placeholder-table
  "The stub of `:table` when there is none: an opaque id that keeps the reference, so Field references still resolve."
  [ref]
  [::table ref])

(defn- field-row
  "The row of the Field with `id` and the `[db-name schema table-name & field-names]` reference `ref`."
  [id ref]
  {:id        id
   :name      (peek ref)
   :parent_id (when (> (count ref) 4) [::field (pop ref)])
   :table_id  [::table (subvec ref 0 3)]})

(defn- row-by-pk
  "The row of `model` with primary key `pk` that the stubs answer, or nil."
  [stub model pk columns]
  (let [[tag x] (when (vector? pk) pk)]
    (case tag
      ::db    {:id pk :name x}
      ::table {:id pk :db_id [::db (first x)] :schema (second x) :name (nth x 2)}
      ::field (field-row pk x)
      (case model
        :model/Table (when-let [[db-name schema table-name] ((stub :table) pk)]
                       {:id pk :db_id [::db db-name] :schema schema :name table-name})
        :model/Field (some->> ((stub :field) pk) vec (field-row pk))
        (let [k   (serialization.spec/primary-key model)
              col (first (remove #{k} columns))]
          (when-some [v (if (= col :entity_id)
                          ((stub :fk) pk model)
                          ((stub :fk-keyed) pk model col))]
            {k pk col v}))))))

(defn- ref-id
  "The id the stubs answer for `ref`, a ref of a row of `model`, or nil."
  [stub model ref]
  (case model
    :model/Database ((stub :database) ref)
    :model/User     ((stub :user) ref)
    :model/Table    ((stub :table) ref)
    :model/Field    ((stub :field) ref)
    (let [[column] (serialization.spec/identity-columns model)]
      (if (= column :entity_id)
        ((stub :fk) ref model)
        ((stub :fk-keyed) ref model column)))))

(defn stub-store
  "The store answering with the fns of `stubs`, a nil answer meaning no row, each call recorded in the atom `:calls`
  as `[op model]` when there is one. By primary key: `:fk` of an id and a model, answering the entity id; `:fk-keyed`
  of an id, a model and a column, answering the column value; `:table` of a Table id and `:field` of a Field id,
  answering their refs. By ref: `:fk` of an entity id and a model, `:fk-keyed` of a column value, a model and the
  column, `:user` of an email, `:database` of a Database name, and `:table` and `:field` of a Table or Field ref,
  answering the id; or `:import`, a fn of any ref answering every one of them."
  [stubs]
  (let [stub    (fn [k] (or (get stubs k)
                            (when-let [f (:import stubs)] (fn [x & _] (f x)))
                            (case k :database placeholder-db :table placeholder-table (unstubbed k))))
        record! (fn [op model] (some-> (:calls stubs) (swap! conj [op model])))]
    (reify protocol/Store
      (select-by-pks [_ model pks columns]
        (record! :select-by-pks model)
        (into [] (keep #(row-by-pk stub model % columns)) pks))
      (select-by-refs [_ model refs _columns]
        (record! :select-by-refs model)
        (into {}
              (keep (fn [ref]
                      (when-some [id (ref-id stub model ref)]
                        [ref {(serialization.spec/primary-key model) id}])))
              refs))
      (select-by-parent-pks [_ model _parent-pks _columns]
        (throw (ex-info "No stub for children" {:model model})))
      (insert-rows! [_ model _rows]
        (throw (ex-info "No stub for inserts" {:model model})))
      (update-row! [_ model _pk _changes]
        (throw (ex-info "No stub for updates" {:model model})))
      (delete-rows! [_ model _pks]
        (throw (ex-info "No stub for deletes" {:model model})))
      (transact [_ _opts f]
        (f)))))
