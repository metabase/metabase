(ns metabase.dashboards.models.dashboard
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.core :as queries]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Dashboard [_model] :report_dashboard)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :dashboard]
  [_original-model _k]
  :model/Dashboard)

(doto :model/Dashboard
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-write? :model/Dashboard
  ([instance]
   ;; Dashboards in audit collection should be read only
   (and (not (and
        ;; We want to make sure there's an existing audit collection before doing the equality check below.
        ;; If there is no audit collection, this will be nil:
              (some? (:id (audit/default-audit-collection)))
        ;; Is a direct descendant of audit collection
              (= (:collection_id instance) (:id (audit/default-audit-collection)))))
        (mi/current-user-has-full-permissions? (mi/perms-objects-set instance :write))))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/Dashboard :id pk))))

(defmethod mi/can-read? :model/Dashboard
  ([instance]
   (perms/can-read-audit-helper :model/Dashboard instance))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Dashboard :id pk))))

(defmethod mi/non-timestamped-fields :model/Dashboard [_]
  #{:last_viewed_at})

(t2/deftransforms :model/Dashboard
  {:parameters       parameters/transform-parameters
   :embedding_params mi/transform-json})

(t2/define-before-delete :model/Dashboard
  [dashboard]
  (let [dashboard-id (u/the-id dashboard)]
    (queries/delete-all-parameter-cards-for-parameterized-object! "dashboard" dashboard-id)
    (t2/delete! :model/Revision :model "Dashboard" :model_id dashboard-id)))

(t2/define-before-insert :model/Dashboard
  [dashboard]
  (let [defaults  {:parameters []}
        dashboard (lib/normalize ::dashboards.schema/dashboard (merge defaults dashboard))]
    (u/prog1 dashboard
      (collection/check-allowed-content :model/Dashboard (:collection_id dashboard))
      (params/assert-valid-parameters dashboard)
      (collection/check-collection-namespace :model/Dashboard (:collection_id dashboard)))))

(t2/define-after-insert :model/Dashboard
  [dashboard]
  (u/prog1 dashboard
    (queries/upsert-or-delete-parameter-cards-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard))))

(t2/define-before-update :model/Dashboard
  [dashboard]
  (let [changes   (t2/changes dashboard)
        dashboard (lib/normalize ::dashboards.schema/dashboard dashboard)
        changes   (lib/normalize ::dashboards.schema/dashboard changes)]
    (collection/check-allowed-content :model/Dashboard (:collection_id changes))

    (u/prog1 (maybe-populate-initially-published-at dashboard)
      (params/assert-valid-parameters dashboard)
      (when (:parameters changes)
        (queries/upsert-or-delete-parameter-cards-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard)))
      (collection/check-collection-namespace :model/Dashboard (:collection_id dashboard))
      (when (:archived changes)
        (t2/delete! :model/Pulse :dashboard_id (u/the-id dashboard))))))

(mu/defn- migrate-parameter [p :- ::parameters.schema/parameter]
  (cond-> p
    ;; It was previously possible for parameters to have empty strings for :name and
    ;; :slug, but these are now required to be non-blank strings. (metabase#24500)
    (or (= (:name p) "")
        (= (:slug p) ""))
    (assoc :name "unnamed" :slug "unnamed")
    (or
     ;; we don't support linked filters for parameters with :values_source_type of anything except nil,
     ;; but it was previously possible to set :values_source_type to "static-list" or "card" and still
     ;; have linked filters. (metabase#33892)
     (some? (:values_source_type p))
     (= (:values_query_type p) :none))
     ;; linked filters don't do anything when parameters have values_query_type="none" (aka "Input box"),
     ;; but it was previously possible to set :values_query_type to "none" and still have linked filters.
     ;; (metabase#34657)
    (dissoc :filteringParameters)))

(defn- migrate-parameters-list
  "Update the `:parameters` list of a dashboard from legacy formats."
  [dashboard]
  (m/update-existing dashboard :parameters #(map migrate-parameter %)))

(t2/define-after-select :model/Dashboard
  [dashboard]
  (-> dashboard
      migrate-parameters-list
      public-sharing/remove-public-uuid-if-public-sharing-is-disabled))

(defmethod serdes/hash-fields :model/Dashboard
  [_dashboard]
  [:name (serdes/hydrated-hash :collection) :created_at])

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :tabs]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id (t2/select :model/DashboardTab
                                       :dashboard_id [:in (map :id dashboards)]
                                       {:order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]}))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :dashcards]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id
              (t2/select :model/DashboardCard
                         {:select    [:dashcard.* [:collection.authority_level :collection_authority_level]]
                          :from      [[:report_dashboardcard :dashcard]]
                          :left-join [[:report_card :card] [:= :dashcard.card_id :card.id]
                                      [:collection :collection] [:= :collection.id :card.collection_id]]
                          :where     [:and
                                      [:in :dashcard.dashboard_id (map :id dashboards)]
                                      [:or
                                       ;; show it if:
                                       ;; - the card isn't archived
                                       [:= :card.archived false]

                                       ;; - the card is archived BUT it's a dashboard question that wasn't archived by itself
                                       [:and
                                        [:not= :card.dashboard_id nil]
                                        [:= :card.archived_directly false]]
                                       [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
                          :order-by  [[:dashcard.dashboard_id] [:dashcard.created_at :asc]]}))
   :id
   {:default []}))

(mi/define-batched-hydration-method collections-authority-level
  :collection_authority_level
  "Efficiently hydrate the `:collection_authority_level` of a sequence of dashboards."
  [dashboards]
  (when (seq dashboards)
    (let [coll-id->level (into {}
                               (map (juxt :id :authority_level))
                               (app-db/query {:select    [:dashboard.id :collection.authority_level]
                                              :from      [[:report_dashboard :dashboard]]
                                              :left-join [[:collection :collection] [:= :collection.id :dashboard.collection_id]]
                                              :where     [:in :dashboard.id (into #{} (map u/the-id) dashboards)]}))]
      (for [dashboard dashboards]
        (assoc dashboard :collection_authority_level (get coll-id->level (u/the-id dashboard)))))))

(defn archive-or-unarchive-internal-dashboard-questions!
  "When updating dashboard cards, if we're removing all references to a Dashboard Question (which is internal to the
  dashboard, not displayed as part of a collection) we want to archive it. Similarly, we want to mark any Dashboard
  Questions that *are* on the Dashboard as *not* archived. This function takes a dashboard and the set of dashcards
  about to be saved, and ensures that all DQs that appear on the dashboard are unarchived and all DQs that DON'T
  appear on the dashboard are archived."
  [dashboard-id new-cards]
  (let [;; the set of ALL Dashboard Questions (internal to the dashboard) for this Dashboard
        internal-dashboard-question-ids (t2/select-pks-set :model/Card :dashboard_id dashboard-id)
        ;; the set of all card IDs that are present on the dashboard
        used-card-ids (into #{} (map :card_id new-cards))
        ;; DQs that aren't used get archived
        internal-dashboard-questions-to-archive (set/difference internal-dashboard-question-ids used-card-ids)
        ;; DQs that ARE used get unarchived
        internal-dashboard-questions-to-unarchive (set/intersection internal-dashboard-question-ids used-card-ids)]
    (when-let [ids (seq internal-dashboard-questions-to-archive)]
      (t2/update! :model/Card :id [:in ids] {:archived true :archived_directly true}))
    (when-let [ids (seq internal-dashboard-questions-to-unarchive)]
      (t2/update! :model/Card :id [:in ids] {:archived false :archived_directly false}))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 OTHER CRUD FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-id->param-field-ids
  "Get the set of Field IDs referenced by the parameters in this Dashboard."
  [dashboard-or-id]
  (let [dash (-> (t2/select-one :model/Dashboard :id (u/the-id dashboard-or-id))
                 (t2/hydrate [:dashcards :card]))]
    (params/dashcards->param-field-ids (:dashcards dash))))

(defn- update-field-values-for-on-demand-dbs!
  "If the parameters have changed since last time this Dashboard was saved, we need to update the FieldValues
   for any Fields that belong to an 'On-Demand' synced DB."
  [old-param-field-ids new-param-field-ids]
  (when (and (seq new-param-field-ids)
             (not= old-param-field-ids new-param-field-ids))
    (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
      (log/info "Referenced Fields in Dashboard params have changed: Was:" old-param-field-ids
                "Is Now:" new-param-field-ids
                "Newly Added:" newly-added-param-field-ids)
      (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids))))

(defn add-dashcards!
  "Add Cards to a Dashboard.
   This function is provided for convenience and also makes sure various cleanup steps are performed when finished,
   for example updating FieldValues for On-Demand DBs.
   Returns newly created DashboardCards."
  [dashboard-or-id dashcards]
  (let [old-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)
        dashboard-cards     (map (fn [dashcard]
                                   (-> (assoc dashcard :dashboard_id (u/the-id dashboard-or-id))
                                       (update :series #(filter identity (map u/the-id %))))) dashcards)]
    (u/prog1 (dashboard-card/create-dashboard-cards! dashboard-cards)
      (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
        (update-field-values-for-on-demand-dbs! old-param-field-ids new-param-field-ids)))))

(def ^:private DashboardWithSeriesAndCard
  [:map
   [:id ms/PositiveInt]
   [:dashcards [:sequential [:map
                             [:card_id {:optional true} [:maybe ms/PositiveInt]]
                             [:card {:optional true} [:maybe [:map
                                                              [:id ms/PositiveInt]]]]]]]])

(mu/defn update-dashcards!
  "Update the `dashcards` belonging to `dashboard`.
   This function is provided as a convenience instead of doing this yourself; it also makes sure various cleanup steps
   are performed when finished, for example updating FieldValues for On-Demand DBs.
   Returns `nil`."
  [dashboard     :- DashboardWithSeriesAndCard
   new-dashcards :- [:sequential ms/Map]]
  (let [old-dashcards    (:dashcards dashboard)
        id->old-dashcard (m/index-by :id old-dashcards)
        old-dashcard-ids (set (keys id->old-dashcard))
        new-dashcard-ids (set (map :id new-dashcards))
        only-new         (set/difference new-dashcard-ids old-dashcard-ids)]
    ;; ensure the dashcards we are updating are part of the given dashboard
    (when (seq only-new)
      (throw (ex-info (tru "Dashboard {0} does not have a DashboardCard with ID {1}"
                           (u/the-id dashboard) (first only-new))
                      {:status-code 404})))
    (doseq [dashcard new-dashcards]
      (let [;; update-dashboard-card! requires series to be a sequence of card IDs
            old-dashcard       (-> (get id->old-dashcard (:id dashcard))
                                   (update :series #(map :id %)))
            dashboard-card     (update dashcard :series #(map :id %))]
        (dashboard-card/update-dashboard-card! dashboard-card old-dashcard)))
    (let [new-param-field-ids (params/dashcards->param-field-ids (t2/hydrate new-dashcards :card))]
      (update-field-values-for-on-demand-dbs! (params/dashcards->param-field-ids old-dashcards) new-param-field-ids))))

(defn- legacy-result-metadata-for-query
  "Fetch the results metadata for a `query` by running the query and seeing what the `qp` gives us in return."
  [query]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (qp.metadata/legacy-result-metadata query api/*current-user-id*))

(defn- save-card!
  [card]
  (cond
    ;; If this is a pre-existing card, just return it
    (and (integer? (:id card)) (t2/select-one :model/Card :id (:id card)))
    card

    ;; Don't save text cards
    (-> card :dataset_query not-empty)
    (let [card (first (t2/insert-returning-instances!
                       :model/Card
                       (-> card
                           (update :result_metadata #(or % (-> card
                                                               :dataset_query
                                                               legacy-result-metadata-for-query)))
                            ;; Xrays populate this in their transient cards
                           (dissoc :id :can_run_adhoc_query))))]
      (events/publish-event! :event/card-create {:object card :user-id (:creator_id card)})
      (t2/hydrate card :creator :dashboard_count :can_write :can_run_adhoc_query :collection))))

(defn save-transient-dashboard!
  "Save a denormalized description of `dashboard`."
  [dashboard parent-collection-id]
  (t2/with-transaction [_conn]
    (let [{dashcards      :dashcards
           tabs           :tabs
           :keys          [description] :as dashboard} (i18n/localized-strings->strings dashboard)
          dashboard  (first (t2/insert-returning-instances!
                             :model/Dashboard
                             (-> dashboard
                                 (dissoc :dashcards :tabs :rule :related
                                         :transient_name :transient_filters :param_fields :more)
                                 (assoc :description description
                                        :collection_id parent-collection-id))))
          {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! (:id dashboard) nil tabs)]
      (add-dashcards! dashboard
                      (for [dashcard dashcards]
                        (let [card     (some-> dashcard :card
                                               (assoc :dashboard_id (:id dashboard)
                                                      :collection_id parent-collection-id)
                                               save-card!)
                              series   (some->> dashcard
                                                :series
                                                (mapv (fn [card]
                                                        (-> card
                                                            (assoc :collection_id parent-collection-id)
                                                            save-card!))))
                              dashcard (-> dashcard
                                           (dissoc :card :id :creator_id)
                                           (update :parameter_mappings
                                                   (partial map #(assoc % :card_id (:id card))))
                                           (assoc :series series)
                                           (update :dashboard_tab_id (or old->new-tab-id {}))
                                           (assoc :card_id (:id card)))]
                          dashcard)))
      (cond-> dashboard
        (collections/remote-synced-collection? parent-collection-id) collections/check-non-remote-synced-dependencies))))

(def ^:private ParamWithMapping
  [:map
   [:id ms/NonBlankString]
   [:name ms/NonBlankString]
   [:mappings [:maybe [:set ::parameters.schema/parameter-mapping]]]])

(mu/defn- dashboard->resolved-params :- [:map-of ms/NonBlankString ParamWithMapping]
  [dashboard :- [:map [:parameters [:maybe [:sequential :map]]]]]
  (let [param-key->mappings (apply
                             merge-with set/union
                             (for [dashcard (:dashcards dashboard)
                                   param    (:parameter_mappings dashcard)]
                               {(:parameter_id param) #{(assoc param :dashcard dashcard)}}))]
    (into {} (for [{param-key :id, :as param} (:parameters dashboard)]
               [(u/qualified-name param-key) (assoc param :mappings (get param-key->mappings param-key))]))))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :resolved-params]
  "Return map of Dashboard parameter key -> param with resolved `:mappings`.
   (dashboard->resolved-params (t2/select-one Dashboard :id 62))
   ;; ->
   {\"ee876336\" {:name     \"Category Name\"
                  :slug     \"category_name\"
                  :id       \"ee876336\"
                  :type     \"category\"
                  :mappings #{{:parameter_id \"ee876336\"
                               :card_id      66
                               :dashcard     ...
                               :target       [:dimension [:fk-> [:field-id 263] [:field-id 276]]]}}},
    \"6f10a41f\" {:name     \"Price\"
                  :slug     \"price\"
                  :id       \"6f10a41f\"
                  :type     \"category\"
                  :mappings #{{:parameter_id \"6f10a41f\"
                               :card_id      66
                               :dashcard     ...
                               :target       [:dimension [:field-id 264]]}}}}"
  [_model k dashboards]
  (let [dashboards-with-cards (t2/hydrate dashboards [:dashcards :card])]
    (map #(assoc %1 k %2) dashboards (map dashboard->resolved-params dashboards-with-cards))))

(defmethod mi/exclude-internal-content-hsql :model/Dashboard
  [_model & {:keys [table-alias]}]
  [:not= (h2x/identifier :field table-alias :creator_id) config/internal-mb-user-id])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SERIALIZATION                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod serdes/make-spec "Dashboard" [_model-name opts]
  {:copy      [:archived :archived_directly :auto_apply_filters :caveats :collection_position
               :description :embedding_params :enable_embedding :embedding_type :entity_id :name
               :points_of_interest :position :public_uuid :show_in_getting_started :width]
   :skip      [;; those stats are inherently local state
               :view_count :last_viewed_at
               ;; this is deprecated
               :cache_ttl
               :dependency_analysis_version]
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

(defmethod serdes/descendants "Dashboard" [_model-name id _opts]
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
     ;; parameter with values_source_type = "card" will depend on a card
     (into {} (for [card-id (some->> dashboard :parameters (keep (comp :card_id :values_source_config)))]
                {["Card" card-id] {"Dashboard" dash-id}})))))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "dashboard"
  {:model        :model/Dashboard
   :attrs        {:archived       true
                  :collection-id  true
                  :creator-id     true
                  :database-id    false
                  :last-editor-id :r.user_id
                  :last-edited-at :r.timestamp
                  :last-viewed-at true
                  :pinned         [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]
                  :verified       [:= "verified" :mr.status]
                  :view-count     true
                  :created-at     true
                  :updated-at     true}
   :search-terms [:name :description]
   :render-terms {:archived-directly          true
                  :collection-authority_level :collection.authority_level
                  :collection-name            :collection.name
                  ;; This is used for legacy ranking, in future it will be replaced by :pinned
                  :collection-position        true
                  :collection-type            :collection.type
                  :moderated-status           :mr.status}
   :where        []
   :bookmark     [:model/DashboardBookmark [:and
                                            [:= :bookmark.dashboard_id :this.id]
                                            ;; a magical alias, or perhaps this clause can be implicit
                                            [:= :bookmark.user_id :current_user/id]]]
   :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                  :r          [:model/Revision [:and
                                                [:= :r.model_id :this.id]
                                                ;; Interesting for inversion, another condition on whether to update.
                                                ;; For now, let's just swallow the extra update (2x amplification)
                                                [:= :r.most_recent true]
                                                [:= :r.model "Dashboard"]]]
                  :mr         [:model/ModerationReview [:and
                                                        [:= :mr.moderated_item_type "dashboard"]
                                                        [:= :mr.moderated_item_id :this.id]
                                                        [:= :mr.most_recent true]]]}})
