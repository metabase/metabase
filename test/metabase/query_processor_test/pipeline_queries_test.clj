(ns metabase.query-processor-test.pipeline-queries-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- metadata-provider []
  (lib.metadata.jvm/application-database-metadata-provider (mt/id)))

;;; this stuff is mostly so we can get a sense of what using MLv2 in tests will ultimately look like

(defn- query-for-table-id
  [table-name]
  (let [provider       (metadata-provider)
        table-metadata (lib.metadata/table provider (mt/id table-name))]
    (lib/query provider table-metadata)))

(declare ^:private $price)

(defmacro ^:private pmbql-query
  {:style/indent 1}
  [table-name & body]
  `(let [query#   (query-for-table-id ~(keyword table-name))
         ~'$price (lib.metadata/field query# (mt/id :venues :price))]
     (-> query#
         ~@body)))

(defmacro ^:private run-pmbql-query
  {:style/indent 1}
  [table-name & body]
  `(qp/process-query (pmbql-query ~table-name ~@body)))

(deftest ^:parallel pipeline-queries-test
  (testing "Ensure that the QP can handle pMBQL queries"
    (is (= [6]
           (mt/first-row
            (run-pmbql-query :venues
              (lib/aggregate (lib/count))
              (lib/filter (lib/= $price 4))))))))

(deftest ^:parallel denormalized-pipeline-queries-test
  (testing "Ensure that the QP can handle pMBQL queries as they'd come in from the REST API or application database"
    (let [query (-> (pmbql-query :venues
                      (lib/aggregate (lib/count))
                      (lib/filter (lib/= $price 4)))
                    (dissoc :lib/metadata)
                    mt/obj->json->obj)]
      (testing (format "Query =\n%s" (u/pprint-to-str query))
        (is (= [6]
               (mt/first-row (qp/process-query query))))))))
