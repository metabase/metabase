(ns metabase-enterprise.transforms-julia.impl
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :julia)

(defmethod transforms.i/target-db-id :julia
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :julia
  [transform]
  (-> transform :source :source-database))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :julia
  [transform options]
  (runner.execute/execute-runner-transform!
   transform options
   {:runtime "julia"
    :label "Julia"
    :timing-key :julia-execution}))

(defmethod transforms.i/table-dependencies :julia
  [transform]
  (into #{}
        (map runner.execute/source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))
