(ns metabase.kitchen-sink
  (:require [toucan2.core :as t2]
            [metabase.kitchen-sink-data :as ksd]
            [metabase.util :as u]
            [metabase.plugins.classloader :as classloader]
            [metabase.util.grouper :as grouper]
            [clojure.java.io :as io]
            [clojure.set :as set ]
            [metabase.models.collection :as collection]))

(defn sync-kitchen-sink*
  [vs]
  (let [kitchen-sink-collections (ksd/kitchen-sink-collections)
        kitchen-sink-gp (t2/select-one :model/Collection :name "Kitchen Sinks")
        entity-id->coll (merge
                         (t2/select-fn->fn :entity_id identity :model/Collection :entity_id [:in (keys kitchen-sink-collections)])
                         (t2/select-fn->fn :entity_id identity :model/Collection :location (collection/children-location kitchen-sink-gp)))
        entity-id->file (fn [entity-id]
                          (or (get kitchen-sink-collections entity-id)
                              (io/file "dev" "kitchen_sink" (u/slugify (:name (entity-id->coll entity-id))))))
        kitchen-sink-ids (into #{} (map :id (vals entity-id->coll)))
        id->entity-id (t2/select-pk->fn :entity_id :model/Collection :id [:in kitchen-sink-ids])
        sync-targets (->> vs
                          (filter #(contains? kitchen-sink-ids (:collection_id %)))
                          (map (fn [instance]
                                 {:file  (entity-id->file (id->entity-id (:collection_id instance)))
                                  :collection-id (:collection_id instance)}))
                          (into #{}))]

    (classloader/require 'metabase.models.serialization)
    (classloader/require 'metabase-enterprise.serialization.v2.extract)
    (classloader/require 'metabase-enterprise.serialization.v2.storage)
    (doseq [{:keys [file collection-id]} sync-targets]
      (try
        (-> ((resolve 'metabase-enterprise.serialization.v2.extract/extract)
             {:include-database-secrets true
              :selective-metadata true
              :targets [["Collection" collection-id]]})
            ((resolve 'metabase-enterprise.serialization.v2.storage/store!) file))
        (catch Exception e
          (prn e))))))

(def ^:private
  sync-kitchen-sync-queue
  (delay
    (grouper/start!
     sync-kitchen-sink*
     :capacity 10
     :interval 2000)))

(defn maybe-sync-kitchen-sink!
  "Sinks the kitchen sync. Or no, sinks the kitchen sink."
  [v]
  (grouper/submit! @sync-kitchen-sync-queue v))
