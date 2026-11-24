(ns metabase.dashboards.write
  "Permission-checked create/update operations for Dashboards, used by the REST API, MCP's tools, the Metabot toolkit
  and the Agent API.

  These functions return the saved Dashboard row; response-shaping concerns such as hydration and
  `:last-edit-info` belong to the callers."
  (:require
   [clojure.set :as set]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.events.core :as events]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.pulse.broken-subscriptions :as pulse.broken-subscriptions]
   [metabase.queries.core :as queries]
   [metabase.queries.models.card :as queries.card]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- dashcard-card-ids [dashcard]
  (concat (when-let [card-id (:card_id dashcard)]
            [card-id])
          (keep :id (:series dashcard))))

(defn- references
  [{:keys [dashcards parameters]}]
  {:cards   (into (set (queries/values-source-card-ids parameters))
                  (comp (mapcat dashcard-card-ids) (filter pos-int?))
                  dashcards)
   :actions (into #{} (keep :action_id) dashcards)})

(defn- stored-references
  [dashboard-id]
  {:cards   (into (set (dashboards.db/parameter-card-card-ids dashboard-id))
                  (concat (dashboards.db/dashcard-card-ids dashboard-id)
                          (dashboards.db/dashcard-series-card-ids dashboard-id)))
   :actions (set (dashboards.db/dashcard-action-ids dashboard-id))})

(def ^:private no-references {:cards #{} :actions #{}})

(defn read-check-all
  "Throws unless the current user can read every row of `rows`, in the order of `ids`, with a 404 for an id without a row."
  [rows ids]
  (let [id->row (into {} (map (juxt :id identity)) (t2/hydrate rows :can_read))]
    (doseq [id ids]
      (api/read-check (get id->row id)))))

(defn- check-new-references
  "Throws unless the current user can read every card and action `dashboard` references beyond those `stored-fn`
  returns."
  [stored-fn dashboard]
  (let [new-references (references dashboard)]
    (when (some seq (vals new-references))
      (let [stored     (stored-fn)
            card-ids   (vec (set/difference (:cards new-references) (:cards stored)))
            action-ids (vec (set/difference (:actions new-references) (:actions stored)))]
        (read-check-all (dashboards.db/cards-by-ids card-ids) card-ids)
        (read-check-all (dashboards.db/actions-by-ids action-ids) action-ids)))))

(def NewDashboard
  "Schema for the argument to [[create-dashboard!]]: the attributes of a new dashboard."
  [:map {:closed true}
   [:name                ::dashboards.schema/dashboard.name]
   [:parameters          {:optional true} [:maybe ::parameters.schema/parameters]]
   [:description         {:optional true} [:maybe :string]]
   [:cache_ttl           {:optional true} [:maybe ms/PositiveInt]]
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]
   [:width               {:optional true} [:maybe ::dashboards.schema/dashboard.width]]
   [:auto_apply_filters  {:optional true} [:maybe :boolean]]
   [:dashcards           {:optional true} [:maybe [:sequential (mut/dissoc ::dashboards.schema/dashboard-card.update :id)]]]])

(mu/defn create-dashboard! :- :map
  "Creates a Dashboard owned by the current user after its create check, with the `:dashcards` of `attrs` when it has
  some, and returns the row, publishing the create event of the Dashboard last."
  ([attrs :- NewDashboard]
   (create-dashboard! attrs nil))
  ([{:keys [name description parameters cache_ttl collection_id collection_position
            width auto_apply_filters dashcards]} :- NewDashboard
    opts                                          :- :metabase.events.schema/write-opts]
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
         _              (api/create-check :model/Dashboard dashboard-data)
         _              (check-new-references (constantly no-references) {:parameters parameters})
         dash           (t2/with-transaction [_conn]
                          ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                          ;; collection to change position, check that and fix up if needed
                          (collection/maybe-reconcile-collection-position! (select-keys dashboard-data [:collection_id :collection_position]))
                          (first (dashboard/create-dashboards! [(cond-> dashboard-data
                                                                  (seq dashcards) (assoc :dashcards dashcards))]
                                                               opts)))]
     (analytics/track-event! :snowplow/dashboard
                             {:event        :dashboard-created
                              :dashboard-id (u/the-id dash)})
     dash)))

(defn- check-embedding-enabled
  "Throws a 400 unless embedding is enabled, when `dash-updates` change the embedding of `dash-before-update`."
  [dash-before-update dash-updates]
  (when (dashboard/changes-embedding? dash-before-update dash-updates)
    (embedding.validation/check-embedding-enabled)))

(mu/defn- param-target->field-id :- [:maybe ::lib.schema.id/field]
  [target :- ::lib.schema.common/possibly-unnormalized-clause
   query  :- [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]
  (params/param-target->field-id target {:dataset_query query}))

;; TODO -- should we only check *new* or *modified* mappings?
(mu/defn- check-parameter-mapping-permissions
  "Starting in 0.41.0, you must have *data* permissions in order to add or modify a DashboardCard parameter mapping."
  {:added "0.41.0"}
  [parameter-mappings :- [:sequential [:merge
                                       ::parameters.schema/parameter-mapping
                                       [:map {:closed true}
                                        [:dashcard-id {:optional true} [:maybe ms/PositiveInt]]
                                        [:card-id     {:optional true} [:maybe ms/PositiveInt]]]]]]
  (when (seq parameter-mappings)
    (let [card-ids       (into #{} (keep :card-id) parameter-mappings)
          card-id->query (when (seq card-ids)
                           (dashboards.db/card-queries card-ids))
          field-ids      (into []
                               (keep (fn [{:keys [target card-id]}]
                                       (when target
                                         (let [query (when card-id
                                                       (or (card-id->query card-id)
                                                           (throw (ex-info (tru "Card {0} does not exist or does not have a valid query."
                                                                                card-id)
                                                                           {:status-code 404
                                                                            :card-id     card-id}))))]
                                           (param-target->field-id target query)))))
                               parameter-mappings)]
      (query-perms/check-parameter-field-permissions field-ids))))

(defn- existing-parameter-mappings
  "Returns a map of DashboardCard ID -> parameter mappings for a Dashboard of the form

  {<dashboard-card-id> #{{:target       [:dimension [:field 1000 nil]]
                          :parameter_id \"abcdef\"}}}"
  [dashboard-id]
  (m/map-vals (fn [mappings]
                (into #{} (map #(select-keys % [:target :parameter_id])) mappings))
              (dashboards.db/dashcard-parameter-mappings dashboard-id)))

(defn- check-updated-parameter-mapping-permissions
  "In 0.41.0+ you now require data permissions for the Table in question to add or modify Dashboard parameter mappings.
  Check that the current user has the appropriate permissions. Don't check any parameter mappings that already exist
  for this Dashboard -- only check permissions for new or modified ones."
  [dashboard-id dashcards]
  (let [dashcard-id->existing-mappings (existing-parameter-mappings dashboard-id)
        existing-mapping?              (fn [dashcard-id mapping]
                                         (let [mapping (lib/normalize ::parameters.schema/parameter-mapping mapping)
                                               existing-mappings (get dashcard-id->existing-mappings dashcard-id)]
                                           (contains? existing-mappings (select-keys mapping [:target :parameter_id]))))
        new-mappings                   (for [{mappings :parameter_mappings, dashcard-id :id} dashcards
                                             mapping mappings
                                             :when (not (existing-mapping? dashcard-id mapping))]
                                         (assoc mapping :dashcard-id dashcard-id))
        ;; need to add the appropriate `:card-id` for all the new mappings we're going to check.
        dashcard-id->card-id           (when (seq new-mappings)
                                         (dashboards.db/dashcard-card-ids-by-dashcard-id
                                          dashboard-id
                                          (set (map :dashcard-id new-mappings))))
        new-mappings                   (for [{:keys [dashcard-id], :as mapping} new-mappings]
                                         (assoc mapping :card-id (get dashcard-id->card-id dashcard-id)))]
    (check-parameter-mapping-permissions new-mappings)))

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

(defn- update-on-demand-field-values-of-new-dashboard!
  "Update the FieldValues of the Fields that the parameters of the new Dashboard with `dashboard-id` use, for those that
  belong to an 'On-Demand' synced DB."
  [dashboard-id]
  (update-field-values-for-on-demand-dbs! #{} (dashboard-id->param-field-ids dashboard-id)))

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
          card (first
                (queries.card/create-cards!
                 [(->> (-> card
                           (update :result_metadata #(or % (-> card
                                                               :dataset_query
                                                               legacy-result-metadata-for-query)))
                           (dissoc :id
                                   :public_uuid :made_public_by_id
                                   :enable_embedding :embedding_params)
                           (assoc :creator_id api/*current-user-id*))
                       (lib/normalize ::queries.schema/card.create))]))]
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
          [dashboard]
          (dashboard/create-dashboards!
           [(->> (-> dashboard
                     (dissoc :dashcards :tabs :rule :related
                             :transient_name :transient_filters :param_fields :more
                             :public_uuid :made_public_by_id
                             :enable_embedding :embedding_params)
                     (assoc :description description
                            :collection_id parent-collection-id
                            :creator_id api/*current-user-id*))
                 (lib/normalize ::dashboards.schema/dashboard.create))])
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
                                                (assoc :series (into [] (comp (remove nil?) (map u/the-id)) series))
                                                (assoc :card_id (:id card)))]
                               dashcard))]
      (check-dashcard-parameter-mapping-permissions dashcards-to-add)
      (dashboard/update-dashboard! (:id dashboard)
                                   {:tabs      (vec tabs)
                                    :dashcards (vec dashcards-to-add)})
      (update-on-demand-field-values-of-new-dashboard! (:id dashboard))
      dashboard)))

(defn- create-dashcards-check!
  "Throws unless the current user may add the new `dashcards`."
  [dashcards]
  (let [card-ids (vec (into #{} (comp (mapcat dashcard-card-ids) (filter pos-int?)) dashcards))
        id->card (m/index-by :id (dashboards.db/cards-by-ids card-ids))]
    (doseq [card-id card-ids]
      (api/check-not-archived (get id->card card-id))))
  (check-parameter-mapping-permissions (for [{:keys [card_id parameter_mappings]} dashcards
                                             mapping parameter_mappings]
                                         (assoc mapping :card-id card_id))))

(defn- assert-dashcards-are-not-internal-to-other-dashboards
  "Reject `new-dashcards` that newly reference a question internal to another dashboard. Card ids the
  dashboard already references (as a dashcard's card or series, per `existing-dashboard`'s hydrated
  `:dashcards`) are grandfathered so that pre-existing associations never block saving the dashboard
  (UXW-4870)."
  [existing-dashboard new-dashcards]
  (let [grandfathered-ids (into #{} (mapcat dashcard-card-ids) (:dashcards existing-dashboard))]
    (when-let [card-ids (seq (remove grandfathered-ids (mapcat dashcard-card-ids new-dashcards)))]
      (api/check-400 (not (dashboards.db/card-internal-to-other-dashboard?
                           (u/the-id existing-dashboard)
                           (set card-ids)))))))

(defn- check-dashcards
  "Throw unless the current user may save `new-dashcards` as the dashcards of `dashboard`, hydrated with its current
  `:dashcards`, the cards they newly expose, their parameter mappings and the cards they name having to be allowed
  and the new dashcards addable, and return the `new-dashcards` with the changes that the model reads of JSON."
  [dashboard new-dashcards]
  (let [current-ids (into #{} (map :id) (:dashcards dashboard))
        existing?   #(contains? current-ids (:id %))
        to-create   (remove existing? new-dashcards)
        to-update   (filter existing? new-dashcards)]
    ;; Grandfather against the dashboard as it was before this update, as REST does: a card that already showed
    ;; its events keeps them even if its tab is deleted and it is re-added elsewhere in the same request.
    (queries/check-newly-exposed-dashcards-timeline-permissions!
     dashboard (:dashcards dashboard) new-dashcards)
    ;; Check both created and updated dashcards: a "Replace" keeps the dashcard id and only swaps
    ;; card_id, so it lands in `to-update`, not `to-create` (UXW-4731). Card ids the dashboard already
    ;; references are grandfathered, so pre-existing foreign internal cards don't block saving (UXW-4870).
    (assert-dashcards-are-not-internal-to-other-dashboards dashboard new-dashcards)
    (check-updated-parameter-mapping-permissions (:id dashboard) to-update)
    (when (seq to-create)
      (create-dashcards-check! to-create))
    (mapv (fn [dashcard]
            (-> (cond-> dashcard (existing? dashcard) dashboard-card/from-parsed-json)
                (update :series #(into [] (comp (remove nil?) (map u/the-id)) %))))
          new-dashcards)))

(def UpdatedDashboardCard
  "Schema for one dashcard in a dashboard update payload. A negative `:id` marks a dashcard to
  create; positive ids name existing rows, and rows absent from the payload are deleted."
  [:map
   [:id                                      int?]
   [:size_x                                  ::dashboards.schema/dashboard-card.size]
   [:size_y                                  ::dashboards.schema/dashboard-card.size]
   [:row                                     ::dashboards.schema/dashboard-card.position]
   [:col                                     ::dashboards.schema/dashboard-card.position]
   [:card_id                {:optional true} [:maybe ms/PositiveInt]]
   [:action_id              {:optional true} [:maybe ms/PositiveInt]]
   [:dashboard_tab_id       {:optional true} [:maybe int?]]
   [:parameter_mappings     {:optional true} [:maybe [:ref ::parameters.schema/parameter-mappings]]]
   [:visualization_settings {:optional true} [:maybe ::lib.schema.visualization/visualization-settings]]
   [:inline_parameters      {:optional true} [:maybe [:sequential ms/NonBlankString]]]
   [:series                 {:optional true} [:maybe [:sequential [:map [:id ms/PositiveInt]]]]]])

(def UpdatedDashboardTab
  "Schema for one tab in a dashboard update payload. A negative `:id` marks a tab to create;
  positive ids name existing rows, and rows absent from the payload are deleted."
  [:map
   [:id       ms/Int]
   [:name     ::dashboards.schema/dashboard-tab.name]
   ;; tab order -- `metabase.dashboards.models.dashboard-tab/do-update-tabs!` writes it alongside `:name`
   [:position {:optional true} ::dashboards.schema/dashboard-tab.position]])

(defn- track-dashcard-and-tab-events!
  [dashboard-id current-dashcards current-tabs dashcards tabs]
  (let [current-dashcard-ids (into #{} (map :id) current-dashcards)
        current-tab-ids      (into #{} (map :id) current-tabs)
        new-tab-ids          (into #{} (map :id) tabs)
        created-tab-ids      (remove current-tab-ids new-tab-ids)
        deleted-tab-ids      (remove new-tab-ids current-tab-ids)]
    (doseq [{:keys [id card_id]} dashcards
            :when                (and (pos-int? card_id) (not (contains? current-dashcard-ids id)))]
      (analytics/track-event! :snowplow/dashboard
                              {:event        :question-added-to-dashboard
                               :dashboard-id dashboard-id
                               :question-id  card_id}))
    (when (seq deleted-tab-ids)
      (analytics/track-event! :snowplow/dashboard
                              {:event          :dashboard-tab-deleted
                               :dashboard-id   dashboard-id
                               :num-tabs       (count deleted-tab-ids)
                               :total-num-tabs (count tabs)}))
    (when (seq created-tab-ids)
      (analytics/track-event! :snowplow/dashboard
                              {:event          :dashboard-tab-created
                               :dashboard-id   dashboard-id
                               :num-tabs       (count created-tab-ids)
                               :total-num-tabs (count tabs)}))))

(defn update-dashboard!
  "Update the Dashboard with `id` and return the saved row.
  The `dash-updates` may carry dashboard attributes plus `:dashcards` and `:tabs`, which fully replace the current
  layout — entries with negative ids are created, missing entries are deleted.
  Requires write permission on the dashboard; runs in one transaction and may notify owners of broken subscriptions.
  Read the subscriptions it archived from the returned row with [[archived-subscriptions]]."
  [id {:keys [dashcards tabs parameters] :as dash-updates}]
  (span/with-span!
    {:name       "update-dashboard"
     :attributes {:dashboard/id id}}
    (check-new-references #(stored-references id) dash-updates)
    (let [current-dash                       (api/check-404 (dashboards.db/dashboard id))
          ;; If there are parameters in the update, we want the old params so that we can do a check to see if any of
          ;; the notifications were broken by the update.
          {original-params :resolved-params} (when parameters
                                               (t2/hydrate
                                                (dashboards.db/dashboard id)
                                                [:dashcards :card]
                                                :resolved-params))
          archived                           (atom nil)
          tracked                            (volatile! nil)
          ;; tabs are always sent in production as well when dashcards are updated, but there are lots of
          ;; tests that exclude it. so this only checks for dashcards
          update-dashcards-and-tabs?         (contains? dash-updates :dashcards)
          dash-updates                       (api/updates-without-collection-when-archiving current-dash dash-updates)]
      (api/update-check current-dash dash-updates)
      (check-embedding-enabled current-dash dash-updates)
      (t2/with-transaction [_conn]
        (let [updates (u/select-keys-when
                       dash-updates
                       :present #{:description :position :width :collection_id :collection_position :cache_ttl :embedding_type}
                       :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started :enable_embedding
                                  :embedding_params :archived :auto_apply_filters})
              parts   (volatile! nil)]
          ;; If the dashboard has an updated position, or if the dashboard is moving to a new collection, we might need to
          ;; adjust the collection position of other dashboards in the collection
          (collection/maybe-reconcile-collection-position! (select-keys current-dash [:collection_id :collection_position]) (select-keys dash-updates [:collection_id :collection_position]))
          (when update-dashcards-and-tabs?
            (when (not (false? (:archived dash-updates)))
              (api/check-not-archived current-dash))
            (let [{current-dashcards :dashcards
                   current-tabs      :tabs
                   :as               hydrated-current-dash} (t2/hydrate current-dash [:dashcards :series :card] :tabs)
                  new-tabs                                  (map-indexed (fn [idx tab] (assoc (select-keys tab [:id :name :entity_id]) :position idx)) tabs)
                  dashcards                                 (if (= 1 (count new-tabs))
                                                              (let [single-tab-id (-> new-tabs first :id)]
                                                                (mapv #(if (nil? (:dashboard_tab_id %))
                                                                         (assoc % :dashboard_tab_id single-tab-id)
                                                                         %)
                                                                      dashcards))
                                                              dashcards)]
              (when (and (seq new-tabs)
                         (not (every? #(some? (:dashboard_tab_id %)) dashcards)))
                (throw (ex-info (tru "This dashboard has tab, makes sure every card has a tab")
                                {:status-code 400})))
              (dashboard-card/check-unarchive-internal-dashboard-questions (:id current-dash) dashcards)
              (dashboard-card/unarchive-internal-dashboard-questions! (:id current-dash) dashcards)
              (let [dashcards (check-dashcards hydrated-current-dash dashcards)]
                (vreset! parts {:tabs (vec new-tabs) :dashcards dashcards})
                (vreset! tracked [current-dashcards current-tabs dashcards new-tabs]))))
          (let [old-param-field-ids (when @parts (dashboard-id->param-field-ids id))]
            (when (or (seq updates) @parts)
              (dashboard/update-dashboard! id (merge updates @parts)))
            (when @parts
              (update-field-values-for-on-demand-dbs! old-param-field-ids (dashboard-id->param-field-ids id))))
          (when update-dashcards-and-tabs?
            (dashboard-card/check-archive-internal-dashboard-questions id (:dashcards @parts))
            (dashboard-card/archive-internal-dashboard-questions! id (:dashcards @parts)))
          (when (seq updates)
            (when (some? (:collection_id updates))
              (events/publish-event! :event/collection-touch {:collection-id (:collection_id updates) :user-id api/*current-user-id*}))
            ;; Handle broken subscriptions, if any, when parameters changed
            (when parameters
              (reset! archived (pulse.broken-subscriptions/handle-broken-subscriptions!
                                id original-params))))))
      (let [dashboard (dashboards.db/dashboard id)]
        (when-let [[current-dashcards current-tabs dashcards new-tabs] @tracked]
          (track-dashcard-and-tab-events! id current-dashcards current-tabs dashcards new-tabs))
        ;; In metadata, so a caller that returns the row, as the REST API does, can't send them on.
        (cond-> dashboard
          (seq @archived) (vary-meta assoc ::archived-subscriptions @archived))))))

(defn archived-subscriptions
  "The subscriptions archived by the [[update-dashboard!]] call that returned `dashboard`, as
  [[pulse.broken-subscriptions/handle-broken-subscriptions!]] returns them.
  Returns nil when that call archived none, or when `dashboard` didn't come from it."
  [dashboard]
  (::archived-subscriptions (meta dashboard)))

(def DashUpdates
  "Schema for the `dash-updates` argument to [[update-dashboard!]]: dashboard attributes plus the
  optional `:dashcards`/`:tabs` full-replacement layout."
  [:map
   [:name                    {:optional true} [:maybe ::dashboards.schema/dashboard.name]]
   [:description             {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:enable_embedding        {:optional true} [:maybe :boolean]]
   [:embedding_type          {:optional true} [:maybe :string]]
   [:embedding_params        {:optional true} [:maybe ms/EmbeddingParams]]
   [:parameters              {:optional true} [:maybe ::parameters.schema/parameters]]
   [:position                {:optional true} [:maybe ms/PositiveInt]]
   [:width                   {:optional true} ::dashboards.schema/dashboard.width]
   [:archived                {:optional true} [:maybe :boolean]]
   [:collection_id           {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position     {:optional true} [:maybe ms/PositiveInt]]
   [:cache_ttl               {:optional true} [:maybe ms/PositiveInt]]
   [:auto_apply_filters      {:optional true} [:maybe :boolean]]
   [:dashcards               {:optional true} [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardCard] :id)]]
   [:tabs                    {:optional true} [:maybe (ms/maps-with-unique-key [:sequential UpdatedDashboardTab] :id)]]])

;;; ---------------------------------------------------- Copying -------------------------------------------------------

(mu/defn- cards-to-copy :- [:map
                            [:discard [:sequential :any]]
                            [:copy [:map-of ms/PositiveInt :any]]
                            [:reference [:map-of ms/PositiveInt :any]]]
  "Returns a map of which cards we need to copy, which cards we need to reference, and which are not to be copied. The
  `:copy` and `:reference` keys are maps from id to card. The `:discard` key is a vector of cards left out because
  the caller cannot read them (or their series' base card), or because they are archived; a card discarded for
  unreadability is reduced to `{:id id}`.

  If we're making a deep copy, we copy all cards that we have necessary permissions on. Otherwise, we copy Dashboard
  Questions (questions stored 'in' the dashboard rather than a collection) and reference the rest (assuming
  permissions)."
  [deep-copy? :- ms/MaybeBooleanValue
   dashcards :- [:sequential :metabase.dashboards.schema/dashboard-card]]
  (let [card->cards (fn [{:keys [card series]}] (into [card] series))
        readable-ids (into #{} (map :id) (mi/readable (into [] (comp (mapcat card->cards) (filter mi/model)) dashcards)))
        readable? (fn [card] (and (mi/model card) (contains? readable-ids (:id card))))
        card->decision (fn [parent-card card]
                         (cond
                           (or
                            (not (readable? parent-card))
                            (not (readable? card))
                            (:archived card))
                           :discard

                           (or (:dashboard_id card)
                               (and deep-copy? (not= :model (:type card))))
                           :copy

                           :else :reference))
        ;; `:discard` rides out on the copy response as `:uncopied`, so a card kept out because the
        ;; caller cannot read it must not be returned in full.
        redact (fn [card] (if (readable? card) card (select-keys card [:id])))
        split-cards (fn [{:keys [card] :as db-card}]
                      (let [cards (card->cards db-card)]
                        (-> (group-by (partial card->decision card) cards)
                            (m/update-existing :discard #(mapv redact %)))))]
    (reduce (fn [acc db-card]
              (let [{:keys [discard copy reference]} (split-cards db-card)]
                (-> acc
                    (update :reference merge (m/index-by :id reference))
                    (update :copy merge (m/index-by :id copy))
                    (update :discard concat discard))))
            {:reference {}
             :copy {}
             :discard []}
            (filter :card_id dashcards))))

(defn- maybe-duplicate-cards
  "Takes the `decisions` of [[cards-to-copy]], and duplicates the cards both on the dashboard's cards and dashcardseries
  as necessary, the Dashboard Questions of the new Dashboard `new-dashboard`, which has to exist for them.

  Returns `{:copied {old-card-id duplicated-card} :referenced {old-card-id card} :discarded [card]}` so that the new
  dashboard can adjust accordingly. `:discarded` carries [[cards-to-copy]]'s redaction."
  [decisions new-dashboard old-dashboard dest-coll-id]
  (let [same-collection?                 (= (:collection_id old-dashboard) dest-coll-id)
        {:keys [copy discard reference]} decisions
        entries                          (vec (for [[id to-copy] copy]
                                                {:id     id
                                                 :source to-copy
                                                 :card   (assoc to-copy :collection_id dest-coll-id)}))]
    (when-not (queries.card/can-create-all? (mapv (juxt :card :source) entries))
      (doseq [{:keys [source card]} entries]
        (queries/with-copy-source-card source
          (api/create-check :model/Card card)))
      (api/check-403 false))
    (let [rows   (mapv (fn [{:keys [source card]}]
                         (queries.card/new-card-row
                          (cond-> card
                            same-collection?            (update :name #(str % " - " (tru "Duplicate")))
                            (:dashboard_id source)      (assoc :dashboard_id (u/the-id new-dashboard)))
                          api/*current-user-id*))
                       entries)
          copies (when (seq rows)
                   (t2/with-transaction [_conn]
                     (run! #(collection/maybe-reconcile-collection-position! (select-keys % [:collection_id :collection_position])) rows)
                     (queries.card/create-cards! rows)))]
      {:copied     (zipmap (map :id entries) copies)
       :discarded  discard
       :referenced reference})))

(defn- update-colvalmap-setting
  "Visualizer dashcards have unique visualization settings which embed column id remapping metadata
  This function iterates through the `:columnValueMapping` viz setting and updates referenced card ids

  col->val-source can look like:
  {:COLUMN_2 [{:sourceId 'card:<OLD_CARD_ID>', :originalName 'sum', :name 'COLUMN_2'}], ...}"
  [col->val-source id->new-card]
  (let [update-cvm-item (fn [item]
                          (if-let [source-id (:sourceId item)]
                            (if-let [[_ card-id] (and (string? source-id)
                                                      (re-find #"^card:(\d+)$" source-id))]
                              (if-let [new-card (get id->new-card (Long/parseLong card-id))]
                                (assoc item :sourceId (str "card:" (:id new-card)))
                                item)
                              item)
                            item))
        update-cvm      (fn [cvm]
                          (when (map? cvm)
                            (update-vals cvm #(mapv update-cvm-item %))))]
    (update-cvm col->val-source)))

(defn update-cards-for-copy
  "Update dashcards in a dashboard for copying.
  If the dashboard has tabs, fix up the tab ids in dashcards to point to the new tabs.
  Then if shallow copy, return the cards. If deep copy, replace ids with id from the newly-copied cards.
  A dashcard whose card was neither copied nor referenced is omitted — [[cards-to-copy]] discarded it as unreadable
  or archived."
  [dashcards id->new-card id->referenced-card id->new-tab-id]
  (let [dashcards (if (seq id->new-tab-id)
                    (map #(assoc % :dashboard_tab_id (id->new-tab-id (:dashboard_tab_id %)))
                         dashcards)
                    dashcards)]
    (keep (fn [dashboard-card]
            (cond
              (:action_id dashboard-card)
              nil

              (some-> dashboard-card :visualization_settings :virtual_card :display #{"iframe"})
              dashboard-card

              ;; text cards need no manipulation
              (some-> dashboard-card :visualization_settings :virtual_card :display #{"text" "heading"})
              dashboard-card

              ;; referenced cards need no manipulation
              (get id->referenced-card (:card_id dashboard-card))
              dashboard-card

              ;; if we didn't duplicate, it doesn't go in the dashboard
              (not (get id->new-card (:card_id dashboard-card)))
              nil

              :else
              (let [new-id (fn [id]
                             (-> id id->new-card :id))]
                (-> dashboard-card
                    (update :card_id new-id)
                    (assoc :card (-> dashboard-card :card_id id->new-card))
                    (m/update-existing :parameter_mappings
                                       (fn [pms]
                                         (keep (fn [pm]
                                                 (m/update-existing pm :card_id new-id))
                                               pms)))
                    (m/update-existing :series
                                       (fn [series]
                                         (keep (fn [card]
                                                 (when-let [id' (new-id (:id card))]
                                                   (assoc card :id id')))
                                               series)))
                    (m/update-existing-in [:visualization_settings :visualization :columnValuesMapping]
                                          update-colvalmap-setting id->new-card)))))
          dashcards)))

(defn contains-dashboard-questions?
  "Does the dashboard with `id` hold any live questions saved inside it? Such a dashboard cannot be
  shallow-copied — the questions would have nowhere to live."
  [id]
  (dashboards.db/dashboard-question-exists? id))

(defn copy-dashboard!
  "Copy the dashboard with `from-dashboard-id` into `:collection_id` (nil = root) and return the saved
  row, carrying `:uncopied` when permissions kept some cards out of the copy. `copy-opts` may override
  `:name`/`:description` and set `:collection_position`; `:is_deep_copy` also duplicates the dashboard's
  questions, which is mandatory when it holds Dashboard Questions.

  Requires read permission on the source and create permission on the destination collection."
  [from-dashboard-id {:keys [name description collection_id collection_position is_deep_copy]}]
  ;; if we're trying to save the new dashboard in a Collection make sure we have permissions to do that
  (api/create-check :model/Dashboard {:name name, :description description, :collection_id collection_id
                                      :collection_position collection_position})
  (api/check-400 (not (and (not is_deep_copy)
                           (contains-dashboard-questions? from-dashboard-id)))
                 (tru "You cannot do a shallow copy of this dashboard because it contains Dashboard Questions."))
  (let [existing-dashboard (-> (api/read-check :model/Dashboard from-dashboard-id)
                               (t2/hydrate [:dashcards :card :series] :tabs))
        dashboard-data {:name                (or name (:name existing-dashboard))
                        :description         (or description (:description existing-dashboard))
                        :parameters          (or (:parameters existing-dashboard) [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position
                        :width               (:width existing-dashboard)}
        dashboard      (t2/with-transaction [_conn]
                         ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                         ;; collection to change position, check that and fix up if needed
                         (collection/maybe-reconcile-collection-position! (select-keys dashboard-data [:collection_id :collection_position]))
                         ;; Ok, now save the Dashboard
                         (let [decisions     (cards-to-copy is_deep_copy (:dashcards existing-dashboard))
                               questions?    (boolean (some :dashboard_id (vals (:copy decisions))))
                               [created]     (when questions? (dashboard/create-dashboards! [dashboard-data]))
                               {id->new-card :copied
                                id->referenced-card :referenced
                                uncopied :discarded}
                               (maybe-duplicate-cards decisions created existing-dashboard collection_id)
                               tabs          (mapv #(select-keys % [:id :name :position]) (:tabs existing-dashboard))
                               dashcards     (into []
                                                   (map #(update % :series (fn [series] (into [] (comp (remove nil?) (map u/the-id)) series))))
                                                   (update-cards-for-copy (:dashcards existing-dashboard)
                                                                          id->new-card
                                                                          id->referenced-card
                                                                          (zipmap (map :id tabs) (map :id tabs))))
                               parts         (cond-> {} (seq tabs) (assoc :tabs tabs) (seq dashcards) (assoc :dashcards dashcards))
                               dash          (if questions?
                                               (do (when (seq parts)
                                                     (dashboard/update-dashboard! (:id created) parts))
                                                   created)
                                               (first (dashboard/create-dashboards! [(merge dashboard-data parts)])))]
                           (when (seq dashcards)
                             (update-on-demand-field-values-of-new-dashboard! (:id dash)))
                           (cond-> dash
                             (seq uncopied)
                             (assoc :uncopied uncopied))))]
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dashboard)})
    dashboard))
