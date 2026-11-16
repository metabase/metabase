(ns metabase.metabot.models.metabot-prompt
  (:require
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotPrompt [_model] :metabot_prompt)

(doto :model/MetabotPrompt
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/MetabotPrompt
  {:model mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- card-types
  "The type of the Card of each of `prompts`, by Card id, loaded together."
  [prompts]
  (if-let [card-ids (not-empty (into #{} (keep :card_id) prompts))]
    (metabot.db/card-types-by-id (vec card-ids))
    {}))

(defn- card-model
  "The `:model` of `prompt`: the type of its Card, per `card-id->type`."
  [{:keys [card_id]} card-id->type]
  (or (card-id->type card_id)
      (throw (ex-info (tru "A suggested prompt needs an existing Card.") {:status-code 400}))))

(mi/define-before-insert :model/MetabotPrompt
  [prompts]
  (let [card-id->type (card-types prompts)]
    (for [prompt prompts]
      (assoc prompt :model (card-model prompt card-id->type)))))

(mi/define-before-update :model/MetabotPrompt
  [prompts]
  (let [card-id->type (card-types (filter #(contains? (t2/changes %) :card_id) prompts))]
    (for [prompt prompts
          :let   [changes (t2/changes prompt)]]
      (do
        (when (and (contains? changes :model) (not (contains? changes :card_id)))
          (throw (ex-info (tru "A suggested prompt''s model is the type of its Card.") {:status-code 400})))
        (cond-> prompt
          (contains? changes :card_id) (assoc :model (card-model prompt card-id->type)))))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

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
