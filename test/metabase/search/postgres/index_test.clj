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
       (mt/with-temp [:model/Card {} {:name "Customer Satisfaction" :collection_id 1}
                      :model/Card {} {:name "The Latest Revenue Projections" :collection_id 1}
                      :model/Card {} {:name "Projected Revenue" :collection_id 1}
                      :model/Card {} {:name "Employee Satisfaction" :collection_id 1}
                      :model/Card {} {:name "Projected Satisfaction" :collection_id 1}]
         (search.index/reset-index!)
         (search.ingestion/populate-index!)
         ~@body))))

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
      (doseq [[a b] [["revenue" "revenues"]
                     ["collect" "collection"]]]
        (is (= (search.index/search a)
               (search.index/search b)))))))

(deftest either-test
  (with-index
    (testing "legacy search does not understand stop words or logical operators"
      (is (= 3 (legacy-hits "satisfaction")))
      ;; Add some slack because things are leaking into this "test" database :-(
      (is (<= 2 (legacy-hits "or")))
      (is (<= 4 (legacy-hits "its the satisfaction of it")))
      (is (<= 1 (legacy-hits "user")))
      (is (<= 6 (legacy-hits "satisfaction or user"))))

    (testing "We get results for both terms"
      (is (= 3 (index-hits "satisfaction")))
      (is (<= 1 (index-hits "user"))))
    (testing "But stop words are skipped"
      (is (= 0 (index-hits "or")))
      (is (= 3 (index-hits "its the satisfaction of it"))))
    (testing "We can combine the individual results"
      (is (= (+ (index-hits "satisfaction")
                (index-hits "user"))
             (index-hits "satisfaction or user"))))))

(deftest negation-test
  (with-index
    (testing "We can filter out results"
      (is (= 3 (index-hits "satisfaction")))
      (is (= 1 (index-hits "customer")))
      (is (= 1 (index-hits "satisfaction and customer")))
      (is (= 2 (index-hits "satisfaction -customer"))))))

(deftest phrase-test
  (with-index
    (is (= 3 (index-hits "projected")))
    (is (= 2 (index-hits "revenue")))
    (is (= 2 (index-hits "projected revenue")))
    (testing "only sometimes do these occur sequentially in a phrase"
      (is (= 1 (index-hits "\"projected revenue\""))))
    (testing "legacy search has a bunch of results"
      (is (= 3 (legacy-hits "projected revenue")))
      (is (= 0 (legacy-hits "\"projected revenue\""))))))
