(ns metabase-enterprise.metabot-v3.models.metabot-entity
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotEntity [_model] :metabot_entity)

(doto :model/MetabotEntity
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/MetabotEntity
  {:model mi/transform-keyword})

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/hash-fields :model/MetabotEntity
  [_table]
  [:metabot_id :model :model_id])

(defmethod serdes/dependencies "MetabotEntity"
  [{:keys [model model_id prompts]}]
  (into #{[{:model (case model
                     "collection" "Collection"
                     ("dataset" "metric") "Card")
            :id model_id}]}
        (mapcat serdes/dependencies prompts)))

(defmethod serdes/generate-path "MetabotEntity" [_ entity]
  [(serdes/infer-self-path "Metabot" (t2/select-one :model/Metabot :id (:metabot_id entity)))
   (serdes/infer-self-path "MetabotEntity" entity)])

(defmethod serdes/make-spec "MetabotEntity" [_model-name opts]
  {:copy      [:entity_id]
   :transform {:created_at (serdes/date)
               :model      (serdes/kw)
               :model_id   {::fk true
                            :export-with-context (fn [{:keys [model model_id]} _ _]
                                                   (serdes/*export-fk* model_id (case model
                                                                                  :collection        :model/Collection
                                                                                  (:dataset :metric) :model/Card)))
                            :import-with-context (fn [{:keys [model model_id]} _ _]
                                                   (serdes/*import-fk* model_id (case model
                                                                                  "collection"         :model/Collection
                                                                                  ("dataset" "metric") :model/Card)))}
               :metabot_id (serdes/parent-ref)
               :prompts    (serdes/nested :model/MetabotPrompt :metabot_entity_id opts)}})
