(ns metabase-enterprise.metabot-v3.models.metabot
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

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Metabot :prompts]
  "Hydrate the list of prompts for a collection of metabots."
  [_model hydration-key metabots]
  (mi/instances-with-hydrated-data
   metabots
   hydration-key
   #(group-by :metabot_id
              (t2/select :model/MetabotPrompt {:where [:in :metabot_id (map :id metabots)]}))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/Metabot :use_cases]
  "Hydrate the list of use cases for a collection of metabots."
  [_model hydration-key metabots]
  (mi/instances-with-hydrated-data
   metabots
   hydration-key
   #(group-by :metabot_id
              (t2/select :model/MetabotUseCase
                         {:where    [:in :metabot_id (map :id metabots)]
                          :order-by [[:name :asc]]}))
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

(defmethod serdes/make-spec "Metabot" [_model-name opts]
  {:copy      [:name :description :entity_id :use_verified_content]
   :transform {:created_at    (serdes/date)
               :updated_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :prompts       (serdes/nested :model/MetabotPrompt :metabot_id opts)
               :use_cases     (serdes/nested :model/MetabotUseCase :metabot_id opts)}})
