(ns metabase-enterprise.transforms.query-impl
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.interface :as transforms.i]))

(set! *warn-on-reflection* true)

(defmethod transforms.i/source-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms.i/target-db-id :query
  [transform]
  (-> transform :source :query :database))

(defmethod transforms.i/execute! :query [transform opts]
  (transforms.execute/run-mbql-transform! transform opts))
