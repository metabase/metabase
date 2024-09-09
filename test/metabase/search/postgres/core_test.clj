(ns metabase.search.postgres.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.core :as search.postgres]
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

(deftest ^:synchronized hybrid-test
  (mt/dataset test-data
    (search.postgres/init! true)
    (testing "consistent results between all searches for certain queries\n"
      (doseq [term ["satisfaction" "e-commerce" "example" "rasta" "new" #_"collection" "revenue"]]
        (testing (str "consistent results, but not ordering" term)
          (is (= (legacy-results term)
                 (search.postgres/hybrid term))))))
    (testing "But sometimes the order is inconsistent"
      (let [hybrid (search.postgres/hybrid "collection")
            legacy (legacy-results "collection")]
        (is (= (set hybrid) (set legacy)))
        (is (not= hybrid legacy))))))

(deftest ^:synchronized hybrid-multi-test
  (mt/dataset test-data
    (search.postgres/init! true)
    (testing "consistent results between "
      (doseq [term ["satisfaction" "e-commerce" "example" "rasta" "new" #_"collection" "revenue"]]
        (testing term
          (is (= (search.postgres/hybrid term)
                 (search.postgres/hybrid-multi term)))))
      (testing "But sometimes the order is inconsistent"
        (let [basic (search.postgres/hybrid "collection")
              multi (search.postgres/hybrid-multi "collection")]
          (is (= (set basic) (set multi)))
          (is (not= basic multi)))))))
