(ns metabase.prototype.settings
  (:require
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.settings.core :refer [defsetting]]))

(defn- prototype-data-info []
  (when-let [database-id (prototype.db/prototype-database-id)]
    (let [ids-by-name (prototype.db/table-ids-by-name database-id dataset/schema-name)]
      {:database_id database-id
       :table_ids   (into [] (keep (comp ids-by-name :name)) dataset/tables)})))

(defsetting prototype-data
  "The prototype dataset for the frontend: its Database id and its table ids."
  :type       :json
  :setter     :none
  :getter     prototype-data-info
  :visibility :authenticated
  :encryption :no
  :export?    false
  :doc        false)

(defsetting prototype-semantic-layer-version
  "Prototype: the version of the semantic layer definitions on this instance. See
  [[metabase.prototype.semantic-layer]]."
  :type       :integer
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)
