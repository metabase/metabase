(ns metabase.db.perms-migrations-test
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn sql-for-table
  [table-name instance-id]
  (case table-name
    "metabase_table"
    (format "SELECT id, db_id, schema FROM \"public\".\"metabase_table\" WHERE etl_source_instance_id = '%s'" instance-id)

    "metabase_database"
    (format "SELECT id FROM \"public\".\"metabase_database\" WHERE etl_source_instance_id = '%s'" instance-id)

    "permissions_group"
    (format "SELECT id, name FROM \"public\".\"permissions_group\" WHERE etl_source_instance_id = '%s'" instance-id)

    "permissions"
    (format "SELECT object, group_id FROM \"public\".\"permissions\"  WHERE etl_source_instance_id = '%s'" instance-id)

    "sandboxes"
    (format "SELECT id, group_id, table_id FROM \"public\".\"sandboxes\" WHERE etl_source_instance_id = '%s'" instance-id)))

(defn query-stats [api-key table instance-id]
  (let [sql   (sql-for-table table instance-id)
        query (str "query=" (java.net.URLEncoder/encode
                             (json/generate-string
                              {:database 45
                               :type "native"
                               :native {:query sql}
                               :middleware {:js-int-to-string? true
                                            :add-default-userland-constraints? true}})
                             "UTF-8"))
        headers {"User-Agent" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0"
                 "Accept" "*/*"
                 "Accept-Language" "en-US,en;q=0.5"
                 "Content-Type" "application/x-www-form-urlencoded;charset=UTF-8"
                 "Origin" "https://stats.metabase.com"
                 "Connection" "keep-alive"
                 "x-api-key" api-key}
        response (http/post "https://stats.metabase.com/api/dataset/csv"
                            {:body query
                             :headers headers})]
    (next (csv/read-csv (:body response)))))

(defn dedupe-on-id
  [data]
  (map
   (fn [[_id data]]
     (first data))
   (group-by :id data)))

(defn to-int
  [s]
  (when s (read-string (str/replace s "," ""))))

(defn fetch-hosting-insights-for-instance
  [instance-id api-key]
  (when (not api-key)
    (throw (Exception. "You must set the api-key to run this test")))
  (let [permissions
        (map
         (fn [[object group-id]]
           {:object object
            :group_id (to-int group-id)})
         (query-stats api-key "permissions" instance-id))

        metabase_table
        (map
         (fn [[id db_id schema]]
           {:id (to-int id)
            :db_id (to-int db_id)
            :schema schema})
         (query-stats api-key "metabase_table" instance-id))

        metabase_database
        (map
         (fn [[id]]
           {:id (to-int id)})
         (query-stats api-key "metabase_database" instance-id))

        permissions_group
        (map
         (fn [[id group-name]]
           {:id (to-int id)
            :name group-name})
         (query-stats api-key "permissions_group" instance-id))

        sandboxes
        (map
         (fn [[id group-id table-id]]
           {:id (to-int id)
            :group_id (to-int group-id)
            :table_id (to-int table-id)})
         (query-stats api-key "sandboxes" instance-id))]
    {instance-id
     {"permissions" (distinct permissions)
      "metabase_table" (dedupe-on-id metabase_table)
      "metabase_database" (dedupe-on-id metabase_database)
      "permissions_group" (dedupe-on-id permissions_group)
      "sandboxes" (dedupe-on-id sandboxes)}}))

(defn remove-native-from-download
  "Native download perms are inferred during enforcement and not stored in the DB, so they don't show up in the new graph.
   This is an intentional change, but it means we have to remove them from the old graph to compare them."
  [graph]
  (update graph :groups
          (fn [groups]
            (into {} (map (fn [[group-id dbs]]
                            [group-id (into {} (map (fn [[db-id db-map]]
                                                      [db-id (if (get db-map :download)
                                                               (update db-map :download dissoc :native)
                                                               db-map)])
                                                    dbs))])
                          groups)))))

;; Replace with your API key
(def api-key nil)

;; Replace with the instance
(def instance-id nil)

(deftest data-permissions-cloud-migration-test
  (testing "Data permissions migrations do not error on cloud data"
    (mt/with-premium-features #{:advanced-permissions :sandboxes}
      (when-not instance-id
        (throw (Exception. "You must set an instance-id to run this test")))
      (log/info (format "Fetching test data from hosting insights for instance %s" instance-id))
      (let [test-data (fetch-hosting-insights-for-instance instance-id api-key)]
        (doseq [[_ table-definitions] test-data]
          (impl/test-migrations ["v50.2024-01-04T13:52:51" "v50.2024-01-10T03:27:34"] [migrate!]
            (t2/delete! :metabase_database)
            (t2/delete! :metabase_table)
            (t2/delete! :permissions_group)
            (t2/delete! :permissions)
            (t2/delete! :sandboxes)
            (t2/insert! :metabase_database (map
                                            (fn [db]
                                              (assoc db
                                                     :name       (str (java.util.UUID/randomUUID))
                                                     :details    "{}"
                                                     :engine     "postgres"
                                                     :created_at :%now
                                                     :updated_at :%now))
                                            (table-definitions "metabase_database")))
            (t2/insert! :metabase_table    (map
                                            (fn [table]
                                              (assoc table
                                                     :name       (str (java.util.UUID/randomUUID))
                                                     :created_at :%now
                                                     :updated_at :%now
                                                     :active     true))
                                            (table-definitions "metabase_table")))
            (t2/insert! :permissions_group (table-definitions "permissions_group"))
            (t2/insert! :permissions (table-definitions "permissions"))
            (t2/insert! :sandboxes (table-definitions "sandboxes"))
            (let [old-graph (remove-native-from-download (perms/data-perms-graph))]
              (migrate!)
              (is (= old-graph (data-perms.graph/api-graph {:audit? true})))
              (migrate! :down 49)
              (migrate!)
              (is (= old-graph (data-perms.graph/api-graph {:audit? true}))))))))))
