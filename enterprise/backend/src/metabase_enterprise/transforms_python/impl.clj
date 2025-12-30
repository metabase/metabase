(ns metabase-enterprise.transforms-python.impl
  (:require
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.interface :as transforms.i]))

(defmethod transforms.i/target-db-id :python
  [transform]
  (or (get-in transform [:target :database])
      (:target_db_id transform)))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :python
  [transform options]
  (transforms-python.execute/execute-python-transform! transform options))

(defmethod transforms.i/table-dependencies :python
  [transform]
  (into #{}
        (map #(hash-map :table %))
        (vals (get-in transform [:source :source-tables]))))
