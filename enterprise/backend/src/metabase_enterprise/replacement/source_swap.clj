(ns metabase-enterprise.replacement.source-swap
  (:require
   [metabase-enterprise.dependencies.models.dependency :as deps.models.dependency]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [toucan2.core :as t2]))

(defn- normalize-mbql-stages [query]
  (metabase.lib.walk/walk-clauses
   query
   (fn [query path-type path clause]
     (when (lib/is-field-clause? clause)
       (-> (metabase.lib.walk/apply-f-for-stage-at-path lib/metadata query path clause)
           lib/ref)))))

(defn- normalize-native-stages [query]
  ;; TODO: make this work
  query)

(defn- normalize-query [query]
  (cond-> query
    (lib/any-native-stage? query) normalize-native-stages
    (not (lib/native-only-query? query)) normalize-mbql-stages))

(def ^:private source-type->stage-key
  {:card :source-card
   :table :source-table})

(defn- update-mbql-stages [query [old-source-type old-source-id] [new-source-type new-source-id] id-updates]
  (let [old-key (source-type->stage-key old-source-type)
        new-key (source-type->stage-key new-source-type)]
    (metabase.lib.walk/walk
     query
     (fn [query path-type path stage-or-join]
       (cond-> stage-or-join
         (= (old-key stage-or-join) old-source-id) (-> (dissoc old-key)
                                                       (assoc new-key new-source-id)))))))

(defn- update-native-stages [query _old-source _new-source _id-updates]
  ;; TODO: make this work
  query)

(defn- update-query [query old-source new-source id-updates]
  (cond-> query
    (lib/any-native-stage? query) (update-native-stages old-source new-source id-updates)
    (not (lib/native-only-query? query)) (update-mbql-stages old-source new-source id-updates)))

(defn- update-entity-query [f entity-type entity-id]
  (case entity-type
    :card (do (let [card (t2/select-one :model/Card :id entity-id)
                    new-query (f (:dataset_query card))
                    updated (assoc card :dataset_query new-query)]
                (t2/update! :model/Card entity-id {:dataset_query new-query})
                ;; TODO: not sure we really want this code to have to know about dependency tracking
                ;; TODO: publishing this event twice per update seems bad
                (events/publish-event! :event/card-dependency-backfill
                                       {:object updated})))
    nil))

(defn swap-source [[old-source-type old-source-id :as old-source]
                   [new-source-type new-source-id :as new-source]]
  ;; TODO: support converting from tables (requires handling field ids directly)
  (assert (= (first old-source) :card))
  (let [children (deps.models.dependency/transitive-dependents
                  (deps.models.dependency/filtered-graph-dependents nil (fn [entity-type-field entity-id-field]
                                                                          [:not= entity-type-field "transform"]))
                  {old-source-type [{:id old-source-id}]})]
    (doseq [[child-type child-ids] children
            child-id child-ids]
      (update-entity-query #(-> (normalize-query %)
                                (update-query old-source new-source {}))
                           child-type child-id))))
