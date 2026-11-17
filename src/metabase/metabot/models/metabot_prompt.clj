(ns metabase.metabot.models.metabot-prompt
  (:require
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
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

(defmethod serialization/spec :model/MetabotPrompt [_]
  {:schema    ::metabot.schema/external-metabot-prompt
   :copy      [:entity_id :model :prompt]
   :parent    {:model :model/Metabot :key :metabot_id :order (juxt :prompt :entity_id)}
   :transform {:metabot_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})

(defmethod serialization/import-dependencies :model/MetabotPrompt [_ entities]
  (mapv (fn [prompt]
          #{[:model/Card (:card_id prompt)]})
        entities))
