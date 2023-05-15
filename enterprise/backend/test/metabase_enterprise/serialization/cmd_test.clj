(ns ^:mb/once metabase-enterprise.serialization.cmd-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.load :as load]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase.cmd :as cmd]
   [metabase.models :refer [Card Dashboard DashboardCard Database User]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)))

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
    (mt/with-empty-h2-app-db
      ;; create a single dummy User to own a Card and a Database for it to reference
      (let [user (t2/insert! (t2/table-name User)
                   :email        "nobody@nowhere.com"
                   :first_name   (mt/random-name)
                   :last_name    (mt/random-name)
                   :password     (str (UUID/randomUUID))
                   :date_joined  :%now
                   :is_active    true
                   :is_superuser true)
            db   (t2/insert! (t2/table-name Database)
                   :name       "Test Database"
                   :engine     "h2"
                   :details    "{}"
                   :created_at :%now
                   :updated_at :%now)]
        ;; then the card itself
        (t2/insert! (t2/table-name Card)
          :name                   "Single Card"
          :display                "Single Card"
          :database_id            (u/the-id db)
          :dataset_query          "{}"
          :creator_id             (u/the-id user)
          :visualization_settings "{}"
          :parameters             "[]"
          :parameter_mappings     "[]"
          :created_at             :%now
          :updated_at             :%now)
        ;; serialize "everything" (which should just be the card and user), which should succeed if #16931 is fixed
        (is (nil? (cmd/dump (ts/random-dump-dir "serdes-"))))))))

(deftest blank-target-db-test
  (testing "Loading a dump into an empty app DB still works (#16639)"
    (let [dump-dir                 (ts/random-dump-dir "serdes-")
          user-pre-insert-called?  (atom false)]
      (log/infof "Dumping to %s" dump-dir)
      (cmd/dump dump-dir "--user" "crowberto@metabase.com")
      (mt/with-empty-h2-app-db
        (with-redefs [load/pre-insert-user  (fn [user]
                                              (reset! user-pre-insert-called? true)
                                              (assoc user :password "test-password"))]
          (cmd/load dump-dir "--mode"     "update"
                             "--on-error" "abort")
          (is (true? @user-pre-insert-called?)))))))

(deftest mode-update-remove-cards-test
  (testing "--mode update should remove Cards in a Dashboard if they're gone from the serialized YAML (#20786)"
    (ts/with-random-dump-dir [dump-dir "serialization"]
      (let [dashboard-yaml-filename (str dump-dir "/collections/root/dashboards/Dashboard.yaml")]
        (ts/with-source-and-dest-dbs
          (testing "create 2 questions in the source and add them to a dashboard"
            (ts/with-source-db
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
            (ts/with-dest-db
              (testing "Create admin user"
                (is (some? (ts/create! User, :is_superuser true)))
                (is (t2/exists? User :is_superuser true)))
              (is (nil? (cmd/load dump-dir "--on-error" "abort")))
              (testing "verify that things were loaded as expected"
                (is (= 1 (t2/count Dashboard)) "# Dashboards")
                (is (= 2 (t2/count Card)) "# Cards")
                (is (= 2 (t2/count DashboardCard)) "# DashboardCards")>)))
          (testing "remove one of the questions in the source's dashboard"
            (ts/with-source-db
              (t2/delete! Card :name "Card_2")
              (is (= 1 (t2/count Card)) "# Cards")
              (is (= 1 (t2/count DashboardCard)) "# DashboardCards")))
          (testing "dump again"
            (ts/with-source-db
              (cmd/dump dump-dir))
            (testing "Verify dump only contains one Card"
              (is (.exists (io/file dashboard-yaml-filename)))
              (when-let [yaml (yaml/from-file dashboard-yaml-filename)]
                (is (partial= {:dashboard_cards [{:card_id "/collections/root/cards/Card_1"}]}
                              yaml)))))
          (testing "load again, with --mode update, destination Dashboard should now only have one question."
            (ts/with-dest-db
              (is (nil? (cmd/load dump-dir "--mode" "update", "--on-error" "abort")))
              (is (= 1 (t2/count Dashboard)) "# Dashboards")
              (testing "Don't delete the Card even tho it was deleted. Just delete the DashboardCard"
                (is (= 2 (t2/count Card)) "# Cards"))
              (is (= 1 (t2/count DashboardCard)) "# DashboardCards"))))))))
