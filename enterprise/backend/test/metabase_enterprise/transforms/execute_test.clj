(ns ^:mb/driver-tests metabase-enterprise.transforms.execute-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.query-test-util :as query-test-util]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- make-query
  "Create a query using the shared test utility.
   Maintains the same signature for compatibility with existing tests."
  ([source-table]
   (query-test-util/make-query source-table))
  ([source-table source-column constraint-fn & constraint-params]
   (apply query-test-util/make-query source-table source-column constraint-fn constraint-params)))

(defn- wait-for-table
  [table-name timeout-ms]
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 200)
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info "table has not been created" {:table-name table-name, :timeout-ms timeout-ms})))
      (or (m/find-first (comp #{table-name} :name) (lib.metadata/tables mp))
          (recur)))))

(deftest execute-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [target-type "table"
            schema (t2/select-one-fn :schema :model/Table (mt/id :products))]
        (with-transform-cleanup! [{table1-name :name :as target1} {:type target-type
                                                                   :schema schema
                                                                   :name "g_products"}
                                  {table2-name :name :as target2} {:type target-type
                                                                   :schema schema
                                                                   :name "gizmo_products"}]
          (let [t1-query (make-query "products" "category" lib/starts-with "G")]
            (mt/with-temp [:model/Transform t1 {:name "transform1"
                                                :source {:type :query
                                                         :query (lib.convert/->legacy-MBQL t1-query)}
                                                :target target1}]
              (transforms.execute/run-mbql-transform! t1 {:run-method :manual})
              (let [table1 (wait-for-table table1-name 10000)
                    t2-query (make-query table1 "category" lib/= "Gizmo")]
                (mt/with-temp [:model/Transform t2 {:name "transform2"
                                                    :source {:type :query
                                                             :query (lib.convert/->legacy-MBQL t2-query)}
                                                    :target target2}]
                  (transforms.execute/run-mbql-transform! t2 {:run-method :cron})
                  (let [table2 (wait-for-table table2-name 10000)
                        check-query (lib/aggregate (make-query table2) (lib/count))]
                    ;; The transforms-test dataset has exactly 4 Gizmo products (IDs 6, 8, 12, 14)
                    ;; First transform filters for categories starting with "G" (Gadget and Gizmo)
                    ;; Second transform filters for category = "Gizmo", resulting in 4 products
                    (is (=? {:data {:cols [{:name "count"}]
                                    :rows [[4]]}}
                            (qp/process-query check-query)))))))))))))
