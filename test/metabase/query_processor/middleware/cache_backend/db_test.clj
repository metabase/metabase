(ns metabase.query-processor.middleware.cache-backend.db-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test])
  (:import (java.sql Connection)))

(set! *warn-on-reflection* true)

(defn- cache-results
  "Get the stored value from the query_cache"
  ^bytes [^Connection conn]
  (-> (jdbc/query {:connection conn} "select results from query_cache limit 1")
      first
      :results
      byte-array))

(deftest encryption-test
  (testing "With no encryption, cache results should be stored plain text"
    (encryption-test/with-secret-key nil
      (mt/with-temp-empty-app-db [conn :h2]
        (mdb/setup-db! :create-sample-content? false)
        (let [cache-backend (i/cache-backend :db)]
          (i/save-results! cache-backend (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
          (let [cached (cache-results conn)]
            (is (= "cache-value" (codecs/bytes->str cached))))))))
  (testing "With encryption enabled, cache results should be stored encrypted text"
    (encryption-test/with-secret-key "key1"
      (mt/with-temp-empty-app-db [conn :h2]
        (mdb/setup-db! :create-sample-content? false)
        (let [cache-backend (i/cache-backend :db)]
          (i/save-results! cache-backend (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
          (let [cached (codecs/bytes->str (cache-results conn))]
            (is (str/starts-with? cached "AES/CBC/PKCS5Padding"))
            (is (not (str/includes? cached "cache-value")))))))))
