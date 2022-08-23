(ns metabase.models.emitter
  (:require
   [honeysql.core :as hsql]
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

(defn- normalize-parameter-mappings
  [parameter-mappings]
  (into {}
        (map (fn [[param-id target]]
               [param-id (:target (mbql.normalize/normalize-query-parameter {:target target}))]))
        parameter-mappings))

(models/add-type! ::parameter-mappings
  :in  (comp mi/json-in normalize-parameter-mappings)
  :out (comp (mi/catch-normalization-exceptions normalize-parameter-mappings) mi/json-out-with-keywordization))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class Emitter)
  models/IModel
  (merge models/IModelDefaults
         {:types          (constantly {:parameter_mappings ::parameter-mappings
                                       :options            :json})
          :properties     (constantly {:timestamped? true})}))

(def ^:private Emitter-subtype-IModel-impl
  "[[models/IModel]] impl for `DashboardEmitter` and `CardEmitter`"
  (merge models/IModelDefaults
         ; This is ok as long as we're 1:1
         {:primary-key (constantly :emitter_id)}))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class DashboardEmitter)
  models/IModel
  Emitter-subtype-IModel-impl)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class CardEmitter)
  models/IModel
  Emitter-subtype-IModel-impl)

(defn emitters
  "Hydrate emitters onto a list of dashboards or cards."
  {:batched-hydrate :emitters}
  [items]
  (if-let [[emitter-type join-column] (cond
                                        (every? #(mi/instance-of? Dashboard %) items)
                                        [DashboardEmitter :dashboard_id]

                                        (every? #(mi/instance-of? Card %) items)
                                        [CardEmitter :card_id])]
    (let [qualified-join-column (keyword (str "typed_emitter." (name join-column)))
          emitters (->> {:select [qualified-join-column
                                  :emitter.id
                                  :emitter.action_id
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

(defn card-emitter-usages
  "Hydrates emitter usages given a list of cards, this is used e.g. to show the user what else deleting a card will
  modify."
  {:batched-hydrate :card/emitter-usages}
  [cards]
  (if-let [card-ids (seq (map :id (filter :is_write cards)))]
    (let [emitter-usages (db/query {:select [:query_action.card_id
                                             [(hsql/call "coalesce" :report_dashboard.id :report_card.id) :id]
                                             [(hsql/call "coalesce" :report_dashboard.name :report_card.name) :name]
                                             [(hsql/call "case"
                                                         [:!= :report_dashboard.id nil] "dashboard"
                                                         [:!= :report_card.id nil] "card") :type]]
                                    :from [:query_action]
                                    :join [Emitter [:= :emitter.action_id :query_action.action_id]]
                                    :left-join [DashboardEmitter [:= :emitter.id :dashboard_emitter.emitter_id]
                                                :report_dashboard [:= :dashboard_emitter.dashboard_id :report_dashboard.id]
                                                CardEmitter [:= :emitter.id :card_emitter.emitter_id]
                                                :report_card [:= :card_emitter.card_id :report_card.id]]
                                    :where [:in :query_action.card_id card-ids]})
          usage-by-card-id (->> emitter-usages
                                (group-by :card_id)
                                (m/map-vals (fn [usages] (map #(dissoc % :card_id) usages))))]
      (for [card cards]
        (m/assoc-some card :emitter-usages (get usage-by-card-id (:id card)))))
    cards))

(defn action-emitter-usages
    "Hydrates emitter usages given a list of cards, this is used e.g. to show the user what else deleting a card will
  modify."
  {:batched-hydrate :action/emitter-usages}
  [actions]
  (if-let [action-ids (seq (keep :id actions))]
    (let [emitter-usages (db/query {:select [:emitter.action_id
                                             [(hsql/call "coalesce" :report_dashboard.id :report_card.id) :id]
                                             [(hsql/call "coalesce" :report_dashboard.name :report_card.name) :name]
                                             [(hsql/call "case"
                                                         [:!= :report_dashboard.id nil] "dashboard"
                                                         [:!= :report_card.id nil] "card") :type]]
                                    :from [Emitter]
                                    :left-join [DashboardEmitter [:= :emitter.id :dashboard_emitter.emitter_id]
                                                :report_dashboard [:= :dashboard_emitter.dashboard_id :report_dashboard.id]
                                                CardEmitter [:= :emitter.id :card_emitter.emitter_id]
                                                :report_card [:= :card_emitter.card_id :report_card.id]]
                                    :where [:in :emitter.action_id action-ids]})
          usage-by-action-id (->> emitter-usages
                                  (group-by :action_id)
                                  (m/map-vals (fn [usages] (map #(dissoc % :action_id) usages))))]
      (for [action actions]
        (m/assoc-some action :emitter-usages (get usage-by-action-id (:id action)))))
    actions))
