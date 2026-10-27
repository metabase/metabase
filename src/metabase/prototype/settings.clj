(ns metabase.prototype.settings
  (:require
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting prototype-slow-query-delay-ms
  (deferred-tru "How long Metabase waits, in milliseconds, before it runs a query on a slow table of the prototype dataset.")
  :type       :integer
  :default    5000
  :visibility :authenticated
  :encryption :no
  :export?    false
  :doc        false)

(defn- prototype-data-info []
  (when-let [database-id (prototype.db/prototype-database-id)]
    (let [ids-by-name (prototype.db/table-ids-by-name database-id dataset/schema-name)
          ids         (fn [slow?]
                        (into [] (keep (fn [{table-name :name, :as table}]
                                         (when (= slow? (:slow? table))
                                           (get ids-by-name table-name))))
                              dataset/tables))]
      {:database_id    database-id
       :slow_table_ids (ids true)
       :fast_table_ids (ids false)})))

(defsetting prototype-data
  "The prototype dataset for the frontend: its Database id, and which of its tables are slow or fast."
  :type       :json
  :setter     :none
  :getter     prototype-data-info
  :visibility :authenticated
  :encryption :no
  :export?    false
  :doc        false)
