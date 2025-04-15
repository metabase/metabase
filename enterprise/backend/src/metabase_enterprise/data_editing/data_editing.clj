(ns metabase-enterprise.data-editing.data-editing
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-editing.coerce :as data-editing.coerce]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

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

(comment
  (metabase.test/user-http-request
   :crowberto
   :post
   (format "ee/data-editing/table/%d"
           (metabase.test/id :categories))
   {:rows [{:NAME "New Category"}]})
  (metabase.test/user-http-request
   :crowberto
   :post
   (format "ee/data-editing/table/%d/delete"
           (metabase.test/id :orders))
   {:rows [{:ID 2}]})

  (metabase.test/user-http-request
   :crowberto
   :put
   (format "ee/data-editing/table/%d"
           (metabase.test/id :orders))
   {:rows [{:ID 42 :PRODUCT_ID 3}]}))
