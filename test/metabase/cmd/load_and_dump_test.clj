(ns metabase.cmd.load-and-dump-test
  (:require [clojure.java.io :as io]
            [clojure.java.jdbc :as jdbc]
            [clojure.test :refer :all]
            [metabase.cmd.compare-h2-dbs :as compare-h2-dbs]
            [metabase.cmd.copy.h2 :as h2]
            [metabase.cmd.dump-to-h2 :as dump-to-h2]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.setup :as mdb.setup]
            [metabase.db.spec :as db.spec]
            [metabase.driver :as driver]
            [metabase.cmd.refresh-integration-test-db-metadata :as refresh]
            [metabase.models
             :refer
             [Activity
              Card
              CardFavorite
              Collection
              CollectionRevision
              Dashboard
              DashboardCard
              DashboardFavorite
              Database
              Dimension
              Field
              FieldValues
              Metric
              MetricImportantField
              NativeQuerySnippet
              Pulse
              PulseCard
              PulseChannel
              PulseChannelRecipient
              Segment
              Table
              User]]
            [metabase.models.setting :as setting]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.generate :as mtg]
            [metabase.util.i18n.impl :as i18n.impl]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- insert-with-overrides
  ([table]
   (db/insert! table (tt/with-temp-defaults table)))
  ([table & overrides]
   (db/insert! table (apply assoc (tt/with-temp-defaults table) overrides))))

(defn load-it! []
  (let [db (insert-with-overrides Database)
        user (insert-with-overrides User)

        ;; permissions-group (db/insert! PermissionsGroup (tt/with-temp-defaults PermissionsGroup))
        ;; permissions-group-membership (db/insert! PermissionsGroupMembership
        ;;                                {:user_id (:id user)}
        ;;                                :group_id (:id permissions-group))

        ;; db_fks
        table (insert-with-overrides Table :db_id (:id db))

        field (insert-with-overrides Field :table_id (:id table))

        metric (insert-with-overrides Metric
                                      :table_id (:id table)
                                      :creator_id (:id user))

        ;; table_fks
        field_value (insert-with-overrides FieldValues :field_id (:id field))

        dimension (insert-with-overrides Dimension :field_id (:id field))

        important_field (insert-with-overrides MetricImportantField
                                               :field_id (:id field)
                                               :metric_id (:id metric))

        ;; db+user_fks
        segment (insert-with-overrides Segment
                                       :table_id (:id table)
                                       :creator_id (:id user))

        collection (insert-with-overrides Collection
                                          :personal_owner_id (:id user))

        snippets-collection (insert-with-overrides Collection :namespace :snippets)

        collection-revision (insert-with-overrides CollectionRevision
                                                   :user_id (:id user))

        native-query-snippet (insert-with-overrides NativeQuerySnippet
                                                    :creator_id (:id user)
                                                    :collection_id (:id snippets-collection))
        ;; already present in the default db, but I couldn't get to insert into it. Also, it might not be a good idea
        ;; in case other tests rely on that db having a particular shape
        activity (insert-with-overrides Activity :user_id (:id user))

        card (insert-with-overrides Card
                                    :creator_id (:id user)
                                    :database_id (:id db)
                                    :table_id (:id table)
                                    :collection_id (:id collection))

        card-favorite (insert-with-overrides CardFavorite
                                             :owner_id (:id user)
                                             :card_id (:id card))
        dashboard (insert-with-overrides Dashboard
                                         :creator_id (:id user)
                                         :collection_id (:id collection))
        dashboard-card (insert-with-overrides DashboardCard
                                              :card_id (:id card)
                                              :dashboard_id (:id dashboard))
        dashboard-favorite (insert-with-overrides DashboardFavorite
                                                  :user_id (:id user)
                                                  :dashboard_id (:id dashboard))

        pulse (insert-with-overrides Pulse :creator_id (:id user) :collection_id (:id collection))
        pulse-card (insert-with-overrides PulseCard
                                          :pulse_id (:id pulse)
                                          :card_id (:id card)
                                          :dashboard_card_id (:id dashboard-card))
        pulse-channel (insert-with-overrides PulseChannel :pulse_id (:id pulse))
        pulse-channel-recipient (insert-with-overrides PulseChannelRecipient
                                                       :pulse_channel_id (:id pulse-channel)
                                                       :user_id (:id user))

        ;; ;; 404 not found entities
        ;; label (db/insert! Label (assoc (tt/with-temp-defaults Label)))
        ;; card-label (db/insert! CardLabel (assoc (tt/with-temp-defaults CardLabel
        ;;                                           :label_id (:id label))))

        ]
    (println "POPULATED!")))

(defn load-a-bunch-of-data! [h2-file jdbc-spec]
  ;; (h2/delete-existing-h2-database-files! h2-file)
  (binding [mdb.connection/*db-type*   :h2
            mdb.connection/*jdbc-spec* jdbc-spec
            db/*db-connection*         jdbc-spec
            db/*quoting-style*         (mdb.connection/quoting-style :h2)
            setting/*disable-cache*    true]
    (with-redefs [i18n.impl/site-locale-from-setting-fn (atom (constantly false))]
      (refresh/refresh-integration-test-db-metadata)
      (mdb.setup/setup-db! :h2 jdbc-spec true)
      (mtg/generate-data!))))

(defn populate-h2-db! [file-name]
  (let [spec {:subprotocol "h2"
              :subname     (format "file:%s" file-name)
              :classname   "org.h2.Driver"}]
    (println "activities pre- populate" (jdbc/query spec ["SELECT count(*) FROM activity;"]))
    (load-a-bunch-of-data! file-name spec)
    (println "activities post- populate" (jdbc/query spec ["SELECT count(*) FROM activity;"]))))

(defn- abs-path
  [path]
  (.getAbsolutePath (io/file path)))

(deftest load-and-dump-test
  (testing "loading data to h2 and porting to DB and migrating back to H2"
    (let [h2-fixture-db-file (abs-path "frontend/test/__runner__/test_db_fixture.db")
          h2-file            (abs-path "/tmp/out.db")
          db-name            "dump-test"]

      (populate-h2-db! h2-fixture-db-file)
      (mt/test-drivers #{:h2 :postgres}
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
          (println "load-from-h2! done")
          (dump-to-h2/dump-to-h2! h2-file)
          (is (not (compare-h2-dbs/different-contents?
                    h2-file
                    h2-fixture-db-file)))))
      )))
