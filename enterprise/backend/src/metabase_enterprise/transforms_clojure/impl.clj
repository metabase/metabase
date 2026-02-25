(ns metabase-enterprise.transforms-clojure.impl
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :clojure)

(defmethod transforms.i/target-db-id :clojure
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :clojure
  [transform]
  (-> transform :source :source-database))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :clojure
  [transform options]
  (runner.execute/execute-runner-transform!
   transform options
   {:runtime "clojure"
    :label "Clojure"
    :timing-key :clojure-execution}))

(defmethod transforms.i/table-dependencies :clojure
  [transform]
  (into #{}
        (map runner.execute/source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))
