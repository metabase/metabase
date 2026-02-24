(ns metabase-enterprise.transforms-python.impl
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.util]))

(defmethod transforms.i/target-db-id :python
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :python
  [transform]
  (-> transform :source :source-database))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :python
  [transform options]
  (runner.execute/execute-runner-transform!
   transform options
   {:runtime "python"
    :label "Python"
    :timing-key :python-execution
    :transform-type-pred transforms.util/python-transform?}))

(defmethod transforms.i/table-dependencies :python
  [transform]
  (into #{}
        (map runner.execute/source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))
