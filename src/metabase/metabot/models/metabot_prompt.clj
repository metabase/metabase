(ns metabase.metabot.models.metabot-prompt
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
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

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- import-dependencies
  "The Card each of the MetabotPrompt `entities` depends on."
  [entities]
  (mapv (fn [prompt]
          #{[:model/Card (:card_id prompt)]})
        entities))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- card-types-of
  "The map from the ID of each Card of `rows` to its type, throwing a 400 when a row has no existing Card."
  [rows]
  (let [card-ids   (into [] (comp (map :card_id) (distinct)) rows)
        card-types (if (seq card-ids) (metabot.db/card-types card-ids) {})]
    (when (some #(nil? (card-types (:card_id %))) rows)
      (throw (ex-info (tru "A suggested prompt needs an existing Card.") {:status-code 400})))
    card-types))

(mu/defn create-metabot-prompts! :- [:sequential ::metabot.schema/metabot-prompt]
  "Insert the MetabotPrompt `rows`, each with the type of its Card as its model, and return the inserted prompts. Throws a
  400 when the Card of a row does not exist."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.create]]
  (if (seq rows)
    (let [card-types (card-types-of rows)]
      (t2/with-transaction [_conn]
        (metabot.db/insert-prompts! (mapv #(assoc % :model (card-types (:card_id %))) rows))))
    []))

(mu/defn update-metabot-prompts! :- :nil
  "Apply the changes in `changes-by-id`, a map from the id of a MetabotPrompt to its changes, setting the model of a
  prompt whose Card changes to the type of the new Card. Throws a 400 when that Card does not exist."
  [changes-by-id :- [:map-of ms/PositiveInt ::metabot.schema/metabot-prompt.update]]
  (let [with-card  (filter (comp #(contains? % :card_id) val) changes-by-id)
        card-types (when (seq with-card) (card-types-of (map val with-card)))
        changes-by-id (into {}
                            (map (fn [[id {:keys [card_id] :as changes}]]
                                   [id (cond-> changes (contains? changes :card_id) (assoc :model (card-types card_id)))]))
                            changes-by-id)]
    (t2/with-transaction [_conn]
      (doseq [[changes pairs] (group-by val changes-by-id)
              :when           (seq changes)]
        (metabot.db/update-prompts! (mapv key pairs) changes)))))

(mu/defn delete-metabot-prompts! :- :nil
  "Delete the MetabotPrompts with `prompt-ids`."
  [prompt-ids :- [:sequential ms/PositiveInt]]
  (when (seq prompt-ids)
    (t2/with-transaction [_conn]
      (metabot.db/delete-prompts! (vec prompt-ids))))
  nil)

(mu/defn delete-metabot-prompt! :- :nil
  "Delete the MetabotPrompt with `prompt-id` belonging to the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt
   prompt-id  :- ms/PositiveInt]
  (metabot.db/delete-metabot-prompt! metabot-id prompt-id)
  nil)

(mu/defn delete-metabot-prompts-for-metabot! :- :nil
  "Delete the MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt]
  (metabot.db/delete-prompts-for-metabot! metabot-id)
  nil)

(defn- insert-imported-prompts!
  "Insert the MetabotPrompt `rows` of an import, whose model follows the type of their Card."
  [rows]
  (create-metabot-prompts! (mapv #(dissoc % :model) rows)))

(defn- update-imported-prompts!
  "Update the MetabotPrompts of an import with `rows`, each its id and changed columns, returning `rows`."
  [rows]
  (update-metabot-prompts! (into {} (map (fn [{:keys [id] :as row}]
                                           [id (cond-> (dissoc row :id)
                                                 (contains? row :card_id) (dissoc :model))]))
                                 rows))
  rows)

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotPrompt [_model]
  {:skip? false})

(defmethod serialization/spec :model/MetabotPrompt [_]
  {:schema              ::metabot.schema/external-metabot-prompt
   :copy                [:entity_id :model :prompt]
   :parent              {:model :model/Metabot :key :metabot_id :order (juxt :prompt :entity_id)}
   :transform           {:metabot_id serialization/import-only-transform
                         :card_id (serialization/fk-transform :model/Card)}
   :insert!             insert-imported-prompts!
   :update!             update-imported-prompts!
   :delete!             delete-metabot-prompts!
   :import-dependencies import-dependencies})
