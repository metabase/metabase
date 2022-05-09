(ns metabase.api.actions
  "/api/actions endpoints"
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.database :as database :refer [Database]]
            [metabase.models.table :as table :refer [Table]]
            [schema.core :as s]
            [metabase.util.schema :as su]))

(def ^:private engines-that-support-actions #{:postgres})

;;; +-------------------------------------------------------------------------------------------------------+
;;; |                    Deleting a Row -- DELETE /api/actions/:id                        |
;;; +-------------------------------------------------------------------------------------------------------+

(api/defendpoint DELETE "/:table_id"
  "Delete a row from `table_id` with primary keys (keys primary_keys) and values (vals primary_keys)."
  [table_id :as {{:keys [primary_keys] :as body} :body}]
  {table_id s/Int
   primary_keys (su/with-api-error-message {s/Keyword s/Any} "Needs to be a map of primary-key(s) -> value(s)")}
  (def tid table_id)
  (let [table (Table table_id)
        {:keys [fields]} (table/with-fields [table])]
    (def tt table)
    ;; with-fields assocs :fields
    (if (nil? table)
      {:status 400
       :message (str "No table with id: " table_id)}
      (let [{db-engine :engine  db-id :id :as db} (Database (:db_id table))]
        (cond
          (not (contains? engines-that-support-actions db-engine))
          {:status 400
           :message (str "deletes supported for postgres only, table_id: " table_id ", db is:" (pr-str db))}
          (not :db-specific-action-setting-set?) ; FIXME: once there's a field on the database to check:
          {:status 400
           :message (str "deletes disabled for table_id:" table_id)}
          :else
          (let [primary-keys (filter #(= :type/PK (:semantic_type %)) fields)]
            (if (not= (count primary-keys) (count primary_keys))
              {:status 400
               :message (str "Mismatched number of primary keys in request and on table_id " table_id)}
              {:db db-id
               :hsql (pr-str {:delete-from [(keyword (:name table))]
                              :where (into [:and] (mapv (fn [[k v]] [:= k v]) primary_keys))})})))))))

(comment

  (let [{:keys [table_id primary_keys]} {:table_id 71, :primary_keys ["a" "b"]}
        {:keys [fields] :as table} (table/with-fields [(Table table_id)])
        pks (mapv #(select-keys % [:name :effective_type :semantic_type])
                  (filter #(= :type/PK (:semantic_type %)) fields))]
    [pks table (Database (:db_id table))]))


(api/define-routes)
