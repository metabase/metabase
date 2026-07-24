(ns metabase.dashboards.write
  "Permission-checked create/update operations for Dashboards, shared by the REST API and other callers.

  These functions return the saved Dashboard row; response-shaping concerns such as hydration and
  `:last-edit-info` belong to the callers."
  (:require
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.pulse.broken-subscriptions :as pulse.broken-subscriptions]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn create-dashboard! :- :map
  "Create a Dashboard owned by the current user and return the saved row. `:width` and
  `:auto_apply_filters` fall back to the column defaults when omitted or nil.
  Requires create permission on `:collection_id` (nil = root). Publishes `:event/dashboard-create`."
  [{:keys [name description parameters cache_ttl collection_id collection_position
           width auto_apply_filters]}
   :- [:map
       [:name                ms/NonBlankString]
       [:parameters          {:optional true} [:maybe ::parameters.schema/parameters]]
       [:description         {:optional true} [:maybe :string]]
       [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
       [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
       [:collection_position {:optional true} [:maybe ms/PositiveInt]]
       [:width               {:optional true} [:maybe [:enum "fixed" "full"]]]
       [:auto_apply_filters  {:optional true} [:maybe :boolean]]]]
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (api/create-check :model/Dashboard {:collection_id collection_id})
  (let [dashboard-data (cond-> {:name                name
                                :description         description
                                :parameters          (or parameters [])
                                :creator_id          api/*current-user-id*
                                :cache_ttl           cache_ttl
                                :collection_id       collection_id
                                :collection_position collection_position}
                         ;; both columns are NOT NULL with defaults, so only set them when asked
                         (some? width)              (assoc :width width)
                         (some? auto_apply_filters) (assoc :auto_apply_filters auto_apply_filters))
        dash           (t2/with-transaction [_conn]
                         ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                         ;; collection to change position, check that and fix up if needed
                         (api/maybe-reconcile-collection-position! dashboard-data)
                         ;; Ok, now save the Dashboard
                         (first (t2/insert-returning-instances! :model/Dashboard dashboard-data)))]
    (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dash)})
    dash))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding`, `embedding_type` or `embedding_params`. Embedding must be
  enabled."
  [dash-before-update dash-updates]
  (when (or (api/column-will-change? :enable_embedding dash-before-update dash-updates)
            (api/column-will-change? :embedding_type dash-before-update dash-updates)
            (api/column-will-change? :embedding_params dash-before-update dash-updates))
    (embedding.validation/check-embedding-enabled)
    (api/check-superuser)))

(mu/defn- param-target->field-id :- [:maybe ::lib.schema.id/field]
  [target query]
  (params/param-target->field-id target {:dataset_query query}))

;; TODO -- should we only check *new* or *modified* mappings?
(mu/defn- check-parameter-mapping-permissions
  "Starting in 0.41.0, you must have *data* permissions in order to add or modify a DashboardCard parameter mapping."
  {:added "0.41.0"}
  [parameter-mappings :- [:sequential ::parameters.schema/parameter-mapping]]
  (when (seq parameter-mappings)
    ;; calculate a set of all Field IDs referenced by parameter mappings; then from those Field IDs calculate a set of
    ;; all Table IDs to which those Fields belong. This is done in a batched fashion so we can avoid N+1 query issues
    ;; if there happen to be a lot of parameters
    (let [card-ids              (into #{}
                                      (comp (map :card-id)
                                            (remove nil?))
                                      parameter-mappings)]
      (when (seq card-ids)
        (let [card-id->query        (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids])
              field-ids             (set (for [{:keys [target card-id]} parameter-mappings
                                               :when                    card-id
                                               :let                     [query    (or (card-id->query card-id)
                                                                                      (throw (ex-info (tru "Card {0} does not exist or does not have a valid query."
                                                                                                           card-id)
                                                                                                      {:status-code 404
                                                                                                       :card-id     card-id})))
                                                                         field-id (param-target->field-id target query)]
                                               :when                    field-id]
                                           field-id))
              table-ids             (when (seq field-ids)
                                      (t2/select-fn-set :table_id :model/Field :id [:in field-ids]))
              table-id->database-id (when (seq table-ids)
                                      (t2/select-pk->fn :db_id :model/Table :id [:in table-ids]))]
          (doseq [table-id table-ids
                  :let     [database-id (table-id->database-id table-id)]]
            ;; check whether we'd actually be able to query this Table (do we have ad-hoc data perms for it?)
            (when-not (query-perms/can-query-table? database-id table-id)
              (throw (ex-info (tru "You must have data permissions to add a parameter referencing the Table {0}."
                                   (pr-str (t2/select-one-fn :name :model/Table :id table-id)))
                              {:status-code        403
                               :database-id        database-id
                               :table-id           table-id
                               :actual-permissions @api/*current-user-permissions-set*})))))))))

(defn- existing-parameter-mappings
  "Returns a map of DashboardCard ID -> parameter mappings for a Dashboard of the form

  {<dashboard-card-id> #{{:target       [:dimension [:field 1000 nil]]
                          :parameter_id \"abcdef\"}}}"
  [dashboard-id]
  (m/map-vals (fn [mappings]
                (into #{} (map #(select-keys % [:target :parameter_id])) mappings))
              (t2/select-pk->fn :parameter_mappings :model/DashboardCard :dashboard_id dashboard-id)))

(defn- check-updated-parameter-mapping-permissions
  "In 0.41.0+ you now require data permissions for the Table in question to add or modify Dashboard parameter mappings.
  Check that the current user has the appropriate permissions. Don't check any parameter mappings that already exist
  for this Dashboard -- only check permissions for new or modified ones."
  [dashboard-id dashcards]
  (let [dashcard-id->existing-mappings (existing-parameter-mappings dashboard-id)
        existing-mapping?              (fn [dashcard-id mapping]
                                         (let [mapping (parameters/normalize-parameter-mapping mapping)
                                               existing-mappings (get dashcard-id->existing-mappings dashcard-id)]
                                           (contains? existing-mappings (select-keys mapping [:target :parameter_id]))))
        new-mappings                   (for [{mappings :parameter_mappings, dashcard-id :id} dashcards
                                             mapping mappings
                                             :when (not (existing-mapping? dashcard-id mapping))]
                                         (assoc mapping :dashcard-id dashcard-id))
        ;; need to add the appropriate `:card-id` for all the new mappings we're going to check.
        dashcard-id->card-id           (when (seq new-mappings)
                                         (t2/select-pk->fn :card_id :model/DashboardCard
                                                           :dashboard_id dashboard-id
                                                           :id           [:in (set (map :dashcard-id new-mappings))]))
        new-mappings                   (for [{:keys [dashcard-id], :as mapping} new-mappings]
                                         (assoc mapping :card-id (get dashcard-id->card-id dashcard-id)))]
    (check-parameter-mapping-permissions new-mappings)))

(defn- create-dashcards!
  [dashboard dashcards]
  (doseq [{:keys [card_id]} dashcards
          :when  (pos-int? card_id)]
    (api/check-not-archived (api/read-check :model/Card card_id)))
  (check-parameter-mapping-permissions (for [{:keys [card_id parameter_mappings]} dashcards
                                             mapping parameter_mappings]
                                         (assoc mapping :card-id card_id)))
  (api/check-500 (dashboard/add-dashcards! dashboard dashcards)))

(defn- update-dashcards! [dashboard dashcards]
  (check-updated-parameter-mapping-permissions (:id dashboard) dashcards)
  ;; transform the dashcard data to the format of the DashboardCard model
  ;; so update-dashcards! can compare them with existing dashcards
  (dashboard/update-dashcards! dashboard (map dashboard-card/from-parsed-json dashcards))
  dashcards)

(defn- delete-dashcards! [dashcard-ids]
  (let [dashboard-cards (t2/select :model/DashboardCard :id [:in dashcard-ids])]
    (dashboard-card/delete-dashboard-cards! dashcard-ids)
    dashboard-cards))

(defn- assert-dashcards-are-not-internal-to-other-dashboards [dashboard dashcards]
  (when-let [card-ids (seq (concat
                            (seq (keep :card_id dashcards))
                            (->> dashcards
                                 (mapcat :series)
                                 (keep :id))))]
    (api/check-400 (not (t2/exists? :model/Card
                                    {:where [:and
                                             [:not= :dashboard_id (u/the-id dashboard)]
                                             [:not= :dashboard_id nil]
                                             [:in :id (set card-ids)]]})))))

(defn- do-update-dashcards!
  [dashboard current-cards new-cards]
  (let [{:keys [to-create to-update to-delete]} (u/row-diff current-cards new-cards)]
    (dashboard/archive-or-unarchive-internal-dashboard-questions! (:id dashboard) new-cards)
    ;; Check both created and updated dashcards: a "Replace" keeps the dashcard id and only swaps
    ;; card_id, so it lands in `to-update`, not `to-create` (UXW-4731).
    (assert-dashcards-are-not-internal-to-other-dashboards dashboard (concat to-create to-update))
    (when (seq to-update)
      (update-dashcards! dashboard to-update))
    {:deleted-dashcards (when (seq to-delete)
                          (delete-dashcards! (map :id to-delete)))
     :created-dashcards (when (seq to-create)
                          (create-dashcards! dashboard to-create))}))

(def UpdatedDashboardCard
  "Schema for one dashcard in a dashboard update payload. A negative `:id` marks a dashcard to
  create; positive ids name existing rows, and rows absent from the payload are deleted."
  [:map
   [:id                                  int?]
   [:size_x                              ms/PositiveInt]
   [:size_y                              ms/PositiveInt]
   [:row                                 ms/IntGreaterThanOrEqualToZero]
   [:col                                 ms/IntGreaterThanOrEqualToZero]
   [:parameter_mappings {:optional true} [:maybe [:ref ::parameters.schema/parameter-mappings]]]
   [:inline_parameters  {:optional true} [:maybe [:sequential ms/NonBlankString]]]
   [:series             {:optional true} [:maybe [:sequential map?]]]])

(def UpdatedDashboardTab
  "Schema for one tab in a dashboard update payload. A negative `:id` marks a tab to create;
  positive ids name existing rows, and rows absent from the payload are deleted."
  [:map
   [:id   ms/Int]
   [:name ms/NonBlankString]])

(defn- track-dashcard-and-tab-events!
  [{dashboard-id :id :as dashboard}
   {:keys [created-dashcards deleted-dashcards
           created-tab-ids deleted-tab-ids total-num-tabs]}]
  ;; Dashcard events
  (when (seq deleted-dashcards)
    (events/publish-event! :event/dashboard-remove-cards
                           {:object dashboard :user-id api/*current-user-id* :dashcards deleted-dashcards}))
  (when (seq created-dashcards)
    (events/publish-event! :event/dashboard-add-cards
                           {:object dashboard :user-id api/*current-user-id* :dashcards created-dashcards})
    (doseq [{:keys [card_id]} created-dashcards
            :when             (pos-int? card_id)]
      (analytics/track-event! :snowplow/dashboard
                              {:event        :question-added-to-dashboard
                               :dashboard-id dashboard-id
                               :question-id  card_id})))
  ;; Tabs events
  (when (seq deleted-tab-ids)
    (analytics/track-event! :snowplow/dashboard
                            {:event          :dashboard-tab-deleted
                             :dashboard-id   dashboard-id
                             :num-tabs       (count deleted-tab-ids)
                             :total-num-tabs total-num-tabs}))
  (when (seq created-tab-ids)
    (analytics/track-event! :snowplow/dashboard
                            {:event          :dashboard-tab-created
                             :dashboard-id   dashboard-id
                             :num-tabs       (count created-tab-ids)
                             :total-num-tabs total-num-tabs})))

(defn update-dashboard!
  "Update the Dashboard with `id` and return the saved row. `dash-updates` may carry
  dashboard attributes plus `:dashcards` and `:tabs`, which fully replace the current layout — entries
  with negative ids are created, missing entries are deleted. Requires write permission on the dashboard;
  runs in one transaction. Publishes `:event/dashboard-update` and may notify owners of broken subscriptions."
  [id {:keys [dashcards tabs parameters] :as dash-updates}]
  (span/with-span!
    {:name       "update-dashboard"
     :attributes {:dashboard/id id}}
    (let [current-dash                       (api/write-check :model/Dashboard id)
          ;; If there are parameters in the update, we want the old params so that we can do a check to see if any of
          ;; the notifications were broken by the update.
          {original-params :resolved-params} (when parameters
                                               (t2/hydrate
                                                (t2/select-one :model/Dashboard id)
                                                [:dashcards :card]
                                                :resolved-params))
          changes-stats                      (atom nil)
          ;; tabs are always sent in production as well when dashcards are updated, but there are lots of
          ;; tests that exclude it. so this only checks for dashcards
          update-dashcards-and-tabs?         (contains? dash-updates :dashcards)
          dash-updates                       (api/updates-with-archived-directly current-dash dash-updates)]
      (collection/check-allowed-to-change-collection current-dash dash-updates)
      (check-allowed-to-change-embedding current-dash dash-updates)
      (api/check-500
       (do
         (t2/with-transaction [_conn]
           ;; If the dashboard has an updated position, or if the dashboard is moving to a new collection, we might need to
           ;; adjust the collection position of other dashboards in the collection
           (api/maybe-reconcile-collection-position! current-dash dash-updates)
           (when-let [updates (not-empty
                               (u/select-keys-when
                                dash-updates
                                :present #{:description :position :width :collection_id :collection_position :cache_ttl :archived_directly :embedding_type}
                                :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started :enable_embedding
                                           :embedding_params :archived :auto_apply_filters}))]
             (dashboard/cascade-card-state-from-dashboard-update! current-dash dash-updates)
             (t2/update! :model/Dashboard id updates)
             (when (contains? updates :collection_id)
               (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*}))
             ;; Handle broken subscriptions, if any, when parameters changed
             (when parameters
               (pulse.broken-subscriptions/handle-broken-subscriptions! id original-params)))
           (when update-dashcards-and-tabs?
             (when (not (false? (:archived false)))
               (api/check-not-archived current-dash))
             (let [{current-dashcards :dashcards
                    current-tabs      :tabs
                    :as               hydrated-current-dash} (t2/hydrate current-dash [:dashcards :series :card] :tabs)
                   new-tabs                                  (map-indexed (fn [idx tab] (assoc tab :position idx)) tabs)
                   dashcards                                 (if (= 1 (count new-tabs))
                                                               (let [single-tab-id (-> new-tabs first :id)]
                                                                 (mapv #(if (nil? (:dashboard_tab_id %))
                                                                          (assoc % :dashboard_tab_id single-tab-id)
                                                                          %)
                                                                       dashcards))
                                                               dashcards)
                   _                                         (when (and (seq new-tabs)
                                                                        (not (every? #(some? (:dashboard_tab_id %)) dashcards)))
                                                               (throw (ex-info (tru "This dashboard has tab, makes sure every card has a tab")
                                                                               {:status-code 400})))
                   {:keys [old->new-tab-id
                           deleted-tab-ids]
                    :as   tabs-changes-stats}                (dashboard-tab/do-update-tabs! (:id current-dash) current-tabs new-tabs)
                   deleted-tab-ids                           (set deleted-tab-ids)
                   current-dashcards                         (remove (fn [dashcard]
                                                                       (contains? deleted-tab-ids (:dashboard_tab_id dashcard)))
                                                                     current-dashcards)
                   new-dashcards                             (cond->> dashcards
                                                               ;; fixup the temporary tab ids with the real ones
                                                               (seq old->new-tab-id)
                                                               (map (fn [card]
                                                                      (if-let [real-tab-id (get old->new-tab-id (:dashboard_tab_id card))]
                                                                        (assoc card :dashboard_tab_id real-tab-id)
                                                                        card))))
                   dashcards-changes-stats                   (do-update-dashcards! hydrated-current-dash current-dashcards new-dashcards)]
               (reset! changes-stats
                       (merge
                        (select-keys tabs-changes-stats [:created-tab-ids :deleted-tab-ids :total-num-tabs])
                        (select-keys dashcards-changes-stats [:created-dashcards :deleted-dashcards])))))
           (collections/check-for-remote-sync-update current-dash))
         true))
      (let [dashboard (t2/select-one :model/Dashboard id)]
        ;; skip publishing the event if it's just a change in its collection position
        (when-not (= #{:collection_position}
                     (set (keys dash-updates)))
          (events/publish-event! :event/dashboard-update {:object dashboard :user-id api/*current-user-id*}))
        (track-dashcard-and-tab-events! dashboard @changes-stats)
        dashboard))))

(def DashUpdates
  "Schema for the `dash-updates` argument to [[update-dashboard!]]: dashboard attributes plus the
  optional `:dashcards`/`:tabs` full-replacement layout."
  [:map
   [:name                    {:optional true} [:maybe ms/NonBlankString]]
   [:description             {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:enable_embedding        {:optional true} [:maybe :boolean]]
   [:embedding_type          {:optional true} [:maybe :string]]
   [:embedding_params        {:optional true} [:maybe ms/EmbeddingParams]]
   [:parameters              {:optional true} [:maybe ::parameters.schema/parameters]]
   [:position                {:optional true} [:maybe ms/PositiveInt]]
   [:width                   {:optional true} [:enum "fixed" "full"]]
   [:archived                {:optional true} [:maybe :boolean]]
   [:collection_id           {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position     {:optional true} [:maybe ms/PositiveInt]]
   [:cache_ttl               {:optional true} [:maybe ms/PositiveInt]]
   [:dashcards               {:optional true} [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardCard] :id)]]
   [:tabs                    {:optional true} [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardTab] :id)]]])
