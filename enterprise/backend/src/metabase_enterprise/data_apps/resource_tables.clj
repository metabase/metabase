(ns metabase-enterprise.data-apps.resource-tables
  "The tables a data app's resources read, recorded on the app for the permission warnings an admin sees when
  granting access: a viewer who can't read one of them gets an app that fails for them."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- native-table-ids
  "The tables a native query names in its SQL, as its driver's parser reads them, and in its table template tags."
  [{database-id :database, :as query}]
  (into (data-apps.db/table-ids-named database-id
                                      (driver/native-query-table-refs (driver.u/database->driver database-id) query))
        (map :table)
        (lib/native-query-table-references query)))

(defn- query-table-ids [dataset-query]
  (let [query (lib/query (lib-be/application-database-metadata-provider (:database dataset-query)) dataset-query)]
    (if (lib/native? query)
      (native-table-ids query)
      (into (set (lib/all-source-table-ids query))
            (lib/all-implicitly-joined-table-ids query)))))

(defn collection-table-ids
  "The tables the cards and the query actions in the collection with `collection-id` read, including
  the ones a query reaches only through an implicit join."
  [collection-id]
  (->> (data-apps.db/collection-dataset-queries collection-id)
       (into #{} (mapcat (fn [dataset-query]
                           ;; a query whose tables can't be read, such as a native query on a driver that can't
                           ;; parse one, must not fail the pull that loaded it
                           (try
                             (query-table-ids dataset-query)
                             (catch Exception e
                               (log/warn e "Could not read the tables of a data app query")
                               nil)))))
       sort
       vec))

(defn record-table-dependencies!
  "Record on every data app the tables its resources read. Runs after an import, since that is what changes them."
  []
  (doseq [{:keys [id resource_collection_id]} (data-apps.db/data-apps-with-resource-collections)]
    (data-apps.db/update-data-app! id {:table_ids (collection-table-ids resource_collection_id)})))
