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
  "We currently support two ways of creating a CardEmitter or DashboardEmitter:

   1. Automatically create the base `Emitter` and `EmitterAction` at the same time. Pass in `:action_id` but not
      `:emitter_id`. This was the original way we coded this but it actually causes a few issues since H2 doesn't seem
      to return the newly created object when you do things this way

   2. Create the base `Emitter` and `EmitterAction` by hand. Pass in `:emitter_id` but not `:action_id`. This is
      probably preferable going forward because H2 does the right thing when you do it this way."
  [{action-id :action_id, emitter-id :emitter_id, :as emitter}]
  ;; if `emitter_id` was passed then assume the Base `Emitter` was created manually. Otherwise, create one
  ;; automatically.
  (let [base-emitter (if emitter-id
                       (db/select-one Emitter :id emitter-id)
                       (db/insert! Emitter (select-keys emitter [:parameter_mappings :options])))]
    ;; if `action_id` was passed then automatically create an `EmitterAction`. Otherwise assume it was created manually.
    (when action-id
      (db/insert! EmitterAction {:action_id action-id, :emitter_id (u/the-id base-emitter)}))
    ;; ok now Toucan should be able to create the `CardEmitter`/`DashboardEmitter` for us.
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
          :pre-delete  pre-delete
          :pre-update  pre-update
          :pre-insert  pre-insert}))

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
