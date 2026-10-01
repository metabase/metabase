(ns metabase.query-processor.middleware.row-restricted-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.row-restricted-metadata :as row-restricted-metadata]))

(def ^:private metadata
  {:cols [{:name "PRICE", :fingerprint {:global {:distinct-count 4}, :type {:type/Number {:min 1.0, :max 4.0}}}}
          {:name "NAME", :fingerprint {:global {:distinct-count 100}}}
          {:name "count"}]})

(defn- strip
  "Run `metadata` through the middleware for `query`, returning what the next rff receives."
  [query]
  ((row-restricted-metadata/strip-row-restricted-fingerprints query identity) metadata))

(deftest unrestricted-query-keeps-fingerprints-test
  (testing "with no row restriction in force the cols are passed through untouched"
    (is (= metadata
           (strip {:database 1, :type :query, :query {:source-table 10}})))))

(deftest sandboxed-query-loses-fingerprints-test
  (testing "a sandboxed-table marker strips the fingerprint from every col, not only the sandboxed table's (BOT-2115)"
    (is (= {:cols [{:name "PRICE"} {:name "NAME"} {:name "count"}]}
           (strip {:database 1
                   :type     :query
                   :query    {:source-table 10, :query-permissions/sandboxed-table 10}}))))
  (testing "including a marker nested in a join's source query"
    (is (every? nil? (map :fingerprint
                          (:cols (strip {:database 1
                                         :type     :query
                                         :query    {:source-table 10
                                                    :joins        [{:source-query {:source-table                      20
                                                                                   :query-permissions/sandboxed-table 20}
                                                                    :condition    [:= [:field 1 nil] [:field 2 {:join-alias "c"}]]
                                                                    :alias        "c"}]}})))))))
