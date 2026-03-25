(ns metabase-enterprise.checker.lenient-test
  "Tests for the lenient source and its integration with the checker.

   Tests cover:
   - LenientSource fabricates metadata on demand
   - Manifest generation from tracked refs
   - Lenient mode via hybrid/check with --lenient flag
   - Native SQL parsing extracts table/field refs
   - QP compile path works with YAML-backed provider"
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.checker :as checker]
   [metabase-enterprise.checker.format.concise :as concise]
   [metabase-enterprise.checker.format.hybrid :as hybrid]
   [metabase-enterprise.checker.format.lenient :as lenient]
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; LenientSource unit tests
;;; ===========================================================================

(deftest lenient-source-fabricates-database-test
  (testing "LenientSource fabricates database metadata on first resolve"
    (let [src (lenient/make-source nil)]
      (is (= {:name "my_db" :engine "postgres"}
             (source/resolve-database src "my_db")))
      ;; Second call returns cached data
      (is (= {:name "my_db" :engine "postgres"}
             (source/resolve-database src "my_db")))
      (is (= {"my_db" {:name "my_db" :engine "postgres"}}
             (lenient/tracked-databases src))))))

(deftest lenient-source-fabricates-table-test
  (testing "LenientSource fabricates table metadata on first resolve"
    (let [src (lenient/make-source nil)]
      (is (= {:name "users" :schema "public"}
             (source/resolve-table src ["my_db" "public" "users"])))
      (is (= {:name "orders" :schema nil}
             (source/resolve-table src ["my_db" nil "orders"])))
      (is (= 2 (count (lenient/tracked-tables src)))))))

(deftest lenient-source-fabricates-field-test
  (testing "LenientSource fabricates field metadata on first resolve"
    (let [src (lenient/make-source nil)
          field (source/resolve-field src ["my_db" nil "users" "email"])]
      (is (= "email" (:name field)))
      (is (= "type/*" (:base_type field)))
      (is (= ["my_db" nil "users"] (:table_id field)))
      (is (= 1 (count (lenient/tracked-fields src)))))))

(deftest lenient-source-delegates-cards-test
  (testing "LenientSource delegates card resolution to card-source"
    (let [card-data {:name "My Card" :entity_id "abc123"}
          card-src  (reify source/MetadataSource
                      (resolve-database [_ _] nil)
                      (resolve-table [_ _] nil)
                      (resolve-field [_ _] nil)
                      (resolve-card [_ eid]
                        (when (= eid "abc123") card-data)))
          src       (lenient/make-source card-src)]
      (is (= card-data (source/resolve-card src "abc123")))
      (is (nil? (source/resolve-card src "nonexistent"))))))

(deftest lenient-source-nil-card-source-test
  (testing "LenientSource with nil card-source returns nil for cards"
    (let [src (lenient/make-source nil)]
      (is (nil? (source/resolve-card src "anything"))))))

;;; ===========================================================================
;;; Manifest tests
;;; ===========================================================================

(deftest build-manifest-schema-less-test
  (testing "Manifest groups schema-less tables correctly"
    (let [src (lenient/make-source nil)]
      ;; Simulate resolving some refs
      (source/resolve-database src "sqlite_db")
      (source/resolve-table src ["sqlite_db" nil "users"])
      (source/resolve-field src ["sqlite_db" nil "users" "id"])
      (source/resolve-field src ["sqlite_db" nil "users" "name"])
      (source/resolve-table src ["sqlite_db" nil "orders"])
      (source/resolve-field src ["sqlite_db" nil "orders" "total"])
      (let [manifest (lenient/build-manifest src)]
        (is (= 1 (count manifest)) "Should have 1 database")
        (let [db (first manifest)]
          (is (= "sqlite_db" (:name db)))
          (is (contains? db :tables) "Schema-less should use :tables key")
          (is (not (contains? db :schemas)) "Should not have :schemas")
          (is (= ["id" "name"] (get-in db [:tables "users" :fields])))
          (is (= ["total"] (get-in db [:tables "orders" :fields]))))))))

(deftest build-manifest-schema-based-test
  (testing "Manifest groups schema-based tables correctly"
    (let [src (lenient/make-source nil)]
      (source/resolve-database src "pg_db")
      (source/resolve-table src ["pg_db" "public" "users"])
      (source/resolve-field src ["pg_db" "public" "users" "id"])
      (source/resolve-field src ["pg_db" "public" "users" "email"])
      (let [manifest (lenient/build-manifest src)]
        (is (= 1 (count manifest)))
        (let [db (first manifest)]
          (is (= "pg_db" (:name db)))
          (is (contains? db :schemas) "Schema-based should use :schemas key")
          (is (= ["email" "id"] (get-in db [:schemas "public" "users" :fields]))))))))

(deftest write-manifest-yaml-test
  (testing "write-manifest! produces valid YAML in concise format"
    (let [src  (lenient/make-source nil)
          file (java.io.File/createTempFile "manifest" ".yaml")]
      (try
        (source/resolve-database src "test_db")
        (source/resolve-table src ["test_db" nil "events"])
        (source/resolve-field src ["test_db" nil "events" "type"])
        (source/resolve-field src ["test_db" nil "events" "ts"])
        (lenient/write-manifest! src (.getPath file))
        (let [content (yaml/parse-string (slurp file))
              db      (first content)]
          (is (= "test_db" (:name db)))
          (is (= ["ts" "type"] (get-in db [:tables :events :fields]))))
        (finally
          (.delete file))))))

;;; ===========================================================================
;;; Hybrid format detection — lenient fallback
;;; ===========================================================================

(deftest hybrid-detects-lenient-when-no-databases-test
  (testing "make-source throws when no databases/ directory exists and lenient not requested"
    (let [dir (java.io.File/createTempFile "export" "")]
      (.delete dir)
      (.mkdirs dir)
      (try
        ;; Create only a collections/ dir (no databases/)
        (.mkdirs (io/file dir "collections"))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"No database schemas found"
                              (hybrid/make-source (.getPath dir))))
        (finally
          ;; Cleanup
          (doseq [f (reverse (file-seq dir))]
            (.delete ^java.io.File f)))))))

(deftest hybrid-force-lenient-test
  (testing "make-source returns :lenient when :lenient? true even with databases on disk"
    (let [dir (java.io.File/createTempFile "export" "")]
      (.delete dir)
      (.mkdirs dir)
      (try
        ;; Create a concise database file
        (let [db-dir (io/file dir "databases")]
          (.mkdirs db-dir)
          (spit (io/file db-dir "test.yaml")
                (yaml/generate-string {:name "test" :engine "h2"
                                       :tables {"t" {:fields ["a"]}}})))
        (.mkdirs (io/file dir "collections"))
        ;; Without --lenient, should detect concise
        (let [{:keys [type]} (hybrid/make-source (.getPath dir))]
          (is (= :hybrid type)))
        ;; With --lenient, should force lenient
        (let [{:keys [type]} (hybrid/make-source (.getPath dir) :lenient? true)]
          (is (= :lenient type)))
        (finally
          (doseq [f (reverse (file-seq dir))]
            (.delete ^java.io.File f)))))))

;;; ===========================================================================
;;; Integration: lenient mode with in-memory cards
;;; ===========================================================================

(deftest lenient-check-with-mbql-card-test
  (testing "Lenient source fabricates metadata for MBQL cards and checks pass"
    (let [db-yamls [{:name "Test DB"
                     :engine "postgres"
                     :schemas {"public" {"orders" {:fields ["id" "total" "created_at"]}}}}]
          card-src (concise/make-source-from-data db-yamls
                    [{:name "Order Totals"
                      :entity_id "test-mbql"
                      :type "question"
                      :dataset_query {:database "Test DB"
                                      :type "query"
                                      :query {:source-table ["Test DB" "public" "orders"]}}
                      :result_metadata [{:name "total"
                                         :base_type "type/Float"
                                         :display_name "Total"
                                         :field_ref [:field "total" {:base-type :type/Float}]}]}])
          lenient-src (lenient/make-source card-src)
          enums (lenient/make-enumerators lenient-src #(concise/all-card-ids card-src))
          results (checker/check-cards lenient-src enums ["test-mbql"])
          result (get results "test-mbql")]
      (is (some? result))
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (is (= "Order Totals" (:name result))))))

(deftest lenient-check-with-native-card-test
  (testing "Lenient source + QP compile extracts SQL refs from native queries"
    (let [card-src (concise/make-source-from-data [] ; no databases
                    [{:name "Native Query"
                      :entity_id "test-native"
                      :type "question"
                      :dataset_query {:database "My DB"
                                      :type "native"
                                      :native {:query "SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id"}}
                      :result_metadata [{:name "name" :base_type "type/Text"
                                         :field_ref [:field "name" {:base-type :type/Text}]}
                                        {:name "total" :base_type "type/Float"
                                         :field_ref [:field "total" {:base-type :type/Float}]}]}])
          lenient-src (lenient/make-source card-src)
          enums (lenient/make-enumerators lenient-src #(concise/all-card-ids card-src))
          results (checker/check-cards lenient-src enums ["test-native"])
          result (get results "test-native")]
      (is (some? result))
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      ;; SQL parsing should have found the tables
      (let [tables (get-in result [:refs :tables])]
        (is (some #(re-find #"users" %) tables) "Should reference users table")
        (is (some #(re-find #"orders" %) tables) "Should reference orders table"))
      ;; And the fields
      (let [fields (get-in result [:refs :fields])]
        (is (some #(re-find #"name" %) fields) "Should reference name field")
        (is (some #(re-find #"total" %) fields) "Should reference total field"))
      ;; Lenient source should have tracked the refs
      (is (contains? (lenient/tracked-databases lenient-src) "My DB"))
      (is (seq (lenient/tracked-tables lenient-src)))
      (is (seq (lenient/tracked-fields lenient-src))))))

(deftest native-sql-refs-in-manifest-test
  (testing "SQL-parsed refs appear in the manifest"
    (let [card-src (concise/make-source-from-data []
                    [{:name "SQL Card"
                      :entity_id "sql-card"
                      :type "question"
                      :dataset_query {:database "analytics"
                                      :type "native"
                                      :native {:query "SELECT event_type, COUNT(*) FROM events GROUP BY event_type"}}
                      :result_metadata []}])
          lenient-src (lenient/make-source card-src)
          enums (lenient/make-enumerators lenient-src #(concise/all-card-ids card-src))
          _ (checker/check-cards lenient-src enums ["sql-card"])
          manifest (lenient/build-manifest lenient-src)
          db (first manifest)]
      (is (= "analytics" (:name db)))
      (is (contains? (:tables db) "events") "Manifest should include events table")
      (is (some #{"event_type"} (get-in db [:tables "events" :fields]))
          "Manifest should include event_type field"))))

;;; ===========================================================================
;;; QP compile with YAML-backed provider
;;; ===========================================================================

(deftest qp-compile-native-query-test
  (testing "QP compile-with-inline-parameters works with YAML-backed provider"
    (let [card-src (concise/make-source-from-data
                    [{:name "Test DB"
                      :engine "h2"
                      :schemas {"PUBLIC" {"ORDERS" {:fields ["ID" "TOTAL"]}}}}]
                    [{:name "Native Q"
                      :entity_id "native-q"
                      :type "question"
                      :dataset_query {:database "Test DB"
                                      :type "native"
                                      :native {:query "SELECT * FROM ORDERS"}}
                      :result_metadata []}])
          ;; Use concise source (has schema) so we get real engine
          enums (concise/make-enumerators card-src)
          store (checker/make-store card-src enums)
          provider (checker/make-provider store)
          results (checker/check-cards card-src enums ["native-q"])
          result (get results "native-q")]
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (let [tables (get-in result [:refs :tables])]
        (is (some #(re-find #"ORDERS" %) tables) "Should find ORDERS table via SQL parsing")))))

(deftest qp-compile-mbql-to-sql-test
  (testing "QP can compile MBQL queries to SQL using YAML-backed provider"
    (let [card-src (concise/make-source-from-data
                    [{:name "Test DB"
                      :engine "h2"
                      :schemas {"PUBLIC" {"ORDERS" {:fields [{:name "ID"
                                                              :base_type "type/BigInteger"
                                                              :database_type "BIGINT"}
                                                             {:name "TOTAL"
                                                              :base_type "type/Float"
                                                              :database_type "DOUBLE PRECISION"}]}}}}]
                    [{:name "MBQL Q"
                      :entity_id "mbql-q"
                      :type "question"
                      :dataset_query {:database "Test DB"
                                      :type "query"
                                      :query {:source-table ["Test DB" "PUBLIC" "ORDERS"]}}
                      :result_metadata [{:name "ID"
                                         :base_type "type/BigInteger"
                                         :display_name "ID"
                                         :field_ref [:field ["Test DB" "PUBLIC" "ORDERS" "ID"]
                                                     {:base-type :type/BigInteger}]}
                                        {:name "TOTAL"
                                         :base_type "type/Float"
                                         :display_name "Total"
                                         :field_ref [:field ["Test DB" "PUBLIC" "ORDERS" "TOTAL"]
                                                     {:base-type :type/Float}]}]}])
          results (concise/check card-src)
          result (get results "mbql-q")]
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (is (seq (get-in result [:refs :tables])) "Should have table refs"))))

(comment
  (clojure.test/run-tests 'metabase-enterprise.checker.lenient-test))
