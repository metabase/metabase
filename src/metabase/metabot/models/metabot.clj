(ns metabase.metabot.models.metabot
  (:require
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
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
              (metabot.db/prompts-for-metabots (map :id metabots)))
   :id
   {:default []}))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serialization/storage-paths :model/Metabot [_ entities _ctx]
  (mapv (fn [metabot]
          [{:label "metabots"} {:label (:name metabot) :key (:entity_id metabot)}])
        entities))

(defmethod serialization/spec :model/Metabot [_]
  {:schema    ::metabot.schema/external-metabot
   :copy      [:name :description :entity_id :use_verified_content]
   :transform {:collection_id (serialization/fk-transform :model/Collection)}
   :children  {:prompts :model/MetabotPrompt}
   :defaults  {:use_verified_content false}})

(defmethod serialization/import-dependencies :model/Metabot [_ entities]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            #{[:model/Collection collection_id]}))
        entities))
