(ns metabase-enterprise.transforms.execute
  (:require [metabase.driver :as driver]
            [metabase.query-processor.preprocess :as qp.preprocess]
            [metabase.query-processor.setup :as qp.setup]))

(defn- execute-query [driver db sql]
  (let [query {:native {:query sql}
               :type :native
               :database db}]
    (qp.setup/with-qp-setup [query query]
      (let [query (qp.preprocess/preprocess query)]
        (driver/execute-write-query! driver query)))))

(defn execute [{:keys [db driver sql output-table overwrite?]}]
  (let [output-table (keyword (or output-table (str "transform_" (random-uuid))))
        query (driver/compile-transform driver {:sql sql :output-table output-table :overwrite? overwrite?})]
    (when overwrite?
      (execute-query driver db (driver/drop-transform driver output-table)))
    (execute-query driver db query)
    output-table))
