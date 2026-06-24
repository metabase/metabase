(ns metabase.metabot.models.metabot
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/Metabot [_model] :metabot)

(doto :model/Metabot
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;; NOTE: the `use_verified_content` column now means "use only verified OR curated content" — when on,
;; Metabot search is restricted via the precomputed `curated` flag (see metabase.collections.curation),
;; which covers verified items, official collections, and library/published content, not just verified
;; cards. The column keeps its original name on purpose: renaming it would need an appdb migration and
;; would break the serdes `:copy`/`:defaults` contract and the API/FE field, for no behavioural gain.
;; The user-facing label ("Verified or curated content") carries the broadened meaning instead.

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Metabot :prompts]
  "Hydrate the list of prompts for a collection of metabots."
  [_model k metabots]
  (mi/instances-with-hydrated-data
   metabots k
   #(group-by :metabot_id
              (t2/select :model/MetabotPrompt {:where [:in :metabot_id (map :id metabots)]}))
   :id
   {:default []}))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/hash-fields :model/Metabot
  [_table]
  [:name])

(defmethod serdes/dependencies "Metabot"
  [{:keys [collection_id prompts]}]
  (cond-> (set (mapcat serdes/dependencies prompts))
    collection_id (conj [{:model "Collection" :id collection_id}])))

(defmethod serdes/generate-path "Metabot" [_ metabot]
  [(serdes/infer-self-path "Metabot" metabot)])

(defmethod serdes/storage-path "Metabot" [metabot _ctx]
  [{:label "metabots"} {:label (:name metabot) :key (:entity_id metabot)}])

(defmethod serdes/make-spec "Metabot" [_model-name opts]
  {:copy      [:name :description :entity_id :use_verified_content]
   :transform {:created_at    (serdes/date)
               :updated_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :prompts       (serdes/nested :model/MetabotPrompt :metabot_id (merge {:sort-by (juxt :prompt :created_at)} opts))}
   :defaults  {:use_verified_content false}})
