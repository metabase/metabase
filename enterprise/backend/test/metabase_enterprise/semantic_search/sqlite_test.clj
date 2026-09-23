(ns metabase-enterprise.semantic-search.sqlite-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [environ.core :as env]
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

(defn- do-with-store! [f]
  (let [path (temp-db-path)]
    (try
      (sqlite/open! path)
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
        (is (= path (sqlite/open! path)))
        (is (identical? conn-before (sqlite/with-conn [conn] conn)))))
    (testing "close! then with-conn reopens (at the configured path)"
      (sqlite/close!)
      (mt/with-dynamic-fn-redefs [sqlite/db-path (constantly path)]
        (is (re-find #"^version" (sqlite/vec1-info)))))))

(deftest open-other-path-test
  (with-store! [_path]
    (let [other (temp-db-path)]
      (try
        (sqlite/with-conn [conn]
          (jdbc/execute! conn ["CREATE TABLE marker (x INTEGER)"]))
        (sqlite/open! other)
        (testing "the store now points at the other, empty file"
          (is (= [] (sqlite/with-conn [conn]
                      (jdbc/execute! conn ["SELECT name FROM sqlite_master WHERE name = 'marker'"])))))
        (finally
          (sqlite/delete-store! other))))))

(deftest delete-store-test
  (when (extension-available?)
    (let [path (temp-db-path)]
      (sqlite/open! path)
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
