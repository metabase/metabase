(ns ^:mb/once metabase-enterprise.serialization.cmd-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.load :as load]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.cmd :as cmd]
   [metabase.models :refer [Card Collection Dashboard DashboardCard Database
                            User]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.initialize.test-users :as test-users]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest no-collections-test
  (testing "Dumping a card when there are no active collection should work properly (#16931)"
    ;; we need a blank H2 app db, temporarily, in order to run this test (to ensure we have no collections present,
    ;; while also not deleting or messing with any existing user personal collections that the real app DB might have,
    ;; since that will interfere with other tests)
    ;;
    ;; making use of the functionality in the [[metabase.db.schema-migrations-test.impl]] namespace for this (since it
    ;; already does what we need)
    (mt/with-premium-features #{:serialization}
      (mt/with-empty-h2-app-db
        ;; create a single dummy User to own a Card and a Database for it to reference
        (let [user  (t2/insert! (t2/table-name User)
                                :email        "nobody@nowhere.com"
                                :first_name   (mt/random-name)
                                :last_name    (mt/random-name)
                                :password     (str (random-uuid))
                                :date_joined  :%now
                                :is_active    true
                                :is_superuser true)
              db-id (first (t2/insert-returning-pks!
                            (t2/table-name Database)
                            :name       "Test Database"
                            :engine     "h2"
                            :details    "{}"
                            :created_at :%now
                            :updated_at :%now))]
          ;; then the card itself

          (t2/insert! (t2/table-name Card)
                      :name                   "Single Card"
                      :display                "Single Card"
                      :database_id            db-id
                      :dataset_query          "{}"
                      :creator_id             (u/the-id user)
                      :visualization_settings "{}"
                      :parameters             "[]"
                      :parameter_mappings     "[]"
                      :created_at             :%now
                      :updated_at             :%now)
          ;; serialize "everything" (which should just be the card and user), which should succeed if #16931 is fixed
          (is (nil? (cmd/dump (ts/random-dump-dir "serdes-")))))))))

(deftest blank-target-db-test
  (testing "Loading a dump into an empty app DB still works (#16639)"
    (mt/with-premium-features #{:serialization}
      (ts/with-dbs [source-db dest-db]
        (let [dump-dir                 (ts/random-dump-dir "serdes-")
              user-pre-insert-called?  (atom false)]
          (log/infof "Dumping to %s" dump-dir)
          (ts/with-db source-db
            (test-users/init!)
            (ts/create! :model/Collection :name "My_Collection")
            (cmd/dump dump-dir "--user" "crowberto@metabase.com"))
          (ts/with-db dest-db
            (with-redefs [load/pre-insert-user (fn [user]
                                                 (reset! user-pre-insert-called? true)
                                                 (assoc user :password "test-password"))]
              (cmd/load dump-dir "--mode"     "update"
                        "--on-error" "abort")
              (is (true? @user-pre-insert-called?)))))))))

(deftest mode-update-remove-cards-test
  (testing "--mode update should remove Cards in a Dashboard if they're gone from the serialized YAML (#20786)"
    (mt/with-premium-features #{:serialization}
      (ts/with-random-dump-dir [dump-dir "serialization"]
        (let [dashboard-yaml-filename (str dump-dir "/collections/root/dashboards/Dashboard.yaml")]
          (ts/with-dbs [source-db dest-db]
            (testing "create 2 questions in the source and add them to a dashboard"
              (ts/with-db source-db
                (let [{db-id :id, :as db} (ts/create! Database :name "My_Database")]
                  (mt/with-db db
                    (let [{user-id :id}      (ts/create! User, :is_superuser true)
                          {card-1-id :id}    (ts/create! Card
                                                         :database_id   db-id
                                                         :creator_id    user-id
                                                         :name          "Card_1"
                                                         :dataset_query {:database db-id, :type :native, :native {:query "SELECT 1;"}})
                          {card-2-id :id}    (ts/create! Card
                                                         :database_id   db-id
                                                         :creator_id    user-id
                                                         :name          "Card_2"
                                                         :dataset_query {:database db-id, :type :native, :native {:query "SELECT 1;"}})
                          {dashboard-id :id} (ts/create! Dashboard, :creator_id user-id, :name "Dashboard")]
                      (doseq [card-id [card-1-id card-2-id]]
                        (ts/create! DashboardCard :dashboard_id dashboard-id, :card_id card-id))
                      (testing "dump in source"
                        (is (nil? (cmd/dump dump-dir)))))))))
            (testing "verify the Dashboard was dumped as expected"
              (is (.exists (io/file dashboard-yaml-filename)))
              (let [yaml (yaml/from-file dashboard-yaml-filename)]
                (is (partial= {:dashboard_cards [{:card_id "/collections/root/cards/Card_1"}
                                                 {:card_id "/collections/root/cards/Card_2"}]}
                              yaml))))
            (testing "load into destination"
              (ts/with-db dest-db
                (testing "Create admin user"
                  (is (some? (ts/create! User, :is_superuser true)))
                  (is (t2/exists? User :is_superuser true)))
                (is (nil? (cmd/load dump-dir "--on-error" "abort")))
                (testing "verify that things were loaded as expected"
                  (is (= 1 (t2/count Dashboard)) "# Dashboards")
                  (is (= 2 (t2/count Card)) "# Cards")
                  (is (= 2 (t2/count DashboardCard)) "# DashboardCards") >)))
            (testing "remove one of the questions in the source's dashboard"
              (ts/with-db source-db
                (t2/delete! Card :name "Card_2")
                (is (= 1 (t2/count Card)) "# Cards")
                (is (= 1 (t2/count DashboardCard)) "# DashboardCards")))
            (testing "dump again"
              (ts/with-db source-db
                (cmd/dump dump-dir))
              (testing "Verify dump only contains one Card"
                (is (.exists (io/file dashboard-yaml-filename)))
                (when-let [yaml (yaml/from-file dashboard-yaml-filename)]
                  (is (partial= {:dashboard_cards [{:card_id "/collections/root/cards/Card_1"}]}
                                yaml)))))
            (testing "load again, with --mode update, destination Dashboard should now only have one question."
              (ts/with-db dest-db
                (is (nil? (cmd/load dump-dir "--mode" "update", "--on-error" "abort")))
                (is (= 1 (t2/count Dashboard)) "# Dashboards")
                (testing "Don't delete the Card even tho it was deleted. Just delete the DashboardCard"
                  (is (= 2 (t2/count Card)) "# Cards"))
                (is (= 1 (t2/count DashboardCard)) "# DashboardCards")))))))))

(deftest premium-features-test
  (testing "without a premium token"
    (mt/with-premium-features #{}
      (ts/with-random-dump-dir [dump-dir "serdes-"]
        (testing "dump should fail"
          (is (thrown-with-msg? Exception #"Please upgrade"
                                (cmd/dump dump-dir "--user" "crowberto@metabase.com"))))

        (testing "load should fail"
          (mt/with-empty-h2-app-db
            (is (thrown-with-msg? Exception #"Please upgrade"
                                  (cmd/load dump-dir
                                            "--mode"     "update"
                                            "--on-error" "abort")))))))))

(deftest dump-readonly-dir-test
  (testing "command exits early when destination is not writable"
    (mt/with-premium-features #{:serialization}
      (ts/with-random-dump-dir [dump-dir "serdesv2-"]
        (.mkdirs (io/file dump-dir))
        (.setWritable (io/file dump-dir) false)
        (with-redefs [v2.extract/extract (fn [& _args]
                                           (throw (ex-info "Do not call me!" {})))]
          (is (thrown-with-msg? Exception #"Destination path is not writeable: "
                                (cmd/export dump-dir))))))))

(deftest snowplow-events-test
  (testing "Snowplow events are correctly sent"
    (mt/with-premium-features #{:serialization}
      (mt/with-empty-h2-app-db
        (snowplow-test/with-fake-snowplow-collector
          (ts/with-random-dump-dir [dump-dir "serdesv2-"]
            (let [coll  (ts/create! Collection :name "coll")
                  _card (ts/create! Card :name "card" :collection_id (:id coll))]
              (cmd/export dump-dir "--collection" (str (:id coll)) "--no-data-model")
              (testing "Snowplow export event was sent"
                (is (=? {"event"           "serialization"
                         "direction"       "export"
                         "collection"      (str (:id coll))
                         "all_collections" false
                         "data_model"      false
                         "settings"        true
                         "field_values"    false
                         "duration_ms"     pos?
                         "count"           3
                         "source"          "cli"
                         "secrets"         false
                         "success"         true
                         "error_message"   nil}
                        (->> (map :data (snowplow-test/pop-event-data-and-user-id!))
                             (filter #(= "serialization" (get % "event")))
                             first))))

              (cmd/import dump-dir)
              (testing "Snowplow import event was sent"
                (is (=? {"event"         "serialization"
                         "direction"     "import"
                         "duration_ms"   pos?
                         "source"        "cli"
                         "models"        "Card,Collection,Setting"
                         "count"         3
                         "success"       true
                         "error_message" nil}
                        (-> (snowplow-test/pop-event-data-and-user-id!) first :data))))

              (with-redefs [v2.storage/store-settings! (fn [_opts _settings]
                                                         (throw (Exception. "Cannot load settings")))]
                (is (thrown? Exception
                             (cmd/export dump-dir "--collection" (str (:id coll)) "--no-data-model")))
                (testing "Snowplow export event about error was sent"
                  (is (=? {"event"           "serialization"
                           "direction"       "export"
                           "collection"      (str (:id coll))
                           "all_collections" false
                           "data_model"      false
                           "settings"        true
                           "field_values"    false
                           "duration_ms"     pos?
                           "count"           0
                           "source"          "cli"
                           "secrets"         false
                           "success"         false
                           "error_message"   "java.lang.Exception: Cannot load settings"}
                          (->> (map :data (snowplow-test/pop-event-data-and-user-id!))
                               (filter #(= "serialization" (get % "event")))
                               first)))))

              (let [load-one! @#'v2.load/load-one!]
                (with-redefs [v2.load/load-one! (fn [ctx path]
                                                  (when (= "Collection" (-> path first :model))
                                                    (throw (Exception. "Cannot import Collection")))
                                                  (load-one! ctx path))]
                  (is (thrown? Exception
                               (cmd/import dump-dir)))
                  (testing "Snowplow import event about error was sent"
                    (is (=? {"event"         "serialization"
                             "direction"     "import"
                             "duration_ms"   pos?
                             "source"        "cli"
                             "models"        ""
                             "count"         0
                             "success"       false
                             ;; t2/with-transactions re-wraps errors with data about toucan connections
                             "error_message" #".*Cannot import Collection.*"}
                            (-> (snowplow-test/pop-event-data-and-user-id!) first :data)))))))))))))

(deftest entity-id-dump&load-test
  (let [entity-ids* (atom {})
        eid-map     #(into {} (map (juxt :name :entity_id) %))]
    (testing "--include-entity-id should include entity ids in serialization"
      (mt/with-premium-features #{:serialization}
        (ts/with-random-dump-dir [dump-dir "serialization"]
          (ts/with-dbs [source-db dest-db]
             (testing "create 2 questions in a dashboard"
               (ts/with-db source-db
                 (let [db   (ts/create! Database)
                       dash (ts/create! Dashboard)
                       c1   (ts/create! Card {:name          "card1"
                                              :database_id   (:id db)
                                              :dataset_query {:database (:id db), :type :native, :native {:query "SELECT 1;"}}})
                       c2   (ts/create! Card {:name          "card2"
                                              :database_id   (:id db)
                                              :dataset_query {:database (:id db), :type :native, :native {:query "SELECT 1;"}}})
                       _    (ts/create! DashboardCard {:dashboard_id (:id dash) :card_id (:id c1)})
                       _    (ts/create! DashboardCard {:dashboard_id (:id dash) :card_id (:id c2)})]
                   (testing "initial dump"
                     (is (nil? (cmd/dump dump-dir))))
                   (testing "storing original entity ids"
                     (is (reset! entity-ids* (eid-map [c1 c2])))))))
             (testing "initial load"
               (ts/with-db dest-db
                 (is (some? (ts/create! User, :is_superuser true)))
                 (is (nil? (cmd/load dump-dir "--on-error" "abort")))
                 (testing "verify that entities got their own entity_id"
                   (is (not= @entity-ids*
                             (eid-map (t2/select Card)))))))
             (testing "creating dump with entity ids included"
               (ts/with-db source-db
                 (is (nil? (cmd/dump dump-dir "--include-entity-id")))))
             (testing "loading dump with entity ids will overwrite new entity ids with original ones"
               (ts/with-db dest-db
                 (is (nil? (cmd/load dump-dir "--on-error" "abort" "--mode" "update")))
                 (is (= @entity-ids*
                        (eid-map (t2/select Card))))))))))))
