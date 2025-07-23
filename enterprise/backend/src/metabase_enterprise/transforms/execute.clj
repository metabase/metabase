(ns metabase-enterprise.transforms.execute
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]))

(defn execute-query! [driver db-ref [sql & params]]
  (let [query {:native (cond-> {:query sql}
                         params (assoc :params params))
               :type :native
               :database db-ref}]
    (qp.setup/with-qp-setup [query query]
      (let [query (qp.preprocess/preprocess query)]
        (driver/execute-write-query! driver query)))))

(defn execute! [{:keys [db-ref driver sql output-table overwrite?]}]
  (let [output-table (keyword (or output-table (str "transform_" (str/replace (random-uuid) \- \_))))
        query (driver/compile-transform driver {:sql sql :output-table output-table :overwrite? overwrite?})]
    (when overwrite?
      (execute-query! driver db-ref (driver/compile-drop-table driver output-table)))
    (execute-query! driver db-ref query)
    output-table))
