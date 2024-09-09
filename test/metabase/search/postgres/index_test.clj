(ns metabase.search.postgres.index-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private non-indexed-models
  (disj search.config/all-models "indexed-entity"))

(defn legacy-results
  "Use the source tables directly to search for records."
  [search-term & {:keys [models]}]
  (t2/query
   (search.impl/full-search-query
    {:archived? nil

     ;; TODO pass the actual user
     :current-user-id    1
     :is-superuser?      true
     :current-user-perms #{"/"}

     :model-ancestors? false
     ;; this model needs dynamic vars
     :models           (or models non-indexed-models)

     :search-string search-term})))

(def legacy-models
  "Just the identity of the matches"
  (comp (partial mapv (juxt :id :model)) legacy-results))

(defn- legacy-hits [term]
  (count (legacy-results term)))

(defn- index-hits [term]
  (count (search.index/search term)))

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-index
  "Ensure a clean, small index."
  [& body]
  `(mt/dataset ~(symbol "test-data")
     (search.index/reset-index!)
     (search.ingestion/populate-index!)
     ~@body))

(deftest consistent-subset-test
  (with-index
    (testing "It's consistent with in-place search on various full words"
      (doseq [term ["e-commerce" "example" "rasta" "new" "collection" "revenue"]]
        (testing term
          (is (= (set (legacy-models term))
                 (set (search.index/search term)))))))))

(deftest partial-word-test
  (with-index
    (testing "It does not match partial words"
      ;; does not include revenue
      (is (< (index-hits "venue")
             ;; but this one does
             (legacy-hits "venue"))))

    (testing "Unless their lexemes are matching"
      (doseq [[a b] [["example" "examples"]
                     ["collect" "collection"]]]
        (is (= (search.index/search a)
               (search.index/search b)))))))

(deftest either-test
  (with-index
    (testing "legacy search does not understand stop words or logical operators"
      (is (= 1 (legacy-hits "satisfaction")))
      (is (= 31 (legacy-hits "or")))
      (is (= 33 (legacy-hits "its the satisfaction of it")))
      (is (= 4 (legacy-hits "user")))
      (is (= 32 (legacy-hits "satisfaction or user"))))

    (testing "We get results for both terms"
      (is (= 1 (index-hits "satisfaction")))
      (is (= 4 (index-hits "user"))))
    (testing "But stop words are skipped"
      (is (= 0 (index-hits "or")))
      (is (= 1 (index-hits "its the satisfaction of it"))))
    (testing "We can combine the individual results"
      (is (= (+ (index-hits "satisfaction")
                (index-hits "user"))
             (index-hits "satisfaction or user"))))))

(deftest negation-test
  (with-index
    (testing "We can filter out results"
      (is (= 4 (index-hits "user")))
      (is (= 4 (index-hits "people")))
      (is (= 1 (index-hits "user and people")))
      (is (= 3 (index-hits "user -people"))))))

(deftest phrase-test
  (with-index
    (is (= 19 (index-hits "orders")))
    (is (= 6 (index-hits "category")))
    (is (= 0 (index-hits "by")))
    (testing "only sometimes do these occur sequentially in a phrase"
      (is (= 2 (index-hits "\"orders by category\""))))
    (testing "legacy search has a bunch of results"
      ;; strangely enough this is not the same as "or"
      (is (= 11 (legacy-hits "\"orders by category\""))))))
