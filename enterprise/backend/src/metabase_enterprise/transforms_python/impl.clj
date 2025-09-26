(ns metabase-enterprise.transforms-python.impl
  (:require
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.interface :as transforms.i]))

(defmethod transforms.i/target-db-id :python
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :python
  [transform]
  (-> transform :source :database))

(defmethod transforms.i/execute! :python
  [transform options]
  (transforms-python.execute/execute! transform options))
