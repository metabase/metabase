(ns metabase.serialization.resolve
  "Resolution of the database ids and references in a batch of forms or columns all at once, with one query of a store
  (see [[metabase.serialization.protocol/Store]]) per model and nesting level. A walk visits each database id or
  reference with the model of the row it names, `(visit model x)`; export resolves database ids to references and
  import resolves references back to database ids, creating the rows the store lacks when asked to:

  | model             | export: database id to             | import: back to database id        |
  |-------------------|------------------------------------|------------------------------------|
  | `:model/Table`    | `[db schema table]`                | `[db schema table]`                |
  | `:model/Field`    | `[db schema table field & nested]` | `[db schema table field & nested]` |
  | `:model/Database` | its name, or nil                   | its name                           |
  | `:model/User`     | its email, or nil                  | its email                          |
  | any other model   | its entity id                      | its entity id                      |"
  (:require
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn target-not-found
  "The error of the database id or reference `x` of a row of `model` that does not exist."
  [model x]
  (ex-info (format "%s %s was not found" (name model) (pr-str x))
           {:model model
            :id    x
            ::type :target-not-found}))

(defn target-not-found?
  "Whether `e` is a [[target-not-found]] error."
  [e]
  (= :target-not-found (::type (ex-data e))))

(defn resolved-value
  "What `found`, a map from input to result, holds for the input `x` of `model`, or a [[target-not-found]] error when it
  holds none."
  [found model x]
  (if (contains? found x)
    (get found x)
    (throw (target-not-found model x))))

(defn found-or-nil
  "What `f` returns, or nil when it throws a [[target-not-found]] error."
  [f]
  (try
    (f)
    (catch clojure.lang.ExceptionInfo e
      (when-not (target-not-found? e)
        (throw e)))))

(defn- add-input
  "`inputs`, a map from model to a set of inputs, with the non-nil `x` of `model`."
  [inputs model x]
  (cond-> inputs
    (some? x) (update model (fnil conj #{}) x)))

(defn walk-in-bulk
  "Each of `forms` rewritten by `walk`, a fn of a visitor and a form that replaces every database id or reference `x`
  of a row of `model` in the form with what `(visit model x)` returns, with `opts` the options the walk reads with
  [[options]]. A first walk collects the inputs, returning each unresolved; `resolve`, a fn of a model and the set of
  its inputs returning a map from input to result, resolves each model's at once; and a second walk replaces each
  input with its result. An input the first walk misses, because it threw or took a path that depends on resolved
  values, is resolved when the second walk meets it."
  ([forms walk resolve]
   (walk-in-bulk forms {} walk resolve))
  ([forms opts walk resolve]
   (let [collected (volatile! {})
         collect   (with-meta (fn [model x] (vswap! collected add-input model x) x)
                              {::collecting true ::options opts})
         _         (run! #(try (walk collect %) (catch Exception _ nil)) forms)
         resolved  (volatile! (into {} (map (fn [[model xs]] [model (resolve model xs)])) @collected))
         tried     (volatile! @collected)
         visit     (with-meta (fn [model x]
                                (when-not (contains? (get @tried model) x)
                                  (vswap! tried add-input model x)
                                  (vswap! resolved update model merge (resolve model #{x})))
                                (resolved-value (get @resolved model) model x))
                              {::options opts})]
     (mapv #(walk visit %) forms))))

(defn options
  "The options of the walk whose visitor is `visit`, a visitor of [[walk-in-bulk]]."
  [visit]
  (::options (meta visit)))

(defn collecting?
  "Whether `visit` is the visitor of the first walk of [[walk-in-bulk]], which returns each input unresolved, so a
  walk can skip the steps that need resolved values."
  [visit]
  (boolean (::collecting (meta visit))))

(defn visit-some
  "What `visit` returns for the input `x` of `model`, or nil when `x` is nil."
  [model x visit]
  (when (some? x)
    (visit model x)))

(defn- column-values
  "The map from each of `ids` to the `column` value of its `model` row, leaving out the ids with no row."
  [store model column ids]
  (let [pk (serialization.spec/primary-key model)]
    (into {} (map (juxt #(get % pk) column)) (protocol/select-by-pks store model ids [pk column]))))

(defn entity-ids
  "The map from each of `ids` to the entity id of its `model` row, leaving out the ids with no row or no entity id."
  [store model ids]
  (into {} (filter val) (column-values store model :entity_id ids)))

(defn database-refs
  "The map from each of `ids` to the name of its Database, nil for a missing Database."
  [store ids]
  (merge (zipmap ids (repeat nil)) (column-values store :model/Database :name ids)))

(defn user-refs
  "The map from each of `ids` to the email of its User, nil for a missing User."
  [store ids]
  (merge (zipmap ids (repeat nil)) (column-values store :model/User :email ids)))

(defn table-refs
  "The map from each of `table-ids` to the `[db-name schema table-name]` reference of its Table, leaving out the ids
  with no Table."
  [store table-ids]
  (let [tables   (protocol/select-by-pks store :model/Table table-ids [:id :db_id :schema :name])
        db-names (column-values store :model/Database :name (into #{} (map :db_id) tables))]
    (into {}
          (map (fn [{:keys [id db_id schema name]}] [id [(db-names db_id) schema name]]))
          tables)))

(defn- fields-with-ancestors
  "The map from id to row of the Fields with `field-ids` and all their ancestors, one nesting level per query."
  [store field-ids]
  (loop [rows {} pending field-ids]
    (if (empty? pending)
      rows
      (let [fetched (protocol/select-by-pks store :model/Field pending [:id :name :parent_id :table_id])
            rows    (into rows (map (juxt :id identity)) fetched)]
        (recur rows (into #{} (comp (keep :parent_id) (remove rows)) fetched))))))

(defn- ancestry
  "The rows of the Field with `field-id` and its ancestors in `rows`, root first."
  [rows field-id]
  (loop [id field-id chain ()]
    (if-let [row (get rows id)]
      (recur (:parent_id row) (conj chain row))
      (vec chain))))

(defn field-refs
  "The map from each of `field-ids` to the `[db-name schema table-name & field-names]` reference of its Field, leaving
  out the ids with no Field."
  [store field-ids]
  (let [rows   (fields-with-ancestors store field-ids)
        chains (into {} (keep (fn [id] (when (contains? rows id) [id (ancestry rows id)]))) field-ids)
        tables (table-refs store (into #{} (map (comp :table_id first)) (vals chains)))]
    (into {}
          (keep (fn [[id chain]]
                  (when-let [table-ref (get tables (:table_id (first chain)))]
                    [id (into table-ref (map :name) chain)])))
          chains)))

(defn row-refs
  "The map from each of `ids` to the reference of its `model` row (see the table of this namespace),
  leaving out the ids with no row but those of Databases and Users, which resolve to nil."
  [store model ids]
  (case model
    :model/Table    (table-refs store ids)
    :model/Field    (field-refs store ids)
    :model/Database (database-refs store ids)
    :model/User     (user-refs store ids)
    (entity-ids store model ids)))

(defn export-in-bulk
  "Each of `forms` rewritten by `walk` (see [[walk-in-bulk]]), with its database ids resolved to
  references in `store`."
  [store forms walk]
  (walk-in-bulk forms walk #(row-refs store %1 %2)))

(defn- insert-missing!
  "The map from each of the set `refs` that `found` lacks to the id of the `model` row inserted into `store` for it by
  `->row` when `opts` has `:create-missing?`, merged into `found`."
  [store model found refs opts ->row]
  (let [missing (into [] (remove #(contains? found %)) refs)]
    (if (and (:create-missing? opts) (seq missing))
      (into found (map vector missing (map :id (protocol/insert-rows! store model (mapv ->row missing)))))
      found)))

(defn- ref-pks
  "The map from each of the set `refs` to the primary key of the `model` row with that ref, leaving out the refs no row
  has."
  [store model refs]
  (let [pk (serialization.spec/primary-key model)]
    (update-vals (protocol/select-by-refs store model refs [pk]) #(get % pk))))

(defn entity-pks
  "The map from each of `inputs`, refs of `model` rows or, on a surface that accepts them, their numeric ids, to the
  primary key of its row, leaving out the ones with no row."
  [store model inputs]
  (let [pk                        (serialization.spec/primary-key model)
        {numeric true refs false} (group-by int? inputs)
        by-pk                     (into #{} (map #(get % pk)) (protocol/select-by-pks store model (set numeric) [pk]))]
    (merge (ref-pks store model (set refs))
           (into {} (comp (filter by-pk) (map (juxt identity identity))) numeric))))

(defn user-ids
  "The map from each of `emails` to the id of its User, an inactive one created when `opts` has `:create-missing?`."
  [store emails opts]
  (insert-missing! store :model/User (ref-pks store :model/User emails) emails opts
                   (fn [email] {:email email :is_active false})))

(defn database-ids
  "The map from each of `db-names` to the id of the Database it names, a stub created when `opts` has
  `:create-missing?`."
  [store db-names opts]
  (insert-missing! store :model/Database (ref-pks store :model/Database db-names) db-names opts
                   (fn [db-name] {:name                db-name
                                  :engine              :postgres
                                  :details             {}
                                  :is_stub             true
                                  :initial_sync_status "complete"})))

(defn table-ids
  "The map from each of the `[db-name schema table-name]` refs `refs` to the id of its Table, an inactive one created
  when `opts` has `:create-missing?`."
  [store refs opts]
  (let [found   (ref-pks store :model/Table refs)
        missing (into #{} (remove found) refs)]
    (if (and (:create-missing? opts) (seq missing))
      (let [db-ids (database-ids store (into #{} (map first) missing) opts)]
        (insert-missing! store :model/Table found missing opts
                         (fn [[db-name schema table-name]]
                           {:db_id (get db-ids db-name) :schema schema :name table-name :active false})))
      found)))

(defn- check-field-ref
  "Throws when `ref` names no Field, holding no more than a Table ref."
  [ref]
  (when (< (count ref) 4)
    (throw (ex-info (tru "Portable field FK {0} must have at least 4 elements." (pr-str ref))
                    {:status-code 400
                     :error       :invalid-field-fk
                     :path        ref}))))

(defn- create-missing-fields!
  "`found`, the map from Field ref to id, with an inactive Field created for each of the `refs` and their ancestors it
  lacks, one nesting level per insert."
  [store refs found opts]
  (let [table-ids (table-ids store (into #{} (map #(subvec % 0 3)) refs) opts)
        prefixes  (into #{} (mapcat (fn [ref] (map #(subvec ref 0 %) (range 4 (inc (count ref)))))) refs)
        found     (merge (ref-pks store :model/Field (into #{} (remove found) prefixes)) found)]
    (reduce (fn [found depth]
              (let [level (filter #(and (= depth (count %)) (get table-ids (subvec % 0 3))) prefixes)]
                (insert-missing! store :model/Field found (set level) opts
                                 (fn [ref]
                                   {:table_id      (get table-ids (subvec ref 0 3))
                                    :parent_id     (when (> depth 4) (get found (pop ref)))
                                    :name          (peek ref)
                                    :active        false
                                    :base_type     :type/*
                                    :database_type "NULL"}))))
            found
            (sort (into #{} (map count) prefixes)))))

(defn field-ids
  "The map from each of the `[db-name schema table-name & field-names]` refs `refs` to the id of its Field, with each
  missing Field and ancestor an inactive Field created when `opts` has `:create-missing?`."
  [store refs opts]
  (let [refs  (into #{} (map vec) refs)
        _     (run! check-field-ref refs)
        found (ref-pks store :model/Field refs)]
    (if (and (:create-missing? opts) (not-every? found refs))
      (select-keys (create-missing-fields! store refs found opts) refs)
      found)))

(defn row-ids
  "The map from each of `inputs`, refs of `model` rows (see [[metabase.serialization.protocol/select-by-refs]]), to the
  database id of its row, leaving out the ones with no row unless `opts` has `:lenient?`, which resolves them to nil;
  `:create-missing?` creates the inactive Users, stub Databases and inactive Tables and Fields `store` lacks."
  [store model inputs opts]
  (let [found (case model
                :model/User     (user-ids store inputs opts)
                :model/Database (database-ids store inputs opts)
                :model/Table    (table-ids store inputs opts)
                :model/Field    (field-ids store inputs opts)
                (entity-pks store model inputs))]
    (cond-> found
      (:lenient? opts) (into (comp (remove #(contains? found %)) (map (fn [x] [x nil]))) inputs))))

(defn import-in-bulk
  "Each of `forms` rewritten by `walk` (see [[walk-in-bulk]]), with its references resolved to database
  ids in `store` with `opts` (see [[row-ids]]), which the walk also reads with [[options]], like
  `:numeric-ids-allowed?` to accept bare numeric ids alongside references or `:skip-schema-validation?` to keep a query
  this instance's schema rejects."
  [store forms opts walk]
  (walk-in-bulk forms opts walk #(row-ids store %1 %2 opts)))
