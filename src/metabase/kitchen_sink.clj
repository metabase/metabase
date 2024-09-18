(ns metabase.kitchen-sink
  (:require [toucan2.core :as t2]
            [metabase.plugins.classloader :as classloader]
            [metabase.util.grouper :as grouper]
            [clojure.java.io :as io]))


(defn- parent-collection-is-kitchen-sink?
  [m]
  (= "Kitchen Sink"
     (t2/select-one-fn :name :model/Collection :id (:collection_id m))))

(defn sync-kitchen-sink*
  [vs]
  (classloader/require 'metabase.models.serialization)
  (classloader/require 'metabase-enterprise.serialization.v2.extract)
  (classloader/require 'metabase-enterprise.serialization.v2.storage)
  (try
    (-> ((resolve 'metabase-enterprise.serialization.v2.extract/extract)
         {:include-database-secrets true
          :selective-metadata true
          :targets (conj vs ["Collection" (t2/select-one-pk :model/Collection
                                                            :name "Kitchen Sink")])})
        ((resolve 'metabase-enterprise.serialization.v2.storage/store!) (io/file "dev/kitchen-sink")))
    (catch Exception e
      (prn e))))

(def ^:private
  sync-kitchen-sync-queue
  (delay
    (grouper/start!
     sync-kitchen-sink*
     :capacity 10
     :interval 2000)))

(defn sync-kitchen-sink!
  "Sinks the kitchen sync. Or no, sinks the kitchen sink."
  [v]
  (grouper/submit! @sync-kitchen-sync-queue
                   [(-> v t2/model name) (:id v)]))

(defn maybe-sync-kitchen-sink!
  "Maybe syncs the kitchen sync."
  [m]
  (cond-> m
    (parent-collection-is-kitchen-sink? m) sync-kitchen-sink!))
