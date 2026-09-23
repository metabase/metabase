(ns metabase-enterprise.semantic-search.sqlite-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.sqlite :as sqlite]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- extension-available? []
  (try
    (sqlite/extension-path)
    true
    (catch Exception _
      false)))

(defn- temp-db-path []
  (str (Files/createTempDirectory "vec1-store" (make-array FileAttribute 0)) "/store.db"))

(def ^:private test-model
  ;; Carries an :embedding-space-id, so the store never asks a provider to resolve it.
  {:provider "test" :model-name "test-model" :vector-dimensions 4 :embedding-space-id "test-space-4"})

(defn- do-with-store! [f]
  (let [path (temp-db-path)]
    (try
      (sqlite/open! path {:embedding-model test-model})
      (f path)
      (finally
        (sqlite/delete-store! path)))))

(defmacro ^:private with-store!
  "Run `body` with a fresh store open at a temp path bound to `path-binding`. Skipped (with a warning) on platforms
  without a vec1 binary."
  [[path-binding] & body]
  `(if (extension-available?)
     (do-with-store! (fn [~path-binding] ~@body))
     (log/warn "Skipping: no vec1 extension for" (sqlite/platform))))

(deftest ^:parallel platform-test
  (is (re-matches #"(darwin|linux|windows)-(aarch64|x86_64)" (sqlite/platform))))

(deftest ^:parallel blob-roundtrip-test
  (let [v [0.0 1.0 -2.5 3.25]]
    (is (= 16 (alength ^bytes (sqlite/->blob v))))
    (is (= v (mapv double (sqlite/<-blob (sqlite/->blob v)))))))

(deftest missing-extension-test
  (with-redefs [env/env {:mb-vec1-extension-path "/nonexistent/vec1.dylib"}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No vec1 extension"
                          (sqlite/extension-path)))))

(deftest open-close-test
  (with-store! [path]
    (testing "vec1 is loaded on the store connection"
      (is (re-find #"^version 0\.7" (sqlite/vec1-info))))
    (testing "the file exists"
      (is (.exists (io/file path))))
    (testing "open! at the same path is a no-op"
      (let [conn-before (sqlite/with-conn [conn] conn)]
        (is (= path (sqlite/open! path {:embedding-model test-model})))
        (is (identical? conn-before (sqlite/with-conn [conn] conn)))))
    (testing "close! then with-conn reopens (at the configured path)"
      (sqlite/close!)
      (mt/with-dynamic-fn-redefs [sqlite/db-path                           (constantly path)
                                  semantic.embedding/get-configured-model (constantly test-model)]
        (is (re-find #"^version" (sqlite/vec1-info)))))))

(deftest open-other-path-test
  (with-store! [_path]
    (let [other (temp-db-path)]
      (try
        (sqlite/with-conn [conn]
          (jdbc/execute! conn ["CREATE TABLE marker (x INTEGER)"]))
        (sqlite/open! other {:embedding-model test-model})
        (testing "the store now points at the other, empty file"
          (is (= [] (sqlite/with-conn [conn]
                      (jdbc/execute! conn ["SELECT name FROM sqlite_master WHERE name = 'marker'"])))))
        (finally
          (sqlite/delete-store! other))))))

(deftest delete-store-test
  (when (extension-available?)
    (let [path (temp-db-path)]
      (sqlite/open! path {:embedding-model test-model})
      (sqlite/with-conn [conn]
        (jdbc/execute! conn ["CREATE TABLE t (x INTEGER)"]))
      (sqlite/delete-store! path)
      (is (not (.exists (io/file path))))
      (is (not (.exists (io/file (str path "-wal"))))))))

(deftest serialized-access-test
  (with-store! [_path]
    (sqlite/with-conn [conn]
      (jdbc/execute! conn ["CREATE TABLE t (x INTEGER)"]))
    (let [n       200
          futures (mapv (fn [i]
                          (future
                            (sqlite/with-conn [conn]
                              (jdbc/execute! conn ["INSERT INTO t (x) VALUES (?)" i]))))
                        (range n))]
      (run! deref futures)
      (is (= n (sqlite/with-conn [conn]
                 (:n (jdbc/execute-one! conn ["SELECT count(*) AS n FROM t"]
                                        {:builder-fn jdbc.rs/as-unqualified-maps}))))))))

(deftest vec1-table-test
  (testing "a vec1 table works over the store connection (smoke test; Phase A covered the details)"
    (with-store! [_path]
      (sqlite/with-conn [conn]
        (jdbc/execute! conn ["CREATE VIRTUAL TABLE v USING vec1(vector)"])
        (jdbc/execute! conn ["INSERT INTO v(cmd, arg) VALUES ('rebuild', '{index:\"flat\", distance:\"cos\"}')"])
        (jdbc/execute! conn ["INSERT INTO v(rowid, vector) VALUES (1, ?)" (sqlite/->blob [1 0 0 0])])
        (jdbc/execute! conn ["INSERT INTO v(rowid, vector) VALUES (2, ?)" (sqlite/->blob [0 1 0 0])])
        (is (= [1 2]
               (mapv :rowid (jdbc/execute! conn ["SELECT rowid FROM v(?, '{k: 2}') ORDER BY distance"
                                                 (sqlite/->blob [1 0.1 0 0])]
                                           {:builder-fn jdbc.rs/as-unqualified-maps}))))))))

;;; ---------------------------------------------------- Schema ----------------------------------------------------

(defn- q [sql-params]
  (sqlite/with-conn [conn]
    (jdbc/execute! conn sql-params {:builder-fn jdbc.rs/as-unqualified-maps})))

(defn- reopen! [path model]
  (sqlite/close!)
  (sqlite/open! path {:embedding-model model})
  (:schema (sqlite/store-info)))

(deftest schema-created-then-existing-test
  (with-store! [path]
    (testing "a new file gets the schema and the model identity"
      (is (= :created (:schema (sqlite/store-info))))
      (is (= {"schema_version"     (str sqlite/schema-version)
              "provider"           "test"
              "model_name"         "test-model"
              "vector_dimensions"  "4"
              "embedding_space_id" "test-space-4"}
             (:meta (sqlite/store-info))))
      (is (= #{"meta" "search_doc" "search_vec"}
             (into #{} (comp (map :name) (filter #{"meta" "search_doc" "search_vec"}))
                   (q ["SELECT name FROM sqlite_master"])))))
    (testing "reopening for the same model keeps the data"
      (q ["INSERT INTO search_doc (model, model_id, name, content) VALUES ('card', '1', 'Orders', 'orders')"])
      (is (= :existing (reopen! path test-model)))
      (is (= [{:n 1}] (q ["SELECT count(*) AS n FROM search_doc"]))))))

(deftest schema-recreated-on-model-change-test
  (with-store! [path]
    (q ["INSERT INTO search_doc (model, model_id, name, content) VALUES ('card', '1', 'Orders', 'orders')"])
    (doseq [[what model] {"dimensions"         (assoc test-model :vector-dimensions 8)
                          "embedding space"    (assoc test-model :embedding-space-id "other-space")
                          "model name"         (assoc test-model :model-name "other-model")
                          "provider"           (assoc test-model :provider "other-provider")}]
      (testing (str "a different " what " recreates the store empty")
        (is (= :recreated (reopen! path model)))
        (is (= [{:n 0}] (q ["SELECT count(*) AS n FROM search_doc"])))
        (is (= (:embedding-space-id model) (get-in (sqlite/store-info) [:meta "embedding_space_id"])))
        ;; back to the original model for the next case
        (reopen! path test-model)
        (q ["INSERT INTO search_doc (model, model_id, name, content) VALUES ('card', '1', 'Orders', 'orders')"])))
    (testing "open! for another model on the open store switches without an explicit close"
      (sqlite/open! path {:embedding-model (assoc test-model :vector-dimensions 8)})
      (is (= :recreated (:schema (sqlite/store-info)))))))

(deftest schema-recreated-on-version-change-test
  (with-store! [path]
    (let [bumped (inc sqlite/schema-version)]
      (with-redefs [sqlite/schema-version bumped]
        (is (= :recreated (reopen! path test-model)))
        (is (= (str bumped) (get-in (sqlite/store-info) [:meta "schema_version"])))))))

(deftest schema-recreated-for-foreign-file-test
  (when (extension-available?)
    (let [path (temp-db-path)]
      (try
        (with-open [conn (java.sql.DriverManager/getConnection (str "jdbc:sqlite:" path))]
          (jdbc/execute! conn ["CREATE TABLE marker (x INTEGER)"]))
        (sqlite/open! path {:embedding-model test-model})
        (is (= :recreated (:schema (sqlite/store-info))))
        (is (= [] (q ["SELECT name FROM sqlite_master WHERE name = 'marker'"])))
        (finally
          (sqlite/delete-store! path))))))

(deftest search-vec-meta-columns-test
  (testing "filters on the vec1 meta columns run inside the KNN (the far match is still found with k = 1)"
    (with-store! [_path]
      (sqlite/with-conn [conn]
        (doseq [[id v model archived] [[1 [1 0 0 0] "card" 0]
                                       [2 [0.9 0.1 0 0] "card" 0]
                                       [3 [0 1 0 0] "dashboard" 0]
                                       [4 [0.1 0.9 0 0] "dashboard" 1]]]
          (jdbc/execute! conn [(str "INSERT INTO search_vec(rowid, vector, " (str/join ", " sqlite/vec-meta-columns) ")"
                                    " VALUES (?, ?, ?, ?, 0, 1, 1, NULL)")
                               id (sqlite/->blob v) model archived])))
      (is (= [{:rowid 3}]
             (q ["SELECT rowid FROM search_vec(?, '{k: 1}') WHERE model = 'dashboard' AND archived = 0"
                 (sqlite/->blob [1 0 0 0])]))))))
