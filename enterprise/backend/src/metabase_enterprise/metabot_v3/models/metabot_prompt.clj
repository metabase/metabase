(ns metabase-enterprise.metabot-v3.models.metabot-prompt
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotPrompt [_model] :metabot_prompt)

(doto :model/MetabotPrompt
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/MetabotPrompt
  {:model mi/transform-keyword})

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/hash-fields :model/MetabotPrompt
  [_table]
  [:metabot_entity_id :model :card_id :prompt])

(defmethod serdes/generate-path "MetabotPrompt" [_ entity]
  (conj (serdes/generate-path "MetabotEntity" (t2/select-one :model/MetabotEntity (:metabot_entity_id entity)))
        (serdes/infer-self-path "MetabotPrompt" entity)))

(defmethod serdes/dependencies "MetabotPrompt" [prompt]
  #{[{:model "Card" :id (:card_id prompt)}]})

(defmethod serdes/make-spec "MetabotPrompt" [_model-name _opts]
  {:copy      [:entity_id :prompt]
   :transform {:created_at        (serdes/date)
               :updated_at        (serdes/date)
               :model             (serdes/kw)
               :card_id           (serdes/fk :model/Card)
               :metabot_entity_id (serdes/parent-ref)}})
