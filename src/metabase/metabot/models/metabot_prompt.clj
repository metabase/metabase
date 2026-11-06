(ns metabase.metabot.models.metabot-prompt
  (:require
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.serialization.core :as serialization]
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

(defmethod serdes/generate-path "MetabotPrompt" [_ entity]
  (conj (serdes/generate-path "Metabot" (metabot.db/metabot (:metabot_id entity)))
        (serdes/infer-self-path "MetabotPrompt" entity)))

(defmethod serdes/deserialization-dependencies "MetabotPrompt" [prompt]
  #{[{:model "Card" :id (:card_id prompt)}]})

(defmethod serdes/make-spec "MetabotPrompt" [_model-name _opts]
  {:schema    ::metabot.schema/external-metabot-prompt
   :copy      [:entity_id :prompt]
   :transform {:model      (serdes/kw)
               :card_id    (serdes/fk :model/Card)
               :metabot_id (serdes/parent-ref)}})

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serialization/spec :model/MetabotPrompt [_]
  {:schema    ::metabot.schema/external-metabot-prompt
   :copy      [:entity_id :prompt]
   :parent    {:model :model/Metabot :key :metabot_id :order (juxt :prompt :entity_id)}
   :transform {:metabot_id serialization/import-only-transform
               :model   serialization/keyword-transform
               :card_id (serialization/fk-transform :model/Card)}})

(defmethod serialization/import-dependencies :model/MetabotPrompt [_ entities]
  (mapv (fn [prompt]
          #{[:model/Card (:card_id prompt)]})
        entities))
