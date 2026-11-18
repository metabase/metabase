(ns metabase.dashboards.models.dashboard
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.cache.core :as cache]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.dashboards.revisions :as dashboards.revisions]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.serialization :as dashboards.serialization]
   [metabase.dashboards.staleness :as dashboards.staleness]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Dashboard [_model] :report_dashboard)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :dashboard]
  [_original-model _k]
  :model/Dashboard)

(doto :model/Dashboard
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec :model/Dashboard
  [_model]
  {:create :event/dashboard-create
   :update :event/dashboard-update
   :delete :event/dashboard-delete})

(defmethod change-log/spec :model/Dashboard [_model]
  {:track [:name :description :creator_id :parameters :points_of_interest :caveats :show_in_getting_started
           :public_uuid :made_public_by_id :enable_embedding :embedding_params :archived :position :collection_id
           :collection_position :cache_ttl :entity_id :auto_apply_filters :width :initially_published_at
           :archived_directly :embedding_type :public_uuid_prefix]
   :skip  [:last_viewed_at :view_count]})

(defmethod revisions/spec :model/Dashboard [_model]
  {:track    [:name :description :archived :archived_directly :auto_apply_filters :cache_ttl :collection_id
              :parameters :width]
   :skip     [:caveats :collection_position :creator_id :embedding_params :embedding_type :enable_embedding :entity_id
              :initially_published_at :last_viewed_at :made_public_by_id :points_of_interest :position
              :public_uuid :public_uuid_prefix :show_in_getting_started :view_count]
   :children {:cards {:model :model/DashboardCard :as :dashcards}
              :tabs  {:model :model/DashboardTab :as :tabs}}
   :revert!  dashboards.revisions/revert-dashboard!
   :describe dashboards.revisions/describe-change})

(defmethod mi/non-timestamped-fields :model/Dashboard [_]
  #{:last_viewed_at})

(t2/deftransforms :model/Dashboard
  {:parameters       parameters/transform-parameters
   :public_uuid      (mi/transform-encrypted-text "report_dashboard.public_uuid")
   :embedding_params mi/transform-json-no-keywordization})

(defmethod mi/exclude-internal-content-hsql :model/Dashboard
  [_model & {:keys [table-alias]}]
  [:not= (h2x/identifier :field table-alias :creator_id) config/internal-mb-user-id])

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-delete :model/Dashboard
  [dashboard]
  (let [dashboard-id (u/the-id dashboard)]
    (queries/delete-all-parameter-cards-for-parameterized-object! "dashboard" dashboard-id)
    (dashboards.db/delete-dashboard-revisions! dashboard-id)
    (cache/delete-target-configs! "dashboard" [dashboard-id])
    ;; delete through Toucan rather than the FK cascade so the PulseChannel hook removes the SendPulse triggers
    (dashboards.db/delete-pulses-for-dashboard! dashboard-id)))

(defmethod mi/after-archived-change :model/Dashboard
  [_model rows changes]
  (doseq [{:keys [id]} rows]
    (events/with-event-context {:archived-with [:model/Dashboard id]}
      (if (:archived changes)
        (dashboards.db/archive-dashboard-questions! id)
        (dashboards.db/unarchive-dashboard-questions! id)))))

(t2/define-before-insert :model/Dashboard
  [dashboard]
  (collection/check-collection-for :model/Dashboard dashboard)
  (let [defaults  {:parameters []}
        dashboard (-> (lib/normalize ::dashboards.schema/dashboard (merge defaults dashboard))
                      maybe-populate-initially-published-at)]
    (u/prog1 (public-sharing/add-public-uuid-prefix dashboard)
      (params/assert-valid-parameters dashboard))))

(t2/define-after-insert :model/Dashboard
  [dashboard]
  (u/prog1 dashboard
    (queries/upsert-or-delete-parameter-cards-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard))))

(t2/define-before-update :model/Dashboard
  [row]
  (let [changes   (lib/normalize ::dashboards.schema/dashboard (t2/changes row))
        dashboard (lib/normalize ::dashboards.schema/dashboard row)]
    (when (contains? changes :collection_id)
      (collection/check-collection-for :model/Dashboard dashboard))
    (params/assert-valid-parameters dashboard)
    (let [dashboard (-> dashboard
                        (cond-> (contains? changes :archived)
                          (assoc :archived_directly (mi/archived-directly row #(collection/archived? (:collection_id dashboard)))))
                        maybe-populate-initially-published-at
                        public-sharing/add-public-uuid-prefix-if-changed)]
      (when (contains? changes :collection_id)
        (dashboards.db/move-dashboard-questions! (:id dashboard) (:collection_id dashboard)))
      (when (:parameters changes)
        (queries/upsert-or-delete-parameter-cards-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard)))
      dashboard)))

(mi/define-update-in-transaction :model/Dashboard)

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

;;; --------------------------------------------------- Permissions --------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :can_read]
  "Whether the current user reads each of `dashboards`, as the content of its Collection."
  [_model _k dashboards]
  (collection/hydrate-content-can-read :model/Dashboard dashboards {:audit-rules? true}))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :can_write]
  "Whether the current user writes each of `dashboards`, as the content of its Collection."
  [_model _k dashboards]
  (collection/hydrate-content-can-write :model/Dashboard dashboards {:audit-rules? true}))

(def ^:private embedding-columns
  "The columns that decide whether and how a Dashboard is embedded."
  [:enable_embedding :embedding_type :embedding_params])

(defn- can-write-collection?
  "Whether the current user writes the Collection with `collection-id`, nil for the root."
  [collection-id]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(defn changes-embedding?
  "Whether `changes` change the embedding of `dashboard`."
  [dashboard changes]
  (boolean (some #(api/column-will-change? (get dashboard %) (get changes % ::api/not-provided)) embedding-columns)))

(defn- can-change-embedding?
  "Whether the current user may do what `changes` do to the embedding of `dashboard`: only a superuser changes it."
  [dashboard changes]
  (or (not (changes-embedding? dashboard changes))
      (boolean (mi/superuser?))))

(defn- public-link-change
  "Whether `changes` set, `:set`, or clear, `:clear`, the public link of `dashboard`, and nil when they leave it."
  [dashboard changes]
  (when (api/column-will-change? (:public_uuid dashboard) (get changes :public_uuid ::api/not-provided))
    (if (:public_uuid changes) :set :clear)))

(defn- can-change-public-link?
  "Whether the current user may do what `changes` do to the public link of `dashboard`: a superuser sets it, and one
  with the application permission to change settings clears it."
  [dashboard changes]
  (case (public-link-change dashboard changes)
    :set   (mi/superuser?)
    :clear (boolean (or (mi/superuser?) (perms/current-user-has-application-permissions? :setting)))
    true))

(defn- changes-only-public-link?
  "Whether `changes` change the public link of `dashboard` and nothing else, the one change that needs no write access
  to it: a settings manager may remove the link of a Dashboard they cannot write."
  [dashboard changes]
  (boolean (and (public-link-change dashboard changes)
                (every? #{:public_uuid :made_public_by_id} (keys changes)))))

(defn- creates-shared-dashboard?
  "Whether `dashboard` is created with a public link or with embedding."
  [dashboard]
  (boolean (or (:public_uuid dashboard)
               (:enable_embedding dashboard)
               (:embedding_type dashboard)
               (seq (:embedding_params dashboard)))))

(defmethod mi/can-create? :model/Dashboard
  [_model {collection-id :collection_id, :as dashboard}]
  (and (can-write-collection? collection-id)
       (or (not (creates-shared-dashboard? dashboard))
           (boolean (mi/superuser?)))))

(defn- following-questions
  "The Cards internal to the Dashboard with `dashboard-id` that archiving it, when `archive?`, or restoring it takes
  along."
  [dashboard-id archive?]
  (if archive?
    (dashboards.db/questions-archived-with-dashboard dashboard-id)
    (dashboards.db/questions-restored-with-dashboard dashboard-id)))

(defmethod mi/can-update? :model/Dashboard
  [dashboard changes]
  (boolean
   (and (or (changes-only-public-link? dashboard changes)
            (mi/can-write? dashboard))
        (mi/archive-followers-updatable? dashboard changes :model/Card (partial following-questions (:id dashboard)))
        (collection/can-move? dashboard changes)
        (can-change-embedding? dashboard changes)
        (can-change-public-link? dashboard changes))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :tabs]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id (dashboards.db/dashboard-tabs-for-dashboards (map :id dashboards)))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :dashcards]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id
              (dashboards.db/dashcards-with-visible-cards-for-dashboards (map :id dashboards)))
   :id
   {:default []}))

(mi/define-batched-hydration-method collections-authority-level
  :collection_authority_level
  "Efficiently hydrate the `:collection_authority_level` of a sequence of dashboards."
  [dashboards]
  (when (seq dashboards)
    (let [coll-id->level (into {}
                               (map (juxt :id :authority_level))
                               (dashboards.db/dashboard-collection-authority-levels
                                (into #{} (map u/the-id) dashboards)))]
      (for [dashboard dashboards]
        (assoc dashboard :collection_authority_level (get coll-id->level (u/the-id dashboard)))))))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :resolved-params]
  "Return map of Dashboard parameter key -> param with resolved `:mappings`.
   (params/dashboard->resolved-params (t2/select-one Dashboard :id 62))
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
  (let [dashboards-with-cards (t2/hydrate dashboards [:dashcards :card :series])]
    (map #(assoc %1 k %2) dashboards (map params/dashboard->resolved-params dashboards-with-cards))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 OTHER CRUD FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-id->param-field-ids
  "Get the set of Field IDs referenced by the parameters in this Dashboard."
  [dashboard-or-id]
  (let [dash (-> (dashboards.db/dashboard (u/the-id dashboard-or-id))
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
      (sync.field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids))))

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
    (u/prog1 (events/with-batched-events (dashboard-card/create-dashboard-cards! dashboard-cards))
      (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
        (update-field-values-for-on-demand-dbs! old-param-field-ids new-param-field-ids)))))

(mu/defn update-dashcards!
  "Update the `dashcards` belonging to `dashboard`.
   This function is provided as a convenience instead of doing this yourself; it also makes sure various cleanup steps
   are performed when finished, for example updating FieldValues for On-Demand DBs.
   Returns `nil`."
  [dashboard     :- ::dashboards.schema/dashboard
   new-dashcards :- [:sequential [:merge
                                  ::dashboards.schema/dashboard-card.update
                                  [:map {:closed true}
                                   [:id                         ms/PositiveInt]
                                   [:series                     {:optional true} [:maybe [:sequential [:map {:closed true} [:id ms/PositiveInt]]]]]
                                   [:card                       {:optional true} [:maybe ::queries.schema/card]]
                                   [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]]]]]
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
    (events/with-batched-events
      ;; update-dashboard-cards! requires series to be a sequence of card IDs
      (dashboard-card/update-dashboard-cards!
       (for [dashcard new-dashcards]
         [(update dashcard :series #(map :id %))
          (-> (get id->old-dashcard (:id dashcard))
              (update :series #(map :id %)))])))
    ;; `t2/hydrate` is a no-op when `:card` is already present, so strip any
    ;; client-supplied value first: a JSON round-trip strings-ifies keyword
    ;; metadata (`type/Category`, `source/table-defaults`, ...) that
    ;; `param-target->field-id` later validates against `:metabase.queries.schema/card`.
    (let [dashcards-for-hydration (map #(dissoc % :card) new-dashcards)
          new-param-field-ids    (params/dashcards->param-field-ids (t2/hydrate dashcards-for-hydration :card))]
      (update-field-values-for-on-demand-dbs! (params/dashcards->param-field-ids old-dashcards) new-param-field-ids))))

(defn- legacy-result-metadata-for-query
  "Fetch the results metadata for a `query` by running the query and seeing what the `qp` gives us in return."
  [query]
  ;; card result_metadata is persisted in legacy shape; Lib-shape migration pending
  #_{:clj-kondo/ignore [:deprecated-var]}
  (qp.metadata/legacy-result-metadata query api/*current-user-id*))

(defn- save-card!
  [id->existing-card card]
  (cond
    ;; If this is a pre-existing card, just return it
    (and (integer? (:id card)) (get id->existing-card (:id card)))
    (do
      (api/read-check (get id->existing-card (:id card)))
      card)

    ;; Don't save text cards
    (-> card :dataset_query not-empty)
    (let [_    (query-perms/check-run-permissions-for-query (:dataset_query card))
          card (dashboards.db/insert-card!
                (->> (-> card
                         (update :result_metadata #(or % (-> card
                                                             :dataset_query
                                                             legacy-result-metadata-for-query)))
                         (dissoc :id
                                 :public_uuid :made_public_by_id
                                 :enable_embedding :embedding_params)
                         (assoc :creator_id api/*current-user-id*))
                     (lib/normalize ::queries.schema/card.update)))]
      card)))

(defn- check-dashcard-parameter-mapping-permissions
  [dashcards]
  (let [mappings       (for [{:keys [card_id parameter_mappings]} dashcards
                             mapping parameter_mappings]
                         (assoc mapping ::card-id (or (:card_id mapping) card_id)))
        card-ids       (into #{} (keep ::card-id) mappings)
        card-id->query (when (seq card-ids)
                         (dashboards.db/card-queries card-ids))
        field-ids      (into []
                             (keep (fn [{:keys [target] ::keys [card-id]}]
                                     (when target
                                       (params/param-target->field-id target {:dataset_query (card-id->query card-id)}))))
                             mappings)]
    (query-perms/check-parameter-field-permissions field-ids)))

(defn save-transient-dashboard!
  "Save a denormalized description of `dashboard`."
  [dashboard parent-collection-id]
  (queries/check-parameter-source-card-permissions
   (lib/normalize [:maybe [:sequential :metabase.parameters.schema/parameter]] (:parameters dashboard)))
  (t2/with-transaction [_conn]
    (let [{dashcards      :dashcards
           tabs           :tabs
           :keys          [description] :as dashboard} (i18n/localized-strings->strings dashboard)
          dashboard  (dashboards.db/insert-dashboard!
                      (->> (-> dashboard
                               (dissoc :dashcards :tabs :rule :related
                                       :transient_name :transient_filters :param_fields :more
                                       :public_uuid :made_public_by_id
                                       :enable_embedding :embedding_params)
                               (assoc :description description
                                      :collection_id parent-collection-id
                                      :creator_id api/*current-user-id*))
                           (lib/normalize ::dashboards.schema/dashboard.update)))
          {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! (:id dashboard) nil tabs)
          dashcards  (for [dashcard dashcards]
                       (-> dashcard
                           (update :card #(some-> % (assoc :dashboard_id (:id dashboard)
                                                           :collection_id parent-collection-id)))
                           (update :series #(some->> % (mapv (fn [card] (assoc card :collection_id parent-collection-id)))))))
          existing-card-ids (into [] (comp (mapcat (fn [{:keys [card series]}] (cons card series)))
                                           (keep :id)
                                           (filter pos-int?)
                                           (distinct))
                                  dashcards)
          id->existing-card (m/index-by :id (t2/hydrate (dashboards.db/cards-by-ids existing-card-ids) :can_read))
          dashcards-to-add (for [dashcard dashcards]
                             (let [card     (some->> dashcard :card (save-card! id->existing-card))
                                   series   (some->> dashcard :series (mapv #(save-card! id->existing-card %)))
                                   dashcard (-> dashcard
                                                (dissoc :card :id :creator_id)
                                                (update :parameter_mappings
                                                        (partial map #(assoc % :card_id (:id card))))
                                                (assoc :series series)
                                                (update :dashboard_tab_id (or old->new-tab-id {}))
                                                (assoc :card_id (:id card)))]
                               dashcard))]
      (check-dashcard-parameter-mapping-permissions dashcards-to-add)
      (add-dashcards! dashboard dashcards-to-add)
      dashboard)))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/Dashboard [_]
  {:schema              ::dashboards.schema/external-dashboard
   :copy                [:archived :archived_directly :auto_apply_filters :caveats :collection_position
                         :description :embedding_params :enable_embedding :embedding_type :entity_id :name
                         :points_of_interest :position :public_uuid :show_in_getting_started :width]
   :skip                [:initially_published_at :view_count :last_viewed_at :cache_ttl :public_uuid_prefix]
   :transform           {:collection_id     (serialization/fk-transform :model/Collection)
                         :creator_id        serialization/user-transform
                         :made_public_by_id serialization/user-transform
                         :parameters        serialization/parameters-transform}
   :children            {:tabs      :model/DashboardTab
                         :dashcards :model/DashboardCard}
   :defaults            {:archived                false
                         :archived_directly       false
                         :auto_apply_filters      true
                         :enable_embedding        false
                         :show_in_getting_started false}
   :import-dependencies dashboards.serialization/import-dependencies
   :export-dependencies dashboards.serialization/export-dependencies
   :before-load         dashboards.serialization/before-load})

;;; -------------------------------------------------- Remote sync ---------------------------------------------------

(defmethod remote-sync/spec :model/Dashboard
  [_model]
  {:synced-items         dashboards.db/synced-dashboard-items
   :synced-filter-clause dashboards.db/synced-dashboards-clause})

;;; ---------------------------------------------------- Search ------------------------------------------------------

(defmethod search/spec :model/Dashboard
  [_model]
  {"dashboard"
   {:attrs        {:archived       true
                   :collection-id  true
                   :creator-id     true
                   :database-id    false
                   :last-editor-id :r.user_id
                   :last-edited-at :r.timestamp
                   :last-viewed-at true
                   :pinned         [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]
                   :verified       [:= "verified" :mr.status]
                   :official-collection [:= "official" :collection.authority_level]
                   :view-count     true
                   :created-at     true
                   :updated-at     true
                   :collection-type :collection.type
                   :collection-location :collection.location
                   :root-collection-type {:fn collection/root-collection-type}}
    :search-terms [:name :description]
    :render-terms {:archived-directly          true
                   :collection-authority_level :collection.authority_level
                   :collection-name            :collection.name
                   ;; This is used for legacy ranking, in future it will be replaced by :pinned
                   :collection-position        true
                   :moderated-status           :mr.status}
    :where        []
    :bookmark     [:model/DashboardBookmark [:and
                                             [:= :bookmark.dashboard_id :this.id]
                                             ;; a magical alias, or perhaps this clause can be implicit
                                             [:= :bookmark.user_id :current_user/id]]]
    :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                   :r          [:model/Revision [:and
                                                 [:= :r.model_id :this.id]
                                                 [:= :r.model "Dashboard"]
                                                 (revisions.sql/newest-revision-clause :r "Dashboard" :this.id)]]
                   :mr         [:model/ModerationReview [:and
                                                         [:= :mr.moderated_item_type "dashboard"]
                                                         [:= :mr.moderated_item_id :this.id]
                                                         [:= :mr.most_recent true]]]}}})

(defmethod staleness/spec :model/Dashboard [_model]
  {:candidates dashboards.db/stale-dashboard-candidates
   :load       dashboards.staleness/load-items
   :render     dashboards.staleness/render})
