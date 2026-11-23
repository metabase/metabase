(ns metabase.metabot.models.metabot-prompt
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(t2/define-before-update :model/MetabotPrompt
  [prompt]
  (let [changes (t2/changes prompt)]
    (when (and (contains? changes :model) (not (contains? changes :card_id)))
      (throw (ex-info (tru "The model of a suggested prompt follows the type of its Card; change the Card instead.") {:status-code 400})))
    prompt))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- card-types-of
  "The map from the ID of each Card of `rows` to its type; the foreign key on `card_id` refuses a row without a Card."
  [rows]
  (let [card-ids (into [] (comp (map :card_id) (distinct)) rows)]
    (if (seq card-ids) (metabot.db/card-types card-ids) {})))

(defn- add-prompt-models
  "The MetabotPrompt `rows`, each with the type of its Card as its model."
  [rows]
  (let [card-types (card-types-of rows)]
    (mapv #(assoc % :model (card-types (:card_id %))) rows)))

(mu/defn create-metabot-prompts! :- [:sequential ::metabot.schema/metabot-prompt]
  "Insert the MetabotPrompt `rows`, each with the type of its Card as its model, in one transaction, and return the
  inserted prompts. A row without an existing Card fails on the foreign key."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.create]]
  (mdb/create-batched! :model/MetabotPrompt rows {:before-create add-prompt-models}))

(defn- prepare-prompt-updates
  "The `rows` of the prompts of `id->stored`, the id of a MetabotPrompt and the columns to set, the model of a prompt
  whose Card changes set to the type of the new Card."
  [rows id->stored]
  (let [card-types (card-types-of (filter #(contains? % :card_id) rows))]
    (into []
          (comp (filter (comp id->stored :id))
                (map (fn [{:keys [card_id] :as row}]
                       (cond-> row
                         (contains? row :card_id) (assoc :model (card-types card_id))))))
          rows)))

(mu/defn update-metabot-prompts! :- :nil
  "Apply the changes in each of `rows`, the id of a MetabotPrompt and the columns to set, in one transaction, setting
  the model of a prompt whose Card changes to the type of the new Card. A missing Card fails on the foreign key."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.update]]
  (mdb/update-batched! :model/MetabotPrompt rows {:before-update prepare-prompt-updates}))

(mu/defn delete-metabot-prompts! :- :nil
  "Delete the MetabotPrompts with `prompt-ids` in one transaction."
  [prompt-ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/MetabotPrompt prompt-ids {}))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- import-dependencies
  "The Card each of the MetabotPrompt `entities` depends on."
  [entities]
  (mapv (fn [prompt]
          #{[:model/Card (:card_id prompt)]})
        entities))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotPrompt [_model]
  {:skip? false})

(defmethod serialization/spec :model/MetabotPrompt [_]
  {:schema              ::metabot.schema/external-metabot-prompt
   :copy                [:entity_id :model :prompt]
   :parent              {:model :model/Metabot :key :metabot_id :order (juxt :prompt :entity_id)}
   :transform           {:metabot_id serialization/import-only-transform
                         :card_id (serialization/fk-transform :model/Card)}
   :insert!             create-metabot-prompts!
   :update!             update-metabot-prompts!
   :delete!             delete-metabot-prompts!
   :import-dependencies import-dependencies})
