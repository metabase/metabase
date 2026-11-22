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
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
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
   [metabase.pulse.models.pulse :as pulse]
   [metabase.queries.core :as queries]
   [metabase.queries.models.card :as card]
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
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Dashboard [_model] :report_dashboard)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :dashboard]
  [_original-model _k]
  :model/Dashboard)

(doto :model/Dashboard
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

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

(t2/define-before-insert :model/Dashboard
  [dashboard]
  (let [defaults  {:parameters []}
        dashboard (-> (lib/normalize ::dashboards.schema/dashboard (merge defaults dashboard))
                      maybe-populate-initially-published-at)]
    (u/prog1 (public-sharing/add-public-uuid-prefix dashboard)
      (params/assert-valid-parameters dashboard))))

(t2/define-before-update :model/Dashboard
  [row]
  (let [dashboard (lib/normalize ::dashboards.schema/dashboard row)]
    (params/assert-valid-parameters dashboard)
    (-> dashboard
        maybe-populate-initially-published-at
        public-sharing/add-public-uuid-prefix-if-changed)))

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
  "Insert the Dashboard `rows` and return the inserted instances in the order of the rows, publishing their create event.
  Each Collection must be able to hold a Dashboard, and the ParameterCards of the parameters that draw values from a
  Card are created."
  ([rows :- [:sequential ::dashboards.schema/dashboard.create]]
   (create-dashboards! rows nil))
  ([rows :- [:sequential ::dashboards.schema/dashboard.create]
    opts :- ::dashboards.schema/write-opts]
   (if (empty? rows)
     []
     (t2/with-transaction [_conn]
       (check-collections! rows)
       (let [dashboards (dashboards.db/insert-dashboards! rows)]
         (parameter-card/sync-parameter-cards!
          "dashboard"
          (mapv (fn [dashboard] [(:id dashboard) (or (:parameters dashboard) [])]) dashboards))
         (events/publish-event! :event/dashboard-create
                                (events/create-event dashboards (events/context opts)))
         dashboards)))))

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

(defn- move-questions!
  "Moves the dashboard questions of the Dashboards of `moved`, update rows that change `collection_id`, to the Collection
  of their Dashboard, with one call for each Collection."
  [moved]
  (doseq [[collection-id moved-rows] (group-by :collection_id moved)
          :let [question-ids (dashboards.db/question-ids-of-dashboards (mapv :id moved-rows))]
          :when (seq question-ids)]
    (card/update-cards! (mapv (fn [id] {:id id :collection_id collection-id}) question-ids))))

(defn- set-questions-archived!
  "Archives the dashboard questions of the Dashboards of `rows`, update rows that change `archived`, which the Dashboard
  archives, and restores those that its archive took down."
  [rows]
  (doseq [[archived? group] (group-by (comp boolean :archived) rows)
          :let [ids          (mapv :id group)
                question-ids (if archived?
                               (dashboards.db/question-ids-archived-with-dashboards ids)
                               (dashboards.db/question-ids-restored-with-dashboards ids))]
          :when (seq question-ids)]
    (card/update-cards! (mapv (fn [id] {:id id :archived archived?}) question-ids)
                        {:context {:archived-with [:model/Dashboard (first ids)]}})))

(mu/defn update-dashboards! :- [:sequential ::dashboards.schema/dashboard.update-row]
  "Apply the columns of each of `rows` to the Dashboard with its `:id`, publishing their update event, and return the
  rows of the Dashboards that exist. A Dashboard moved to another Collection moves its dashboard questions along and the
  new Collection must be able to hold it, a change of `parameters` updates its ParameterCards, and a change of `archived`
  gives its `archived_directly` and archives or restores its dashboard questions. The rows with the same columns are one
  statement."
  ([rows :- [:sequential ::dashboards.schema/dashboard.update-row]]
   (update-dashboards! rows nil))
  ([rows :- [:sequential ::dashboards.schema/dashboard.update-row]
    opts :- ::dashboards.schema/write-opts]
   (let [rows   (mapv #(lib/normalize ::dashboards.schema/dashboard.update-row %) rows)
         stored (m/index-by :id (dashboards.db/dashboards (mapv :id rows)))
         rows   (filterv #(contains? stored (:id %)) rows)]
     (if (empty? rows)
       rows
       (t2/with-transaction [_conn]
         (let [archived-ids     (collection/archived-collection-ids
                                 (into [] (keep (fn [row]
                                                  (when (contains? row :archived)
                                                    (if (contains? row :collection_id)
                                                      (:collection_id row)
                                                      (:collection_id (get stored (:id row)))))))
                                       rows))
               parent-archived? #(contains? archived-ids %)
               rows             (mapv #(with-archived-directly (get stored (:id %)) % parent-archived?) rows)
               moved            (filterv #(changed? (get stored (:id %)) % :collection_id) rows)
               reparameterised  (filterv #(changed? (get stored (:id %)) % :parameters) rows)]
           (check-collections! (for [row moved]
                                 {:collection_id (:collection_id row)
                                  :archived      (if (contains? row :archived) (:archived row) (:archived (get stored (:id row))))}))
           (move-questions! moved)
           (when (seq reparameterised)
             (parameter-card/sync-parameter-cards!
              "dashboard" (mapv (juxt :id :parameters) reparameterised)))
           (doseq [[changes group] (group-by #(dissoc % :id) rows)]
             (dashboards.db/update-dashboards! (mapv :id group) changes))
           (set-questions-archived! (filterv #(changed? (get stored (:id %)) % :archived) rows))
           (events/publish-event! :event/dashboard-update
                                  (events/update-event stored rows {:context (events/context opts)}))
           rows))))))

(mu/defn touch-dashboards! :- :nil
  "Publish, as the last step of a write of the parts of the Dashboards with `dashboard-ids`, the update event of each, so
  that its records, as its Revision, are made once for the whole write; a Dashboard whose own columns the write changed
  is written by [[update-dashboards!]], which publishes it instead."
  ([dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
   (touch-dashboards! dashboard-ids nil))
  ([dashboard-ids :- [:sequential ::lib.schema.id/dashboard]
    opts          :- ::dashboards.schema/write-opts]
   (when (seq dashboard-ids)
     (events/publish-event! :event/dashboard-update
                            (events/touch-event (dashboards.db/dashboards (vec (distinct dashboard-ids)))
                                                (events/context opts))))
   nil))

(mu/defn delete-dashboards! :- :nil
  "Delete the Dashboards with `dashboard-ids` along with their ParameterCards, Revisions, cache configs and Pulses,
  publishing their delete event right before the statement. The Pulses go through their model, so the triggers of their
  subscriptions are removed too."
  ([dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
   (delete-dashboards! dashboard-ids nil))
  ([dashboard-ids :- [:sequential ::lib.schema.id/dashboard]
    opts          :- ::dashboards.schema/write-opts]
   (when (seq dashboard-ids)
     (t2/with-transaction [_conn]
       (let [dashboards (dashboards.db/dashboards (vec dashboard-ids))]
         (parameter-card/delete-all-for-parameterized-objects! "dashboard" dashboard-ids)
         (revision/delete-revisions-for-entities! "Dashboard" dashboard-ids)
         (cache-config/delete-target-configs! "dashboard" dashboard-ids)
         (pulse/delete-pulses! (dashboards.db/pulse-ids-for-dashboards dashboard-ids))
         (events/publish-event! :event/dashboard-delete (events/delete-event dashboards (events/context opts)))
         (dashboards.db/delete-dashboards! dashboard-ids))))
   nil))

(mu/defn parameters-without-orphans :- [:maybe [:sequential :map]]
  "The `parameters` of a Dashboard without the inline parameters that `dashcards` of it, which are being deleted, held,
  nil when none is left out."
  [parameters :- [:maybe [:sequential :map]]
   dashcards  :- [:maybe [:sequential :map]]]
  (let [orphaned-ids (set (mapcat :inline_parameters dashcards))
        cleaned      (filterv #(not (contains? orphaned-ids (:id %))) parameters)]
    (when (and (seq orphaned-ids) (not= (count parameters) (count cleaned)))
      cleaned)))

(mu/defn delete-dashcards! :- :nil
  "Delete the DashboardCards with `dashboard-card-ids` of a Dashboard, and the inline parameters they held from its
  parameters, publishing the events of the writes and, as the last step, the update event of the Dashboard."
  ([dashboard-card-ids :- [:sequential ::lib.schema.id/dashcard]]
   (delete-dashcards! dashboard-card-ids nil))
  ([dashboard-card-ids :- [:sequential ::lib.schema.id/dashcard]
    opts               :- ::dashboards.schema/write-opts]
   (when (seq dashboard-card-ids)
     (t2/with-transaction [_conn]
       (let [dashcards     (dashboards.db/dashcards-by-ids (vec dashboard-card-ids))
             dashboard-ids (into #{} (map :dashboard_id) dashcards)
             cleaned       (when (= 1 (count dashboard-ids))
                             (parameters-without-orphans (:parameters (dashboards.db/dashboard (first dashboard-ids)))
                                                         dashcards))]
         (dashboard-card/delete-dashboard-cards! dashboard-card-ids opts)
         (if cleaned
           (update-dashboards! [{:id (first dashboard-ids) :parameters cleaned}] opts)
           (touch-dashboards! (vec dashboard-ids) opts)))))
   nil))

(mu/defn revert-dashboard! :- :map
  "Return the Dashboard `dashboard-id` to the `serialized-dashboard` that a Revision recorded: its columns, its tabs and
  its dashcards. Its writes publish no event that a Revision comes of."
  [dashboard-id        :- ::lib.schema.id/dashboard
   _user-id            :- ms/PositiveInt
   serialized-dashboard :- :map]
  (let [cleaned-parameters   (dashboards.revisions/clean-invalid-parameter-card-references
                              (or (:parameters serialized-dashboard) []))
        serialized-dashboard (assoc serialized-dashboard :parameters cleaned-parameters)
        opts                 {:writer :revert}]
    (parameter-card/check-new-parameter-source-card-permissions "dashboard" dashboard-id cleaned-parameters)
    (update-dashboards! [(assoc (select-keys serialized-dashboard (:track (revisions/spec :model/Dashboard)))
                                :id dashboard-id)]
                        {:writer :revert})
    (let [serialized-dashcards      (:cards serialized-dashboard)
          current-tabs              (mapv #(dissoc (t2.realize/realize %) :created_at :updated_at :entity_id :dashboard_id)
                                          (dashboards.db/dashboard-tabs-for-dashboards [dashboard-id]))
          {:keys [old->new-tab-id]} (dashboard-tab/replace-dashboard-tabs! dashboard-id current-tabs
                                                                           (:tabs serialized-dashboard) opts)
          _                         (dashboard-card/archive-or-unarchive-internal-dashboard-questions! dashboard-id serialized-dashcards)
          serialized-dashcards      (cond->> serialized-dashcards
                                      true
                                      (dashboards.revisions/remove-invalid-dashcards dashboard-id)
                                      (seq old->new-tab-id)
                                      (map (fn [card]
                                             (if-let [new-tab-id (get old->new-tab-id (:dashboard_tab_id card))]
                                               (assoc card :dashboard_tab_id new-tab-id)
                                               card))))
          current-cards             (->> (t2/hydrate (dashboards.db/dashcards dashboard-id) :series)
                                         (mapv #(revisions/snapshot :model/DashboardCard %)))
          {:keys [to-create to-update to-delete]} (u/row-diff current-cards serialized-dashcards)]
      (queries/check-newly-exposed-dashcards-timeline-permissions!
       (dashboards.db/dashboard dashboard-id) current-cards (concat to-create to-update))
      (when (seq to-delete)
        (let [deleted (dashboards.db/dashcards-by-ids (mapv :id to-delete))
              cleaned (parameters-without-orphans (:parameters (dashboards.db/dashboard dashboard-id)) deleted)]
          (dashboard-card/delete-dashboard-cards! (mapv :id to-delete) opts)
          (when cleaned
            (update-dashboards! [{:id dashboard-id :parameters cleaned}] opts))))
      (dashboard-card/create-dashboard-cards! (map #(assoc % :dashboard_id dashboard-id) to-create) opts)
      (dashboard-card/update-dashboard-cards! (vec to-update) opts))
    serialized-dashboard))

(mu/defn increment-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Dashboards with `ids`, in one plain
  statement that publishes no event: a usage stat no rule reads. Returns the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (dashboards.db/increment-dashboard-view-counts! count->ids))

(mu/defn touch-last-viewed! :- :nil
  "Move `last_viewed_at` of each Dashboard in `dashboard-id->timestamp` forward to its timestamp, without touching
  `updated_at`, in one plain statement that publishes no event: a usage stat the search index may see late."
  [dashboard-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  (dashboards.db/update-dashboards-last-viewed-at! dashboard-id->timestamp)
  nil)

(mu/defn set-last-viewed-at! :- :int
  "Set `last_viewed_at` of the Dashboard with `id`, through the model, returning the number updated. The testing API backdates
  it."
  [id   :- ::lib.schema.id/dashboard
   time :- ms/TemporalInstant]
  (dashboards.db/set-dashboard-last-viewed-at! id time))

(defmethod collection/shift-positions-in-collection! :model/Dashboard
  [_model collection-id positions direction]
  (dashboards.db/shift-dashboard-positions! collection-id positions direction))

(defmethod card/update-followers! :model/Dashboard
  [_model rows]
  (update-dashboards! rows))

(defmethod collection/archive-in-collections! :model/Dashboard
  [model collection-ids context]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-dashboards! (mapv (fn [id] {:id id :archived true}) ids) {:context context})))

(defmethod collection/restore-in-collections! :model/Dashboard
  [model collection-ids context]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-dashboards! (mapv (fn [id] {:id id :archived false}) ids) {:context context})))

(defmethod collection/delete-in-collections! :model/Dashboard
  [model collection-ids context]
  (when-let [ids (not-empty (collection/item-ids-in-collections model collection-ids))]
    (delete-dashboards! ids {:context context})))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

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
   :insert!             #(create-dashboards! % {:writer :import})
   :update!             #(update-dashboards! % {:writer :import})
   :delete!             #(delete-dashboards! % {:writer :import})})

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
   :update!            #(update-dashboards! [(assoc %2 :id %1)] {:writer :replacement})})

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
