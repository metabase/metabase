(ns metabase.query-processor-test.pipeline-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- metadata-provider []
  (lib.metadata.jvm/application-database-metadata-provider (mt/id)))

;;; this stuff is mostly so we can get a sense of what using MLv2 in tests will ultimately look like

(defmacro ^:private pmbql-query
  {:style/indent 1}
  [table-name & body]
  `(-> (lib/query-for-table-id (metadata-provider) (mt/id ~(keyword table-name)))
       ~@body))

(defmacro ^:private run-pmbql-query
  {:style/indent 1}
  [table-name & body]
  `(qp/process-query (pmbql-query ~table-name ~@body)))

(def ^:private ^{:arglists '([query stage-number])} $price
  (lib/field (mt/id :venues :price)))

(deftest pipeline-queries-test
  (testing "Ensure that the QP can handle pMBQL `:pipeline` queries"
    (is (= [[6]]
           (mt/rows (mt/run-mbql-query venues
                      {:aggregation [[:count]]
                       :filter      [:= $price 4]}))
           (mt/rows (run-pmbql-query :venues
                      (lib/aggregate (lib/count))
                      (lib/filter (lib/= $price 4))))))))
