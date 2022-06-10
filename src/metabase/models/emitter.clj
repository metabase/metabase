(ns metabase.models.emitter
  (:require
   [medley.core :as m]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.models :as models]))

(models/defmodel CardEmitter :card_emitter)
(models/defmodel DashboardEmitter :dashboard_emitter)
(models/defmodel Emitter :emitter)
(models/defmodel EmitterAction :emitter_action)

(defn- normalize-parameter-mappings
  [parameter-mappings]
  (into {}
        (map (fn [[param-id target]]
               [param-id (:target (mbql.normalize/normalize-query-parameter {:target target}))]))
        parameter-mappings))

(models/add-type! ::parameter-mappings
  :in  (comp mi/json-in normalize-parameter-mappings)
  :out (comp (mi/catch-normalization-exceptions normalize-parameter-mappings) mi/json-out-with-keywordization))

(u/strict-extend
    (class Emitter)
    models/IModel
    (merge models/IModelDefaults
           {:types          (constantly {:parameter_mappings ::parameter-mappings
                                         :options            :json})
            :properties     (constantly {:timestamped? true})}))

(u/strict-extend
  (class EmitterAction)
  models/IModel
  (merge models/IModelDefaults
         ;; This is ok as long as we're 1:1
         {:primary-key (constantly :emitter_id)}))

(defn- pre-insert
  [{action-id :action_id, :as emitter}]
  {:pre [(integer? action-id)]}
  (let [base-emitter (db/insert! Emitter (select-keys emitter [:parameter_mappings :options]))]
    (db/insert! EmitterAction (-> emitter
                                  (select-keys [:action_id])
                                  (assoc :emitter_id (:id base-emitter))))
    (-> emitter
        (select-keys [:dashboard_id :card_id])
        (assoc :emitter_id (u/the-id base-emitter)))))

(defn- pre-update
  [emitter]
  (when-some [base-emitter (not-empty (select-keys emitter [:parameter_mappings :options]))]
    (db/update! Emitter (:emitter_id emitter) base-emitter))
  (when-some [emitter-action (-> emitter
                                 (select-keys [:action_id])
                                 not-empty)]
    (db/update! EmitterAction (:emitter_id emitter) emitter-action))
  (not-empty (select-keys emitter [:emitter_id :dashboard_id :card_id])))

(defn- pre-delete
  [emitter]
  (db/delete! Emitter :id (:emitter_id emitter))
  emitter)

(def ^:private Emitter-subtype-IModel-impl
  "[[models/IModel]] impl for `DashboardEmitter` and `CardEmitter`"
  (merge models/IModelDefaults
         {:primary-key (constantly :emitter_id) ; This is ok as long as we're 1:1
          :pre-delete pre-delete
          :pre-update pre-update
          :pre-insert pre-insert}))

(u/strict-extend (class DashboardEmitter)
  models/IModel
  Emitter-subtype-IModel-impl)

(u/strict-extend (class CardEmitter)
  models/IModel
  Emitter-subtype-IModel-impl)

(defn emitters
  "Hydrate emitters onto a list of dashboards or cards."
  {:batched-hydrate :emitters}
  [items]
  (if-let [[emitter-type join-column] (cond
                                        (every? #(= (class Dashboard) (type %)) items)
                                        [DashboardEmitter :dashboard_id]

                                        (every? #(= (class Card) (type %)) items)
                                        [CardEmitter :card_id])]
    (let [qualified-join-column (keyword (str "typed_emitter." (name join-column)))
          emitters (->> {:select [qualified-join-column
                                  :emitter.id
                                  :emitter.options
                                  :emitter.parameter_mappings
                                  :emitter.created_at
                                  :emitter.updated_at]
                         :from [[emitter-type :typed_emitter]]
                         :join [[Emitter :emitter] [:= :emitter.id :typed_emitter.emitter_id]]
                         :where [:in qualified-join-column (map :id items)]}
                        (db/query)
                        (db/do-post-select Emitter)
                        (group-by join-column))]
      (map #(m/assoc-some % :emitters (get emitters (:id %)))
           items))
    items))
