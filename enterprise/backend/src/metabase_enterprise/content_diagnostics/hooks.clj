(ns metabase-enterprise.content-diagnostics.hooks
  "Implements the hooks of `metabase.content-diagnostics.hooks`: the findings of an entity that is archived or deleted,
  and of a Collection subtree that is archived, are invalidated, so they drop out of the served set at once instead of
  lingering until the next scan."
  (:require
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [metabase.util.write-batch :as write-batch]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entity-types
  "The entity type of the findings of each model that has them."
  {:model/Card      :card
   :model/Dashboard :dashboard
   :model/Document  :document
   :model/Transform :transform})

(defn- invalidate!
  "Run `invalidate-thunk`, logging a failure instead of rethrowing it, so it does not fail the write."
  [log-ctx invalidate-thunk]
  (try
    (invalidate-thunk)
    (catch Throwable e
      (log/errorf "Failed to invalidate content-diagnostics findings %s: %s" log-ctx (ex-message e)))))

(defn- invalidate-entity-later!
  "Have the findings of the entity `entity-type` `entity-id` invalidated once the batch of writes ends."
  [entity-type entity-id]
  (write-batch/mark! [::entity entity-type entity-id]
                     (constantly nil)
                     (fn [_]
                       (invalidate! {:entity-type entity-type :entity-id entity-id}
                                    #(finding/invalidate-for-entity! entity-type entity-id)))))

(defn- invalidate-subtree-later!
  "Have the findings of the Collection `collection` and its descendants invalidated once the batch of writes ends."
  [{collection-id :id :as collection}]
  (let [ids (conj (collection/descendant-ids collection) collection-id)]
    (write-batch/mark! [::subtree collection-id]
                       (constantly nil)
                       (fn [_]
                         (invalidate! {:collection-id collection-id}
                                      #(finding/invalidate-for-collection-subtree! ids))))))

(defenterprise before-update
  "Invalidate the findings of `row` of `model` when the update archives it, and those of a Collection subtree when the
  update archives the Collection."
  :feature :content-diagnostics
  [model row]
  (when (and (:archived (t2/changes row)) (:archived row))
    (if (= model :model/Collection)
      (invalidate-subtree-later! row)
      (when-let [entity-type (entity-types model)]
        (invalidate-entity-later! entity-type (:id row))))))

(defenterprise before-delete
  "Invalidate the findings of `row` of `model` when it is deleted."
  :feature :content-diagnostics
  [model row]
  (when-let [entity-type (entity-types model)]
    (invalidate-entity-later! entity-type (:id row))))
