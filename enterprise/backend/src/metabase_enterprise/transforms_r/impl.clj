(ns metabase-enterprise.transforms-r.impl
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :r)

(defmethod transforms.i/target-db-id :r
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :r
  [transform]
  (-> transform :source :source-database))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :r
  [transform options]
  (runner.execute/execute-runner-transform!
   transform options
   {:runtime "r"
    :label "R"
    :timing-key :r-execution}))

(defmethod transforms.i/table-dependencies :r
  [transform]
  (into #{}
        (map runner.execute/source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))
