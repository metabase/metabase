(ns metabase.cmd.load-and-dump-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase.cmd.compare-h2-dbs :as compare-h2-dbs]
            [metabase.cmd.copy.h2 :as h2]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.setup :as mdb.setup]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.models :refer [Database Table Field FieldValues Metric Dimension
            MetricImportantField Segment Collection CollectionRevision NativeQuerySnippet Activity]]
            [metabase.models.setting :as setting]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util.i18n.impl :as i18n.impl]
            [toucan.db :as db]
            [toucan.util.test :as tt]))


(defn load-it! []
  (let [db (db/insert! Database (tt/with-temp-defaults Database))
        user (db/insert! User (tt/with-temp-defaults User))

        ;; db_fks
        table (db/insert! Table (assoc (tt/with-temp-defaults Table)
                                       :db_id (:id db)))
        field (db/insert! Field (assoc (tt/with-temp-defaults Field)
                                       :table_id (:id table)))
        metric (db/insert! Metric (assoc (tt/with-temp-defaults Metric)
                                       :table_id (:id table)))


        ;; table_fks
        field_value (db/insert! FieldValues (assoc (tt/with-temp-defaults FieldValues)
                                                   :field_id (:id field)))
        dimension (db/insert! Dimension (assoc (tt/with-temp-defaults Dimension)
                                               :field_id (:id field)))
        important_field (db/insert! MetricImportantField (assoc (tt/with-temp-defaults MetricImportantField)
                                                          :field_id (:id field)
                                                          :metric_id (:id metric)))

        ;; db+user_fks
        segment (db/insert! Segment (assoc (tt/with-temp-defaults Segment)
                                           :table_id (:id table)
                                           :creator_id (:id user)))

        collection (db/insert! Collection (assoc (tt/with-temp-defaults Collection)
                                                 :personal_owner_id (:id user)))

        snippets-collection (db/insert! Collection (assoc (tt/with-temp-defaults Collection)
                                                          :namespace :snippets))

        collection-revision (db/insert! CollectionRevision (assoc (tt/with-temp-defaults CollectionRevision)
                                                                  :user_id (:id user)))

        native-query-snippet (db/insert! NativeQuerySnippet (assoc (tt/with-temp-defaults NativeQuerySnippet)
                                                                   :creator_id (:id user)
                                                                   :collection_id (:id snippets-collection)))

        ;; ;; already present in the default db, but I couldn't get to insert into it. Also, it might not be a good idea
        ;; ;; in case other tests rely on that db having a particular shape
        ;; activity (db/insert! Activity (assoc (tt/with-temp-defaults Activity)
        ;;                                      :user_id (:id user)))

        ;; ;; 404 not found entities
        ;; label (db/insert! Label (assoc (tt/with-temp-defaults Label)))
        ;; card-label (db/insert! CardLabel (assoc (tt/with-temp-defaults CardLabel
        ;;                                           :label_id (:id label))))

        ]
    (println "POPULATED!")))

(defn load-a-bunch-of-data! [h2-file jdbc-spec]
  (h2/delete-existing-h2-database-files! h2-file)
  (binding [mdb.connection/*db-type*   :h2
            mdb.connection/*jdbc-spec* jdbc-spec
            db/*db-connection*         jdbc-spec
            db/*quoting-style*         (mdb.connection/quoting-style :h2)
            setting/*disable-cache*    true]
    (with-redefs [i18n.impl/site-locale-from-setting-fn (atom (constantly false))]
      (mdb.setup/setup-db! :h2 jdbc-spec true)
      (load-it!))))

(defn x []
  (let [spec {:subprotocol "h2"
              :subname     "file:/tmp/my_db.db"
              :classname   "org.h2.Driver"}]
    (load-a-bunch-of-data! "/tmp/my_db.db" spec)
    (jdbc/query spec ["SELECT * FROM metabase_table;"])))

(defn populate-h2-db! [file-name]
  (let [spec {:subprotocol "h2"
              :subname     (format "file:%s" file-name)
              :classname   "org.h2.Driver"}]
    (load-a-bunch-of-data! file-name spec)
    (jdbc/query spec ["SELECT * FROM metabase_table;"])))



(defn- abs-path
  [path]
  (.getAbsolutePath (io/file path)))

(deftest load-and-dump-test
  (testing "loading data to h2 and porting to DB and migrating back to H2"
    (let [h2-fixture-db-file (abs-path "/tmp/my_db.db")
          ;; (abs-path "frontend/test/__runner__/test_db_fixture.db")
          h2-file            (abs-path "/tmp/out.db")
          db-name            "dump-test"]
      (h2/delete-existing-h2-database-files! h2-fixture-db-file)
      (populate-h2-db! h2-fixture-db-file)
      (mt/test-drivers #{:postgres :mysql :h2}
        (h2/delete-existing-h2-database-files! h2-file)
        (binding [mdb.connection/*db-type*   driver/*driver*
                  mdb.connection/*jdbc-spec* (if (= driver/*driver* :h2)
                                               {:subprotocol "h2"
                                                :subname     (format "mem:%s;DB_CLOSE_DELAY=10" (mt/random-name))
                                                :classname   "org.h2.Driver"}
                                               (let [details (tx/dbdef->connection-details driver/*driver*
                                                                                           :db {:database-name db-name})]
                                                 ((case driver/*driver*
                                                    :postgres db.spec/postgres
                                                    :mysql    db.spec/mysql) details)))]
          (when-not (= driver/*driver* :h2)
            (tx/create-db! driver/*driver* {:database-name db-name}))
          (load-from-h2/load-from-h2! h2-fixture-db-file)
          (dump-to-h2/dump-to-h2! h2-file)
          (is (not (compare-h2-dbs/different-contents?
                    h2-file
                    h2-fixture-db-file))))))))
