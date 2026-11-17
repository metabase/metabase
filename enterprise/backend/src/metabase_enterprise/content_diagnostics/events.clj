(ns metabase-enterprise.content-diagnostics.events
  "Keep content-diagnostics findings consistent with entity lifecycle. When a flagged entity is archived
  (card/dashboard/document) or deleted, or a collection subtree is archived, its active findings are invalidated so it
  drops out of the served set immediately instead of lingering until the next scan."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.content-diagnostics.db :as content-diagnostics.db]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

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

(events/derive! ::event :metabase/event)
(doseq [model [:card :dashboard :document :transform :collection]
        op    [:update :delete]]
  (events/derive! (keyword "event" (str (name model) "-" (name op))) ::event))

(methodical/defmethod events/publish-event! ::event
  [topic {:keys [object changes]}]
  (when (premium-features/has-feature? :content-diagnostics)
    (let [model     (t2/model object)
          deleted?  (str/ends-with? (name topic) "-delete")
          archived? (true? (:archived changes))]
      (cond
        (and (= :model/Collection model) archived?)
        (invalidate! {:collection-id (:id object)}
                     #(let [archived (content-diagnostics.db/collection (:id object))]
                        (finding/invalidate-for-collection-subtree!
                         (conj (collection/descendant-ids archived) (:id object)))))

        (and (entity-types model) (or deleted? archived?))
        (invalidate! {:entity-type (entity-types model) :entity-id (:id object)}
                     #(finding/invalidate-for-entity! (entity-types model) (:id object)))))))
