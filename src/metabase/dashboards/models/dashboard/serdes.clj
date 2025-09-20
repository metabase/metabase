(ns metabase.dashboards.models.dashboard.serdes
  (:require
   [clojure.set :as set]
   [metabase.models.serialization :as serdes]
   [metabase.parameters.schema :as parameters.schema]
   [toucan2.core :as t2]))

(defmethod serdes/hash-fields :model/Dashboard
  [_dashboard]
  [:name (serdes/hydrated-hash :collection) :created_at])

(defmethod serdes/make-spec "Dashboard" [_model-name opts]
  {:copy      [:archived :archived_directly :auto_apply_filters :caveats :collection_position
               :description :embedding_params :enable_embedding :entity_id :name
               :points_of_interest :position :public_uuid :show_in_getting_started :width]
   :skip      [;; those stats are inherently local state
               :view_count :last_viewed_at
               ;; this is deprecated
               :cache_ttl]
   :transform {:created_at             (serdes/date)
               :initially_published_at (serdes/date)
               :collection_id          (serdes/fk :model/Collection)
               :creator_id             (serdes/fk :model/User)
               :made_public_by_id      (serdes/fk :model/User)
               :parameters             {:export serdes/export-parameters :import serdes/import-parameters}
               :tabs                   (serdes/nested :model/DashboardTab :dashboard_id opts)
               :dashcards              (serdes/nested :model/DashboardCard :dashboard_id opts)}
   :coerce {:parameters [:maybe [:sequential ::parameters.schema/parameter]]}})

(defn- serdes-deps-dashcard
  [{:keys [action_id card_id parameter_mappings visualization_settings series]}]
  (set
   (concat
    (mapcat serdes/mbql-deps parameter_mappings)
    (serdes/visualization-settings-deps visualization_settings)
    (when card_id   #{[{:model "Card" :id card_id}]})
    (when action_id #{[{:model "Action" :id action_id}]})
    (for [s series] [{:model "Card" :id (:card_id s)}]))))

(defmethod serdes/dependencies "Dashboard"
  [{:keys [collection_id dashcards parameters]}]
  (->> (map serdes-deps-dashcard dashcards)
       (reduce set/union #{})
       (set/union (when collection_id #{[{:model "Collection" :id collection_id}]}))
       (set/union (serdes/parameters-deps parameters))))

(defmethod serdes/descendants "Dashboard" [_model-name id]
  (let [dashcards (t2/select [:model/DashboardCard :id :card_id :action_id :parameter_mappings :visualization_settings]
                             :dashboard_id id)
        dashboard (t2/select-one :model/Dashboard :id id)
        dash-id   id]
    (merge-with
     merge
     ;; DashboardCards are inlined into Dashboards, but we need to capture what those those DashboardCards rely on
     ;; here. So their actions, and their cards both direct, mentioned in their parameters viz settings, and related
     ;; via dashboard card series.
     (into {} (for [{:keys [id card_id parameter_mappings]} dashcards
                    ;; Capture all card_ids in the parameters, plus this dashcard's card_id if non-nil.
                    card-id (cond-> (set (keep :card_id parameter_mappings))
                              card_id (conj card_id))]
                {["Card" card-id] {"DashboardCard" id "Dashboard" dash-id}}))
     (when (not-empty dashcards)
       (into {} (for [{:keys [id card_id dashboardcard_id]} (t2/select [:model/DashboardCardSeries :id :card_id :dashboardcard_id]
                                                                       :dashboardcard_id [:in (map :id dashcards)])]
                  {["Card" card_id] {"DashboardCardSeries" id
                                     "DashboardCard"       dashboardcard_id
                                     "Dashboard"           dash-id}})))
     (into {} (for [{:keys [id action_id]} dashcards
                    :when action_id]
                {["Action" action_id] {"DashboardCard" id
                                       "Dashboard"     dash-id}}))
     (into {} (for [dc dashcards]
                (serdes/visualization-settings-descendants (:visualization_settings dc) {"DashboardCard" id
                                                                                         "Dashboard"     dash-id})))
     ;; parameter with values_source_type = :card1` will depend on a card
     (into {} (for [card-id (some->> dashboard :parameters (keep (comp :card_id :values_source_config)))]
                {["Card" card-id] {"Dashboard" dash-id}})))))
