(ns metabase.search.postgres.index-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.search :refer [is-postgres?]]
   [metabase.search.postgres.core :as search.postgres]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.postgres.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn legacy-results
  "Use the source tables directly to search for records."
  [search-term & {:as opts}]
  (t2/query (#'search.postgres/in-place-query (assoc opts :search-term search-term))))

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
  `(when (is-postgres?)
     (mt/dataset ~(symbol "test-data")
       (search.index/reset-index!)
       (search.ingestion/populate-index!)
       ~@body)))

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
      (is (= 27 (legacy-hits "or")))
      (is (= 33 (legacy-hits "its the satisfaction of it")))
      (is (= 3 (legacy-hits "user")))
      (is (= 27 (legacy-hits "satisfaction or user"))))

    (testing "We get results for both terms"
      (is (= 1 (index-hits "satisfaction")))
      (is (= 3 (index-hits "user"))))
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
      (is (= 3 (index-hits "user")))
      (is (= 3 (index-hits "people")))
      (is (= 1 (index-hits "user and people")))
      (is (= 2 (index-hits "user -people"))))))

(deftest phrase-test
  (with-index
    (is (= 18 (index-hits "orders")))
    (is (= 5 (index-hits "category")))
    (is (= 0 (index-hits "by")))
    (testing "only sometimes do these occur sequentially in a phrase"
      (is (= 2 (index-hits "\"orders by category\""))))
    (testing "legacy search has a bunch of results"
      ;; strangely enough this is not the same as "or"
      (is (= 11 (legacy-hits "\"orders by category\""))))))
