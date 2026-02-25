(ns metabase-enterprise.transforms-javascript.impl
  (:require
   [metabase-enterprise.transforms-runner.execute :as runner.execute]
   [metabase.transforms.interface :as transforms.i]))

(transforms.i/register-runner! :javascript)

(defmethod transforms.i/target-db-id :javascript
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :javascript
  [transform]
  (-> transform :source :source-database))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :javascript
  [transform options]
  (runner.execute/execute-runner-transform!
   transform options
   {:runtime "javascript"
    :label "JavaScript"
    :timing-key :javascript-execution}))

(defmethod transforms.i/table-dependencies :javascript
  [transform]
  (into #{}
        (map runner.execute/source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))
