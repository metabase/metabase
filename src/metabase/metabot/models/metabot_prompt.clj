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
  "The map from each of `card-ids` that names a Card to that Card's type; a nil or missing Card has no entry."
  [card-ids]
  (let [card-ids (into [] (comp (keep identity) (distinct)) card-ids)]
    (if (seq card-ids) (metabot.db/card-types card-ids) {})))

(defn- add-prompt-models
  "The MetabotPrompt `rows`, each with the type of its Card as its model."
  [rows]
  ;; A row without an existing Card gets no model, and its insert fails.
  (let [card-types (card-types-of (map :card_id rows))]
    (mapv #(assoc % :model (card-types (:card_id %))) rows)))

(mu/defn create-metabot-prompts! :- [:sequential ::metabot.schema/metabot-prompt]
  "Insert the MetabotPrompt `rows`, each with the type of its Card as its model, in one transaction and return the
  inserted prompts, a row without an existing Card failing the insert."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.create]]
  (mdb/create-batched! :model/MetabotPrompt rows {:before-create add-prompt-models}))

(defn- prepare-prompt-updates
  "The `rows` of the prompts of `id->stored`, the id of a MetabotPrompt and the columns to set, without any `:model`
  of their own. Every row of a prompt the batch gives a Card carries the model of the last such Card: the stored
  model when it is the stored Card, and its type otherwise."
  [rows id->stored]
  ;; The write function is the only author of the model, as on create. A SerDes import sends the changed columns only,
  ;; and its exported model can differ from the one create derived here; taking it would change the model without the
  ;; Card, which the before-update hook refuses. The rows of one prompt are merged with the last value winning, so
  ;; every row of a prompt the batch gives a Card carries that Card's model, and the Card and model are written
  ;; together even when another writer changed them since `id->stored` was read. A row of any other prompt carries
  ;; no model, so it cannot write one read before such a change.
  (let [rows          (filterv (comp id->stored :id) rows)
        id->last-card (reduce (fn [m {:keys [id] :as row}]
                                (cond-> m (contains? row :card_id) (assoc id (:card_id row))))
                              {}
                              rows)
        stored-card?  (fn [id] (= (id->last-card id) (:card_id (id->stored id))))
        card-types    (card-types-of (keep (fn [[id card-id]] (when-not (stored-card? id) card-id)) id->last-card))
        id->model     (into {}
                            (map (fn [[id card-id]]
                                   [id (if (stored-card? id) (:model (id->stored id)) (card-types card-id))]))
                            id->last-card)]
    (mapv (fn [{:keys [id] :as row}]
            (if (contains? id->model id)
              (assoc row :model (id->model id))
              (dissoc row :model)))
          rows)))

(mu/defn update-metabot-prompts! :- :nil
  "Apply the changes in each of `rows`, the id of a MetabotPrompt and the columns to set, in one transaction, setting
  the model of a prompt whose Card changes to the type of the new Card, a missing Card failing the write.
  A `:model` in a row is ignored."
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
   :update!             #(do (update-metabot-prompts! %) %)
   :delete!             delete-metabot-prompts!
   :import-dependencies import-dependencies})
