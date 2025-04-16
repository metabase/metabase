(ns metabase-enterprise.data-editing.data-editing
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-editing.coerce :as data-editing.coerce]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

(defn select-table-pk-fields
  "Given a table-id, return the :model/Field instances corresponding to its PK columns. Do not assume any ordering."
  [table-id]
  (u/prog1 (api/check-404 (t2/select :model/Field :table_id table-id :semantic_type :type/PK))
    (api/check-500 (pos? (count <>)))))

(defn get-row-pks
  [pk-fields row]
  (select-keys row (map (comp keyword :name) pk-fields)))

(defn- valid-pks [pks]
  (every? some? (vals pks)))

(defn- apply*
  "Work around the fact that the lib logical operators don't have a 0 or 1 arity."
  [f clauses]
  (if (<= (count clauses) 1)
    (first clauses)
    (apply f clauses)))

(defn- qp-result->row-map
  [{:keys [rows cols]}]
  ;; rows from the request are keywordized
  (let [col-names (map (comp keyword :name) cols)]
    (map #(zipmap col-names %) rows)))

(defn query-db-rows
  "Return the current representation of the given rows that we would return to the frontend, indexed by their pks."
  [table-id pk-fields rows]
  (assert (seq pk-fields) "Table must have at least on primary key column")
  ;; TODO pass in the db-id from above rather
  (let [{:keys [db_id]} (api/check-404 (t2/select-one :model/Table table-id))
        row-pks (seq (map (partial get-row-pks pk-fields) rows))]
    (assert (every? valid-pks row-pks) "All rows must have valid primary keys")
    (when row-pks
      (qp.store/with-metadata-provider db_id
        (let [mp    (qp.store/metadata-provider)
              query (lib/query mp (lib.metadata/table mp table-id))
              query (lib/filter
                     query
                     ;; We can optimize the most common case considerably.
                     (if (= 1 (count pk-fields))
                       (apply lib/in
                              (lib.metadata/field mp (:id (first pk-fields)))
                              (map (comp first vals) row-pks))
                       ;; Optimizing this could be done in many cases, but it would be complex.
                       (apply* lib/or
                               (for [row-pk row-pks]
                                 (apply* lib/and
                                         (for [field pk-fields]
                                           (lib/= (lib.metadata/field mp (:id field))
                                                  (get row-pk (keyword (:name field))))))))))]
          (->> query
               qp/userland-query-with-default-constraints
               qp/process-query
               :data
               qp-result->row-map
               (m/index-by #(get-row-pks pk-fields %))))))))

(defn apply-coercions
  "For fields that have a coercion_strategy, apply the coercion function (defined in data-editing.coerce) to the corresponding value in each row.
  Intentionally does not coerce primary key values (behaviour for pks with coercion strategies is undefined)."
  [table-id input-rows]
  (let [input-keys  (into #{} (mapcat keys) input-rows)
        field-names (map name input-keys)
        fields      (t2/select :model/Field :table_id table-id :name [:in field-names])
        coerce-fn   (->> (for [{field-name :name, :keys [coercion_strategy, semantic_type]} fields
                               :when (not (isa? semantic_type :type/PK))]
                           [(keyword field-name)
                            (or (when (nil? coercion_strategy) identity)
                                (data-editing.coerce/input-coercion-fn coercion_strategy)
                                (throw (ex-info "Coercion strategy has no defined coercion function"
                                                {:status 400
                                                 :field field-name
                                                 :coercion_strategy coercion_strategy})))])
                         (into {}))
        coerce      (fn [k v] (some-> v ((coerce-fn k identity))))]
    (for [row input-rows]
      (m/map-kv-vals coerce row))))

(defn perform-bulk-action!
  "Operates on rows in the database, supply an action-kw: :bulk/create, :bulk/update, :bulk/delete.
  The input `rows` is given different semantics depending on the action type, see actions/perform-action!."
  [action-kw table-id rows]
  ;; TODO make this work for multi instances by using the metabase_cluster_lock table
  ;; https://github.com/metabase/metabase/pull/56173/files
  (locking #'perform-bulk-action!
    (actions/perform-with-system-events!
     action-kw
     {:database (api/check-404 (t2/select-one-fn :db_id [:model/Table :db_id] table-id))
      :table-id table-id
      :arg      rows}
     {:policy :data-editing})))

(defn insert!
  "Inserts rows into the table, recording their creation as an event. Returns the inserted records.
  Expects rows that are acceptable directly by [[actions/perform-action!]]. If casts or reversing coercion strategy
  are required, that work must be done before calling this function."
  [user-id table-id rows]
  ;; TODO make sure we're always passed a user, and remove this fallback
  ;;      hard to make a business case for anonymous lemur's inserting data
  (let [user-id (or user-id (t2/select-one-pk :model/User :is_superuser true))
        res (perform-bulk-action! :bulk/create table-id rows)]
    ;; TODO this publishing needs to move down the stack and be generic all :row/delete invocations
    ;; https://linear.app/metabase/issue/WRK-228/publish-events-when-modified-by-action-execution
    (doseq [row (:created-rows res)]
      (actions/publish-action-success!
       (nano-id/nano-id)
       user-id
       :row/create
       {:table_id table-id
        :row      row}
       {:created_row row}))
    ;; TODO this should also become a subscription to the above action's success, e.g. via the system event
    (let [pk-cols (t2/select-fn-vec :name [:model/Field :name] :table_id table-id :semantic_type :type/PK)
          row-pk->old-new-values (->> (for [row (:created-rows res)]
                                        (let [pks (zipmap pk-cols (map row pk-cols))]
                                          [pks [nil row]]))
                                      (into {}))]
      ;; TODO Circular reference will be fixed when we remove the hacks from this method.
      ;;      We'll actually delete this whole method, it'll just become an :editable/insert action invocation.
      ((requiring-resolve 'metabase-enterprise.data-editing.undo/track-change!) user-id {table-id row-pk->old-new-values}))
    res))

(defn qry-context
  "TODO remove this hacky glue"
  [args-map]
  ;; These assumptions about the shape of args-map are not generally true
  (let [table-id  (:table-id args-map)                      ;
        pk-fields (when table-id (select-table-pk-fields table-id))
        rows      (:arg args-map)]
    (when (and table-id pk-fields (seq rows))
      {:table-id  table-id
       :pk-fields pk-fields
       :rows      rows})))

(defn query-previous-rows
  "TODO fix all this hackery"
  [action-kw {:keys [table-id pk-fields rows]}]
  (case action-kw
    (:bulk/update :bulk/delete)
    (query-db-rows table-id pk-fields rows)

    :bulk/create
    {}

    ;; action does not relate to row updates
    (throw (ex-info "See, this doesn't make sense" {:dumb :hack}))))

(defn query-latest-rows
  "TODO fix all this hackery"
  [action-kw {:keys [table-id pk-fields rows]} result]
  (case action-kw
    :bulk/delete
    {}

    :bulk/update
    (query-db-rows table-id pk-fields rows)

    :bulk/create
    (->> (for [row (:created-rows result)]
           [(query-db-rows table-id pk-fields [row])
            (update-keys row keyword)])
         (into {}))

    ;; action does not relate to row updates
    (throw (ex-info "See, this doesn't make sense" {:dumb :hack}))))
