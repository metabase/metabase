(ns metabase.dashboards.models.dashboard
  (:require
   [medley.core :as m]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.cache.models.cache-config :as cache-config]
   [metabase.change-log.core :as change-log]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.dashboards.audit :as dashboards.audit]
   [metabase.dashboards.collection-items :as dashboards.collection-items]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.dependencies :as dashboards.dependencies]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.recent-views :as dashboards.recent-views]
   [metabase.dashboards.replacement :as dashboards.replacement]
   [metabase.dashboards.revisions :as dashboards.revisions]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.serialization :as dashboards.serialization]
   [metabase.dashboards.staleness :as dashboards.staleness]
   [metabase.dashboards.xrays :as dashboards.xrays]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.replacement.spec :as replacement]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.models.revision :as revision]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.xrays.spec :as xrays]
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

(defmethod mi/non-timestamped-fields :model/Dashboard [_]
  #{:last_viewed_at})

(t2/deftransforms :model/Dashboard
  {:parameters       parameters/transform-parameters
   :public_uuid      (mi/transform-encrypted-text "report_dashboard.public_uuid")
   :embedding_params mi/transform-json-no-keywordization})

(defmethod mi/non-internal-filter-clause :model/Dashboard
  [_model alias]
  [:not= (h2x/identifier :field alias :creator_id) config/internal-mb-user-id])

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defmethod mi/after-archived-change :model/Dashboard
  [_model rows changes]
  (let [ids (mapv :id rows)]
    (events/with-event-context {:archived-with [:model/Dashboard (first ids)]}
      (if (:archived changes)
        (dashboards.db/archive-dashboard-questions! ids)
        (dashboards.db/unarchive-dashboard-questions! ids)))))

(t2/define-before-insert :model/Dashboard
  [dashboard]
  (let [defaults  {:parameters []}
        dashboard (-> (lib/normalize ::dashboards.schema/dashboard (merge defaults dashboard))
                      maybe-populate-initially-published-at)]
    (u/prog1 (public-sharing/add-public-uuid-prefix dashboard)
      (params/assert-valid-parameters dashboard))))

(t2/define-before-update :model/Dashboard
  [row]
  (let [changes   (lib/normalize ::dashboards.schema/dashboard (t2/changes row))
        dashboard (lib/normalize ::dashboards.schema/dashboard row)]
    (params/assert-valid-parameters dashboard)
    (-> dashboard
        (cond-> (contains? changes :archived)
          (assoc :archived_directly (mi/archived-directly row #(collection/archived? (:collection_id dashboard)))))
        maybe-populate-initially-published-at
        public-sharing/add-public-uuid-prefix-if-changed)))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-collections!
  "Throws unless the Collection of each of `rows`, each holding `:collection_id` and `:archived`, can hold a Dashboard,
  reading each distinct Collection once."
  [rows]
  (run! #(collection/check-collection-for :model/Dashboard %)
        (into #{} (map (fn [{:keys [collection_id archived]}] {:collection_id collection_id :archived (boolean archived)})) rows)))

(mu/defn create-dashboards! :- [:sequential :map]
  "Insert the Dashboard `rows` and return the inserted instances in the order of the rows. Each Collection must be able
  to hold a Dashboard, and the ParameterCards of the parameters that draw values from a Card are created."
  [rows :- [:sequential ::dashboards.schema/dashboard.create]]
  (if (empty? rows)
    []
    (events/with-batched-events
      (check-collections! rows)
      (u/prog1 (dashboards.db/insert-dashboards! rows)
        (parameter-card/sync-parameter-cards!
         "dashboard"
         (mapv (fn [dashboard] [(:id dashboard) (or (:parameters dashboard) [])]) <>))))))

(mu/defn create-dashboard! :- :map
  "Insert the Dashboard `row` and return the inserted instance, as [[create-dashboards!]] does."
  [row :- ::dashboards.schema/dashboard.create]
  (first (create-dashboards! [row])))

(defn- changed?
  "Whether `row`, the columns to write, changes the column `k` of `stored`."
  [stored row k]
  (and (contains? row k) (not= (get row k) (get stored k))))

(defn- with-archived-directly
  "`row`, an update of the Dashboard `stored`, with the `archived_directly` that a change of `archived` gives unless the
  row gives one: true when the Dashboard is archived by itself, which is when its Collection is not archived."
  [stored row parent-archived?]
  (if (and (changed? stored row :archived) (not (contains? row :archived_directly)))
    (assoc row :archived_directly
           (boolean (and (:archived row)
                         (not (parent-archived? (if (contains? row :collection_id) (:collection_id row) (:collection_id stored)))))))
    row))

(mu/defn update-dashboards! :- [:sequential ::dashboards.schema/dashboard.update-row]
  "Apply the columns of each of `rows` to the Dashboard with its `:id`, and return `rows`. A Dashboard moved to another
  Collection moves its dashboard questions along and the new Collection must be able to hold it, a change of
  `parameters` updates its ParameterCards, and a change of `archived` gives its `archived_directly` and archives or
  restores its dashboard questions. The rows with the same columns are one statement."
  [rows :- [:sequential ::dashboards.schema/dashboard.update-row]]
  (let [rows   (mapv #(lib/normalize ::dashboards.schema/dashboard.update-row %) rows)
        stored (m/index-by :id (dashboards.db/dashboards (mapv :id rows)))
        rows   (filterv #(contains? stored (:id %)) rows)]
    (if (empty? rows)
      rows
      (events/with-batched-events
        (let [parent-archived? (memoize collection/archived?)
              rows             (mapv #(with-archived-directly (get stored (:id %)) % parent-archived?) rows)
              moved            (filterv #(changed? (get stored (:id %)) % :collection_id) rows)
              reparameterised  (filterv #(changed? (get stored (:id %)) % :parameters) rows)]
          (check-collections! (for [row moved]
                                {:collection_id (:collection_id row)
                                 :archived      (if (contains? row :archived) (:archived row) (:archived (get stored (:id row))))}))
          (doseq [[collection-id moved-rows] (group-by :collection_id moved)]
            (dashboards.db/move-dashboard-questions! (mapv :id moved-rows) collection-id))
          (when (seq reparameterised)
            (parameter-card/sync-parameter-cards!
             "dashboard" (mapv (juxt :id :parameters) reparameterised)))
          (doseq [[changes group] (group-by #(dissoc % :id) rows)]
            (dashboards.db/update-dashboards! (mapv :id group) changes))
          rows)))))

(mu/defn update-dashboard! :- :nil
  "Apply `changes` to the Dashboard with `dashboard-id`, as [[update-dashboards!]] does."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (update-dashboards! [(assoc changes :id dashboard-id)])
  nil)

(mu/defn delete-dashboards! :- :nil
  "Delete the Dashboards with `dashboard-ids` along with their ParameterCards, Revisions, cache configs and Pulses. The
  Pulses go through their model, so the triggers of their subscriptions are removed too."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (when (seq dashboard-ids)
    (events/with-batched-events
      (parameter-card/delete-all-for-parameterized-objects! "dashboard" dashboard-ids)
      (revision/delete-revisions-for-entities! "Dashboard" dashboard-ids)
      (cache-config/delete-target-configs! "dashboard" dashboard-ids)
      (dashboards.db/delete-pulses! (dashboards.db/pulse-ids-for-dashboards dashboard-ids))
      (dashboards.db/delete-dashboards! dashboard-ids)))
  nil)

(mu/defn delete-dashboard! :- :nil
  "Delete the Dashboard with `dashboard-id`, as [[delete-dashboards!]] does."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (delete-dashboards! [dashboard-id]))

(defn- cleanup-orphaned-inline-parameters!
  "Remove inline parameter IDs from the dashboard's parameters list when dashcards are deleted.
   Since inline parameters can only be referenced by a single card, all inline parameters
   from deleted cards become orphaned."
  [dashboard-card-ids]
  (when (seq dashboard-card-ids)
    (let [cards-being-deleted (dashboards.db/dashcards-by-ids dashboard-card-ids)
          orphaned-param-ids  (set (mapcat :inline_parameters cards-being-deleted))
          dashboard-ids       (set (map :dashboard_id cards-being-deleted))]
      (when (and (seq orphaned-param-ids) (= 1 (count dashboard-ids)))
        (let [dashboard-id   (first dashboard-ids)
              dashboard      (dashboards.db/dashboard dashboard-id)
              current-params (:parameters dashboard)
              cleaned-params (filterv #(not (contains? orphaned-param-ids (:id %))) current-params)]
          (when (not= (count current-params) (count cleaned-params))
            (update-dashboard! dashboard-id {:parameters cleaned-params})))))))

(mu/defn delete-dashcards! :- :nil
  "Delete the DashboardCards with `dashboard-card-ids` of a Dashboard, and the inline parameters they held from its
  parameters."
  [dashboard-card-ids :- [:sequential ::lib.schema.id/dashcard]]
  (when (seq dashboard-card-ids)
    (events/with-batched-events
      (cleanup-orphaned-inline-parameters! dashboard-card-ids)
      (dashboard-card/delete-dashboard-cards! dashboard-card-ids)))
  nil)

(def ^:private revert-dashboard!
  "The `:revert!` of the revisions spec: puts back the columns, tabs and dashcards of a Revision."
  (partial dashboards.revisions/revert-dashboard! {:update-dashboard! update-dashboard!
                                                   :delete-dashcards! delete-dashcards!}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/Dashboard
  [_model]
  {:create :event/dashboard-create
   :update :event/dashboard-update
   :delete :event/dashboard-delete})

(defmethod app-db-copy/spec :model/Dashboard [_model]
  {:skip? false})

(defmethod change-log/spec :model/Dashboard [_model]
  {:track [:name :description :creator_id :parameters :points_of_interest :caveats :show_in_getting_started
           :public_uuid :made_public_by_id :enable_embedding :embedding_params :archived :position :collection_id
           :collection_position :cache_ttl :entity_id :auto_apply_filters :width :initially_published_at
           :archived_directly :embedding_type :public_uuid_prefix]
   :skip  [:last_viewed_at :view_count]})

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
   :before-load         dashboards.serialization/before-load
   :insert!             create-dashboards!
   :update!             update-dashboards!
   :delete!             delete-dashboards!})

(defmethod remote-sync/spec :model/Dashboard
  [_model]
  {:synced-items         dashboards.db/synced-dashboard-items
   :synced-filter-clause dashboards.db/synced-dashboards-clause})

(defmethod revisions/spec :model/Dashboard [_model]
  {:track    [:name :description :archived :archived_directly :auto_apply_filters :cache_ttl :collection_id
              :parameters :width]
   :skip     [:caveats :collection_position :creator_id :embedding_params :embedding_type :enable_embedding :entity_id
              :initially_published_at :last_viewed_at :made_public_by_id :points_of_interest :position
              :public_uuid :public_uuid_prefix :show_in_getting_started :view_count]
   :children {:cards {:model :model/DashboardCard :as :dashcards}
              :tabs  {:model :model/DashboardTab :as :tabs}}
   :revert!  revert-dashboard!
   :describe dashboards.revisions/describe-change})

(defmethod audit/spec :model/Dashboard [_model]
  {:track          [:name :description]
   :track-redacted [:archived :archived_directly :auto_apply_filters :cache_ttl :caveats :collection_id :creator_id
                    :embedding_params :embedding_type :enable_embedding :initially_published_at :made_public_by_id
                    :parameters :points_of_interest :public_uuid :public_uuid_prefix :show_in_getting_started :width]
   :skip           [:collection_position :entity_id :last_viewed_at :position :view_count]
   :topics         {:create :dashboard-create
                    :delete :dashboard-delete}
   :moments        [{:topic :dashboard-public-link-created, :when dashboards.audit/public-link-created?}
                    {:topic :dashboard-public-link-deleted, :when dashboards.audit/public-link-deleted?}]})

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

(defmethod dependencies/spec :model/Dashboard [_model]
  {:type  :dashboard
   :items dashboards.db/dependency-dashboard-items

   :hydrate      dashboards.dependencies/hydrate
   :dependencies dashboards.dependencies/dependencies

   :dependency-columns #{:parameters}})

(defmethod replacement/spec :model/Dashboard [_model]
  {:hydrate            dashboards.replacement/hydrate
   :upgrade-field-refs dashboards.replacement/upgrade-field-refs
   :swap-source        dashboards.replacement/swap-source
   :update!            update-dashboard!})

(defmethod collection-items/spec :model/Dashboard [_model]
  {"dashboard" {:rank    1
                :items   dashboards.db/collection-dashboard-items
                :hydrate dashboards.collection-items/hydrate}})

(defmethod recent-views/spec :model/Dashboard [_model]
  {"dashboard" {:load   dashboards.db/recent-view-dashboards
                :render dashboards.recent-views/render}})

(defmethod staleness/spec :model/Dashboard [_model]
  {:candidates dashboards.db/stale-dashboard-candidates
   :load       dashboards.staleness/load-items
   :render     dashboards.staleness/render})

(defmethod eid-translation/spec :model/Dashboard [_model]
  {:names [:dashboard]})

(defmethod xrays/spec :model/Dashboard [_model]
  {:related dashboards.xrays/related})
