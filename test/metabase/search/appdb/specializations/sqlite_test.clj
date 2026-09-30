(ns metabase.search.appdb.specializations.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.scoring :as appdb.scoring]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.appdb.specialization.sqlite]
   [metabase.search.db :as search.db]
   [metabase.search.scoring :as scoring]
   [toucan2.core :as t2])
  (:import
   (org.sqlite SQLiteDataSource)))

(use-fixtures :each
  (fn [f]
    ;; Keep one connection open: SQLite's in-memory databases are connection-local. Binding the ApplicationDB
    ;; affects only this test thread; the running development application's database is never modified.
    (let [source (doto (SQLiteDataSource.) (.setUrl "jdbc:sqlite::memory:"))]
      (mdb/with-application-db (connection/application-db :sqlite source)
        (t2/with-connection [_conn]
          (f))))))

(defn- entry [id text native]
  (merge {:model "card", :model_id id, :name text, :display_data "{}", :legacy_input "{}"
          :updated_at "2026-09-24 12:00:00.000"}
         (specialization/extra-entry-fields {:name text :searchable_text text :native_query native})))

(deftest index-lifecycle-test
  (search.db/create-search-index-table! :search_index__sqlite)
  (is (search.db/table-exists? "search_index__sqlite"))
  (specialization/batch-upsert! :search_index__sqlite
                                [(entry "1" "CAFÉ, Revenue 100%" "SELECT secret")
                                 (entry "2" "Revenue 1000" nil)
                                 (entry "3" "under_score" nil)])
  (let [matches (fn [term native?]
                  (set (map :model_id (search.db/search-index-rows :search_index__sqlite term native? [:model_id]))))]
    (testing "Unicode case normalization, conjunctions, literal punctuation, native SQL opt-in, and blank searches"
      (is (= #{"1"} (matches "café revenue" false)))
      (is (= #{"1"} (matches "100%" false)))
      (is (= #{"3"} (matches "_" false)))
      (is (= #{} (matches "secret" false)))
      (is (= #{"1"} (matches "secret" true)))
      (is (= #{"1" "2" "3"} (matches "   " false))))
    (testing "Upserts preserve identity and update all searchable text atomically"
      (let [before (search.db/index-row :search_index__sqlite "card" "1")]
        (specialization/batch-upsert! :search_index__sqlite [(entry "1" "New name" nil)])
        (is (= (:id before) (:id (search.db/index-row :search_index__sqlite "card" "1"))))
        (is (= (:created_at before) (:created_at (search.db/index-row :search_index__sqlite "card" "1"))))
        (is (= #{} (matches "café" false)))
        (is (= #{"1"} (matches "new" false)))))
    (is (= 3 (specialization/index-size-estimate :search_index__sqlite)))
    (search.db/delete-index-rows! :search_index__sqlite "card" ["1"])
    (is (= #{} (matches "new" false))))
  (search.db/drop-search-index-table! :search_index__sqlite)
  (is (not (search.db/table-exists? "search_index__sqlite"))))

(deftest orphan-discovery-test
  (t2/query "CREATE TABLE search_index_metadata (engine TEXT, index_name TEXT)")
  (doseq [table [:search_index__active :search_index__orphan :search_index__ignored_temp :search_index
                 :searchXindexXXunrelated]]
    (t2/query {:create-table table :with-columns [[:id :integer]]}))
  (t2/query "CREATE VIEW search_index__view AS SELECT 1")
  (t2/query {:insert-into :search_index_metadata :values [{:engine "appdb" :index_name "search_index__active"}]})
  (is (= #{"search_index__orphan" "search_index"}
         (set (map :table_name (search.db/orphan-index-table-names))))))

(deftest scoring-test
  (testing "SQLite uses floating point arithmetic and handles missing or stale timestamps"
    (let [score (fn [expr] (:score (t2/query-one {:select [[expr :score]]})))]
      (is (= 0.5 (score (scoring/size 5 10))))
      (is (= 1.0 (double (score (scoring/size 15 10)))))
      (is (= 0.5 (score (scoring/inverse-duration :sqlite "2026-09-19 12:00:00.000" "2026-09-24 12:00:00.000" 10))))
      (is (= 0.0 (score (scoring/inverse-duration :sqlite nil "2026-09-24 12:00:00.000" 10))))
      (is (= 0.0 (score (scoring/inverse-duration :sqlite "2026-01-01 12:00:00.000" "2026-09-24 12:00:00.000" 10)))))))

(deftest composed-scoring-test
  (search.db/create-search-index-table! :search_index__sqlite)
  (t2/query "CREATE TABLE recent_views (user_id INTEGER, model_id INTEGER, model TEXT, timestamp TIMESTAMP)")
  (doseq [model ["card" "dashboard" "collection"]]
    (t2/query (str "CREATE TABLE " model "_bookmark (user_id INTEGER, " model "_id INTEGER)")))
  (specialization/batch-upsert! :search_index__sqlite [(entry "1" "  CAFÉ,   Revenue " nil)])
  (let [ctx {:current-user-id 1 :search-string "café revenue"}
        query (->> (specialization/base-query :search_index__sqlite "café" ctx [:model_id])
                   (appdb.scoring/with-scores ctx (appdb.scoring/base-scorers ctx {})))
        result (t2/query-one query)]
    (is (= "1" (:model_id result)))
    (is (= 1 (:exact result)))
    (is (= 1 (:prefix result)))
    (is (number? (:total_score result)))))

(deftest metadata-lock-test
  (t2/query "CREATE TABLE search_index_metadata (id INTEGER PRIMARY KEY, engine TEXT, version TEXT, lang_code TEXT, status TEXT)")
  (t2/query {:insert-into :search_index_metadata
             :values [{:id 1 :engine "appdb" :version "v65" :lang_code "en" :status "pending"}]})
  (t2/with-transaction [_conn]
    (is (= {:id 1} (into {} (search.db/lock-pending-index-metadata! :appdb "v65" "en"))))
    (is (nil? (search.db/lock-pending-index-metadata! :appdb "v65" "fr")))))
