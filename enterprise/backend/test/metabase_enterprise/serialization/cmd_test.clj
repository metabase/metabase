(ns metabase-enterprise.serialization.cmd-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [metabase-enterprise.serialization.load :as load]
            [metabase.cmd :as cmd]
            [metabase.db :as mdb]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.db.schema-migrations-test.impl :as schema-migrations-test.impl]
            [metabase.models :refer [Card Dashboard DashboardCard Database User]]
            [metabase.models.permissions-group :as perms-group]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as t.test]
            [yaml.core :as yaml])
  (:import java.util.UUID))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defmacro ^:private with-empty-h2-app-db
  "Runs `body` under a new, blank, H2 application database (randomly named), in which all model tables have been
  created via Liquibase schema migrations. After `body` is finished, the original app DB bindings are restored.

  Makes use of functionality in the [[metabase.db.schema-migrations-test.impl]] namespace since that already does what
  we need."
  [& body]
  `(schema-migrations-test.impl/with-temp-empty-app-db [conn# :h2]
     (schema-migrations-test.impl/run-migrations-in-range! conn# [0 "v99.00-000"]) ; this should catch all migrations)
     ;; since the actual group defs are not dynamic, we need with-redefs to change them here
     (with-redefs [perms-group/all-users (#'perms-group/magic-group perms-group/all-users-group-name)
                   perms-group/admin     (#'perms-group/magic-group perms-group/admin-group-name)]
       ~@body)))

(defn- random-dump-dir []
  (str (System/getProperty "java.io.tmpdir") "/" (mt/random-name)))

(deftest no-collections-test
  (testing "Dumping a card when there are no active collection should work properly (#16931)"
    ;; we need a blank H2 app db, temporarily, in order to run this test (to ensure we have no collections present,
    ;; while also not deleting or messing with any existing user personal collections that the real app DB might have,
    ;; since that will interfere with other tests)
    ;;
    ;; making use of the functionality in the [[metabase.db.schema-migrations-test.impl]] namespace for this (since it
    ;; already does what we need)
    (with-empty-h2-app-db
      ;; create a single dummy User to own a Card and a Database for it to reference
      (let [user (db/simple-insert! User
                   :email        "nobody@nowhere.com"
                   :first_name   (mt/random-name)
                   :last_name    (mt/random-name)
                   :password     (str (UUID/randomUUID))
                   :date_joined  :%now
                   :is_active    true
                   :is_superuser true)
            db   (db/simple-insert! Database
                   :name       "Test Database"
                   :engine     "h2"
                   :details    "{}"
                   :created_at :%now
                   :updated_at :%now)]
        ;; then the card itself
        (db/simple-insert! Card
          :name                   "Single Card"
          :display                "Single Card"
          :database_id            (u/the-id db)
          :dataset_query          "{}"
          :creator_id             (u/the-id user)
          :visualization_settings "{}"
          :parameters             "[]"
          :created_at             :%now
          :updated_at             :%now)
        ;; serialize "everything" (which should just be the card and user), which should succeed if #16931 is fixed
        (is (nil? (cmd/dump (random-dump-dir))))))))

(deftest blank-target-db-test
  (testing "Loading a dump into an empty app DB still works (#16639)"
    (let [dump-dir                 (random-dump-dir)
          user-pre-insert-called?  (atom false)]
      (log/infof "Dumping to %s" dump-dir)
      (cmd/dump dump-dir "--user" "crowberto@metabase.com")
      (with-empty-h2-app-db
        (with-redefs [load/pre-insert-user  (fn [user]
                                              (reset! user-pre-insert-called? true)
                                              (assoc user :password "test-password"))]
          (cmd/load dump-dir "--mode"     :update
                             "--on-error" :abort)
          (is (true? @user-pre-insert-called?)))))))

(defn- create! [model & {:as properties}]
  (db/insert! model (merge (t.test/with-temp-defaults model) properties)))

(defn- do-with-in-memory-h2-db [db-name-prefix f]
  (let [db-name           (str db-name-prefix (mt/random-name))
        connection-string (format "jdbc:h2:mem:%s" db-name)
        data-source       (mdb.data-source/raw-connection-string->DataSource connection-string)]
    ;; DB should stay open as long as `conn` is held open.
    (with-open [_conn (.getConnection data-source)]
      (letfn [(do-with-app-db [thunk]
                (binding [mdb.connection/*application-db* (mdb.connection/application-db :h2 data-source)]
                  (testing (format "\nApp DB = %s" (pr-str connection-string))
                    (thunk))))]
        (do-with-app-db
         (fn []
           (mdb/setup-db!)))
        (f do-with-app-db)))))

(defn- do-with-source-and-dest-dbs [f]
  (do-with-in-memory-h2-db
   "source-"
   (fn [do-with-source-db]
     (do-with-in-memory-h2-db
      "dest-"
      (fn [do-with-dest-db]
        (f do-with-source-db do-with-dest-db))))))

(defmacro ^:private with-source-and-dest-dbs
  "Creates and sets up two in-memory H2 application databases, a source database and an application database. For
  testing load/dump/serialization stuff. To use the source DB, use [[with-source-db]], which makes binds it as the
  current application database; [[with-dest-db]] binds the destination DB as the current application database."
  {:style/indent 0}
  [& body]
  ;; this is implemented by introducing the anaphors `&do-with-source-db` and `&do-with-dest-db` which are used by
  ;; [[with-source-db]] and [[with-dest-db]]
  `(do-with-source-and-dest-dbs
    (fn [~'&do-with-source-db ~'&do-with-dest-db]
      ~@body)))

(defmacro ^:private with-source-db
  "For use with [[with-source-and-dest-dbs]]. Makes the source DB the current application database."
  {:style/indent 0}
  [& body]
  `(~'&do-with-source-db (fn [] ~@body)))

(defmacro ^:private with-dest-db
  "For use with [[with-source-and-dest-dbs]]. Makes the destination DB the current application database."
  {:style/indent 0}
  [& body]
  `(~'&do-with-dest-db (fn [] ~@body)))

(defn- do-with-random-dump-dir [f]
  (let [dump-dir (random-dump-dir)]
    (testing (format "\nDump dir = %s" (pr-str dump-dir))
      (try
        (f dump-dir)
        (finally
          (when (.exists (io/file dump-dir))
            (.delete (io/file dump-dir))))))))

(defmacro ^:private with-random-dump-dir {:style/indent 1} [[dump-dir-binding] & body]
  `(do-with-random-dump-dir (fn [~dump-dir-binding] ~@body)))

(deftest mode-update-remove-cards-test
  (testing "--mode update should remove Cards in a Dashboard if they're gone from the serialized YAML (#20786)"
    (with-random-dump-dir [dump-dir]
      (let [dashboard-yaml-filename (str dump-dir "/collections/root/dashboards/Dashboard.yaml")]
        (with-source-and-dest-dbs
          (testing "create 2 questions in the source and add them to a dashboard"
            (with-source-db
              (let [{db-id :id, :as db} (create! Database :name "My_Database")]
                (mt/with-db db
                  (let [{user-id :id}      (create! User, :is_superuser true)
                        {card-1-id :id}    (create! Card
                                                    :database_id   db-id
                                                    :creator_id    user-id
                                                    :name          "Card_1"
                                                    :dataset_query {:database db-id, :type :native, :native {:query "SELECT 1;"}})
                        {card-2-id :id}    (create! Card
                                                    :database_id   db-id
                                                    :creator_id    user-id
                                                    :name          "Card_2"
                                                    :dataset_query {:database db-id, :type :native, :native {:query "SELECT 1;"}})
                        {dashboard-id :id} (create! Dashboard, :creator_id user-id, :name "Dashboard")]
                    (doseq [card-id [card-1-id card-2-id]]
                      (create! DashboardCard :dashboard_id dashboard-id, :card_id card-id))
                    (testing "dump in source"
                      (is (nil? (cmd/dump dump-dir)))))))))
          (testing "verify the Dashboard was dumped as expected"
            (is (.exists (io/file dashboard-yaml-filename)))
            (let [yaml (yaml/from-file dashboard-yaml-filename)]
              (is (partial= {:dashboard_cards [{:card_id "/collections/root/cards/Card_1"}
                                               {:card_id "/collections/root/cards/Card_2"}]}
                            yaml))))
          (testing "load into destination"
            (with-dest-db
              (testing "Create admin user"
                (is (some? (create! User, :is_superuser true)))
                (is (db/exists? User :is_superuser true)))
              (is (nil? (cmd/load dump-dir "--on-error" :abort)))
              (testing "verify that things were loaded as expected"
                (is (= 1 (db/count Dashboard)) "# Dashboards")
                (is (= 2 (db/count Card)) "# Cards")
                (is (= 2 (db/count DashboardCard)) "# DashboardCards")>)))
          (testing "remove one of the questions in the source's dashboard"
            (with-source-db
              (db/delete! Card :name "Card_2")
              (is (= 1 (db/count Card)) "# Cards")
              (is (= 1 (db/count DashboardCard)) "# DashboardCards")))
          (testing "dump again"
            (with-source-db
              (cmd/dump dump-dir))
            (testing "Verify dump only contains one Card"
              (is (.exists (io/file dashboard-yaml-filename)))
              (when-let [yaml (yaml/from-file dashboard-yaml-filename)]
                (is (partial= {:dashboard_cards [{:card_id "/collections/root/cards/Card_1"}]}
                              yaml)))))
          (testing "load again, with --mode update, destination Dashboard should now only have one question."
            (with-dest-db
              (is (nil? (cmd/load dump-dir "--mode" :update, "--on-error" :abort)))
              (is (= 1 (db/count Dashboard)) "# Dashboards")
              (testing "Don't delete the Card even tho it was deleted. Just delete the DashboardCard"
                (is (= 2 (db/count Card)) "# Cards"))
              (is (= 1 (db/count DashboardCard)) "# DashboardCards"))))))))
