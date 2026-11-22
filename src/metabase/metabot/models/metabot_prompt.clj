(ns metabase.metabot.models.metabot-prompt
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
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

(mu/defn create-metabot-prompts! :- [:sequential ::metabot.schema/metabot-prompt]
  "Insert the MetabotPrompt `rows`, each with the type of its Card as its model, and return the inserted prompts. A row
  without an existing Card fails on the foreign key."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.create]]
  (if (seq rows)
    (let [card-types (card-types-of rows)]
      (t2/with-transaction [_conn]
        (metabot.db/insert-prompts! (mapv #(assoc % :model (card-types (:card_id %))) rows))))
    []))

(mu/defn update-metabot-prompts-for-import! :- :nil
  "Apply the changes in `rows`, each the `:id` of a MetabotPrompt and the columns to set, one row after the other,
  setting the model of a prompt whose Card changes to the type of the new Card. A missing Card fails on the foreign key.
  SerDes import writes a few rows with their own values each, so this is not one statement for all of them."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.update]]
  (t2/with-transaction [_conn]
    (doseq [{:keys [id card_id] :as row} rows
            :let [changes (cond-> (dissoc row :id)
                            (contains? row :card_id) (assoc :model ((card-types-of [row]) card_id)))]]
      (metabot.db/update-prompts! [id] changes)))
  nil)

(mu/defn delete-metabot-prompts! :- :nil
  "Delete the MetabotPrompts with `prompt-ids`."
  [prompt-ids :- [:sequential ms/PositiveInt]]
  (when (seq prompt-ids)
    (t2/with-transaction [_conn]
      (metabot.db/delete-prompts! (vec prompt-ids))))
  nil)

(mu/defn delete-metabot-prompts-for-metabots! :- :nil
  "Delete every MetabotPrompt of the Metabots with `metabot-ids` in one statement, which the regeneration of a
  Metabot's suggested prompts needs."
  [metabot-ids :- [:sequential ms/PositiveInt]]
  (when (seq metabot-ids)
    (metabot.db/delete-prompts-for-metabots! (vec metabot-ids)))
  nil)

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
   :update!             update-metabot-prompts-for-import!
   :delete!             delete-metabot-prompts!
   :import-dependencies import-dependencies})
