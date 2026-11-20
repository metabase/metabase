(ns metabase.dashboards.write
  "Every user-facing write of a Dashboard and of its dashcards and tabs, used by the REST API, MCP's tools, the Metabot
  toolkit, the Agent API and the revert of a revision.

  The functions that create, update and copy a Dashboard check permissions and return the saved row; response-shaping
  concerns such as hydration and `:last-edit-info` belong to the callers."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.embedding :as dashboards.embedding]
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
   [:auto_apply_filters  {:optional true} [:maybe :boolean]]])

(mu/defn create-dashboard! :- :map
  "Creates a Dashboard owned by the current user after its create check, calls `:in-transaction`, when given, with the
  inserted row inside the creating transaction and returns the row."
  ([attrs :- NewDashboard]
   (create-dashboard! attrs nil))
  ([{:keys [name description parameters cache_ttl collection_id collection_position
            width auto_apply_filters]} :- NewDashboard
    {:keys [in-transaction]}           :- [:maybe [:map {:closed true} [:in-transaction {:optional true} ifn?]]]]
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
         dash           (events/with-batched-events (t2/with-transaction [_conn]
                                                      ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                                                      ;; collection to change position, check that and fix up if needed
                                                      (api/maybe-reconcile-collection-position! (select-keys dashboard-data [:collection_id :collection_position]))
                                                      ;; Ok, now save the Dashboard
                                                      (let [dash (dashboards.db/insert-dashboard! dashboard-data)]
                                                        (when in-transaction
                                                          (in-transaction dash))
                                                        dash)))]
     (analytics/track-event! :snowplow/dashboard
                             {:event        :dashboard-created
                              :dashboard-id (u/the-id dash)})
     dash)))

(defn- check-embedding-enabled
  "Throws a 400 unless embedding is enabled, when `dash-updates` change the embedding of `dash-before-update`."
  [dash-before-update dash-updates]
  (when (dashboards.embedding/changes-embedding? dash-before-update dash-updates)
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

;;; ------------------------------------------------ Dashcards and tabs ------------------------------------------------

(defn update-dashboard-cards-series!
  "Batch update the DashboardCardSeries for multiple DashboardCards.
  Each `card-ids` list should be a definitive collection of *all* IDs of cards for the dashboard card in the desired order.

  *  If an ID in `card-ids` has no corresponding existing DashboardCardSeries object, one will be created.
  *  If an existing DashboardCardSeries has no corresponding ID in `card-ids`, it will be deleted.
  *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  {:arglists '([dashcard-id->card-ids])}
  [dashcard-id->card-ids]
  (when (seq dashcard-id->card-ids)
    (dashboards.db/delete-series-for-dashcards! (keys dashcard-id->card-ids))
    (when-let [card-series (seq (for [[dashcard-id card-ids] dashcard-id->card-ids
                                      [i card-id]            (map-indexed vector card-ids)]
                                  {:dashboardcard_id dashcard-id, :card_id card-id, :position i}))]
      (dashboards.db/insert-dashcard-series! card-series))))

(def ^:private DashboardCardUpdates
  [:merge
   ::dashboards.schema/dashboard-card.update
   [:map {:closed true}
    [:id                     ms/PositiveInt]
    [:series {:optional true} [:maybe [:sequential ms/PositiveInt]]]
    [:card   {:optional true} [:maybe ::queries.schema/card]]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]]])

(defn- shallow-updates
  "Returns the keys in `new` that have different values than the corresponding keys in `old`"
  [new old]
  (into {}
        (filter (fn [[k v]]
                  (not= v (get old k)))
                new)))

(defn- check-cards-not-in-documents
  "Throws a 400 when one of the Cards with `card-ids` belongs to a Document, reading them in one query."
  [card-ids]
  (when-let [document-cards (some-> (seq card-ids) dashboards.db/document-cards-among seq)]
    (throw (ex-info "Cards with 'document_id' cannot be added to dashboards"
                    {:status-code        400
                     :in-report-card-ids (map :id document-cards)}))))

(mu/defn update-dashboard-cards!
  "Update existing DashboardCards, each given as a `[dashboard-card old-dashboard-card]` pair with `old-dashboard-card`
  sparing a DB call when nothing changed, rewriting their DashboardCardSeries in one statement for all of them, and
  returning nil."
  [pairs :- [:sequential [:tuple DashboardCardUpdates DashboardCardUpdates]]]
  (t2/with-transaction [_conn]
    (check-cards-not-in-documents (for [[dashboard-card old-dashboard-card] pairs
                                        :let  [card-id (:card_id dashboard-card)]
                                        :when (and card-id (not= card-id (:card_id old-dashboard-card)))]
                                    card-id))
    (let [update-ks [:action_id :card_id :row :col :size_x :size_y
                     :parameter_mappings :visualization_settings :dashboard_tab_id :inline_parameters]]
      (doseq [[dashboard-card old-dashboard-card] pairs
              :let [updates (shallow-updates (select-keys dashboard-card update-ks)
                                             (select-keys old-dashboard-card update-ks))]
              :when (seq updates)]
        (dashboards.db/update-dashcard! (:id dashboard-card) updates))
      (update-dashboard-cards-series!
       (into {}
             (keep (fn [[{dashcard-id :id :keys [series] :as dashboard-card} old-dashboard-card]]
                     (when (not= (:series dashboard-card []) (:series old-dashboard-card []))
                       [dashcard-id series])))
             pairs))
      nil)))

(mu/defn update-dashboard-card!
  "Updates an existing DashboardCard including all DashboardCardSeries.
   `old-dashboard-card` is provided to avoid an extra DB call if there are no changes.
   Returns nil."
  [dashboard-card     :- DashboardCardUpdates
   old-dashboard-card :- DashboardCardUpdates]
  (update-dashboard-cards! [[dashboard-card old-dashboard-card]]))

(def ^:private NewDashboardCard
  [:merge
   ::dashboards.schema/dashboard-card.update
   [:map {:closed true}
    [:dashboard_id                ms/PositiveInt]
    [:id                          {:optional true} [:maybe ms/Int]]
    [:card                        {:optional true} [:maybe [:ref ::queries.schema/card]]]
    [:collection_authority_level  {:optional true} [:maybe [:or :keyword :string]]]
    [:series                      {:optional true} [:maybe [:sequential ms/PositiveInt]]]]])

(mu/defn create-dashboard-cards!
  "Create a new DashboardCard by inserting it into the database along with all associated pieces of data such as
  DashboardCardSeries. Returns the newly created DashboardCard or throws an Exception."
  [dashboard-cards :- [:sequential NewDashboardCard]]
  (when (seq dashboard-cards)
    (t2/with-transaction [_conn]
      (check-cards-not-in-documents (keep :card_id dashboard-cards))
      (let [dashboard-card-ids (dashboards.db/insert-dashcards!
                                (for [dashcard dashboard-cards]
                                  (dissoc dashcard :id :created_at :updated_at :entity_id :series :card :collection_authority_level)))]
        (update-dashboard-cards-series! (zipmap dashboard-card-ids (map #(get % :series []) dashboard-cards)))
        (-> (dashboards.db/dashcards-by-ids dashboard-card-ids)
            (t2/hydrate :series))))))

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
              cleaned-params (filterv #(not (contains? orphaned-param-ids (:id %)))
                                      current-params)]
          (when (not= (count current-params) (count cleaned-params))
            (dashboards.db/update-dashboard! dashboard-id {:parameters cleaned-params})
            (count orphaned-param-ids)))))))

(defn delete-dashboard-cards!
  "Delete DashboardCards of a Dashboard. Automatically cleans up orphaned inline parameters."
  [dashboard-card-ids]
  {:pre [(coll? dashboard-card-ids)]}
  (t2/with-transaction [_conn]
    (cleanup-orphaned-inline-parameters! dashboard-card-ids)
    (dashboards.db/delete-pulse-cards-for-dashcards! dashboard-card-ids)
    (dashboards.db/delete-dashcards! dashboard-card-ids)))

(defn- set-questions-archived!
  "Sets `archived` of the Cards with `card-ids` to `archived?` when the current user may, else throws a 403."
  [card-ids archived?]
  (api/check-403 (mi/can-update-each? :model/Card (dashboards.db/cards-to-set-archived card-ids archived?) {:archived archived?}))
  (dashboards.db/set-cards-archived! card-ids archived?))

(defn archive-or-unarchive-internal-dashboard-questions!
  "When updating dashboard cards, if we're removing all references to a Dashboard Question (which is internal to the
  dashboard, not displayed as part of a collection) we want to archive it. Similarly, we want to mark any Dashboard
  Questions that *are* on the Dashboard as *not* archived. This function takes a dashboard and the set of dashcards
  about to be saved, and ensures that all DQs that appear on the dashboard are unarchived and all DQs that DON'T
  appear on the dashboard are archived."
  [dashboard-id new-cards]
  (let [internal-dashboard-question-ids (dashboards.db/internal-dashboard-question-ids dashboard-id)
        used-card-ids (into #{} (map :card_id new-cards))
        internal-dashboard-questions-to-archive (set/difference internal-dashboard-question-ids used-card-ids)
        internal-dashboard-questions-to-unarchive (set/intersection internal-dashboard-question-ids used-card-ids)]
    (when-let [ids (seq internal-dashboard-questions-to-archive)]
      (set-questions-archived! (vec ids) true))
    (when-let [ids (seq internal-dashboard-questions-to-unarchive)]
      (set-questions-archived! (vec ids) false))))

(mu/defn- update-tabs! :- nil?
  "Updates tabs of a dashboard if changed."
  [current-tabs :- [:sequential ::dashboards.schema/dashboard-tab]
   new-tabs     :- [:sequential ::dashboards.schema/dashboard-tab]]
  (let [update-ks       [:name :position]
        id->current-tab (m/index-by :id current-tabs)
        to-update-tabs  (filter
                         (fn [new-tab]
                           (let [current-tab (get id->current-tab (:id new-tab))]
                             (not= (select-keys current-tab update-ks)
                                   (select-keys new-tab update-ks))))
                         new-tabs)]
    (doseq [tab to-update-tabs]
      (dashboards.db/update-dashboard-tab! (:id tab) (select-keys tab update-ks)))
    nil))

(defn do-update-tabs!
  "Given current tabs and new tabs, do the necessary create/update/delete to apply new tab changes.
  Returns:
  - `old->new-tab-id`: a map from tab IDs in `new-tabs` to newly created tab IDs
  - `created-tab-ids`
  - `updated-tab-ids`
  - `deleted-tab-ids`
  - `total-num-tabs`: the total number of active tabs after the operation."
  [dashboard-id current-tabs new-tabs]
  (let [{:keys [to-create
                to-update
                to-delete]} (u/row-diff current-tabs new-tabs)
        to-delete-ids       (map :id to-delete)
        _                   (when-let [to-delete-ids (seq to-delete-ids)]
                              (dashboards.db/delete-dashboard-tabs! to-delete-ids))
        old->new-tab-id     (when (seq to-create)
                              (let [new-tab-ids (dashboards.db/insert-dashboard-tabs!
                                                 (->> to-create
                                                      (map #(dissoc % :id))
                                                      (map #(assoc % :dashboard_id dashboard-id))))]
                                (zipmap (map :id to-create) new-tab-ids)))]
    (when (seq to-update)
      (update-tabs! current-tabs to-update))
    {:old->new-tab-id old->new-tab-id
     :created-tab-ids (vals old->new-tab-id)
     :deleted-tab-ids to-delete-ids
     :total-num-tabs  (reduce + (map count [to-create to-update]))}))

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
    (u/prog1 (events/with-batched-events (create-dashboard-cards! dashboard-cards))
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
    (when (seq only-new)
      (throw (ex-info (tru "Dashboard {0} does not have a DashboardCard with ID {1}"
                           (u/the-id dashboard) (first only-new))
                      {:status-code 404})))
    (events/with-batched-events
      (update-dashboard-cards!
       (for [dashcard new-dashcards]
         [(update dashcard :series #(map :id %))
          (-> (get id->old-dashcard (:id dashcard))
              (update :series #(map :id %)))])))
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
          {:keys [old->new-tab-id]} (do-update-tabs! (:id dashboard) nil tabs)
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

(defn- create-dashcards!
  [dashboard dashcards]
  (doseq [card-id (into #{} (comp (mapcat dashcard-card-ids) (filter pos-int?)) dashcards)]
    (api/check-not-archived (dashboards.db/card card-id)))
  (check-parameter-mapping-permissions (for [{:keys [card_id parameter_mappings]} dashcards
                                             mapping parameter_mappings]
                                         (assoc mapping :card-id card_id)))
  (api/check-500 (add-dashcards! dashboard dashcards)))

(defn- check-and-update-dashcards! [dashboard dashcards]
  (check-updated-parameter-mapping-permissions (:id dashboard) dashcards)
  (update-dashcards! dashboard (map dashboard-card/from-parsed-json dashcards))
  dashcards)

(defn- delete-dashcards! [dashcard-ids]
  (let [dashboard-cards (dashboards.db/dashcards-by-ids dashcard-ids)]
    (delete-dashboard-cards! dashcard-ids)
    dashboard-cards))

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

(defn- do-update-dashcards!
  [dashboard current-cards new-cards]
  (let [{:keys [to-create to-update to-delete]} (u/row-diff current-cards new-cards)]
    ;; Grandfather against the dashboard as it was before this update, as REST does: a card that already showed
    ;; its events keeps them even if its tab is deleted and it is re-added elsewhere in the same request.
    (queries/check-newly-exposed-dashcards-timeline-permissions!
     dashboard (:dashcards dashboard) (concat to-create to-update))
    (archive-or-unarchive-internal-dashboard-questions! (:id dashboard) new-cards)
    ;; Check both created and updated dashcards: a "Replace" keeps the dashcard id and only swaps
    ;; card_id, so it lands in `to-update`, not `to-create` (UXW-4731). Card ids the dashboard already
    ;; references are grandfathered, so pre-existing foreign internal cards don't block saving (UXW-4870).
    (assert-dashcards-are-not-internal-to-other-dashboards dashboard (concat to-create to-update))
    (when (seq to-update)
      (check-and-update-dashcards! dashboard to-update))
    {:deleted-dashcards (when (seq to-delete)
                          (delete-dashcards! (map :id to-delete)))
     :created-dashcards (when (seq to-create)
                          (create-dashcards! dashboard to-create))}))

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
   ;; tab order -- [[do-update-tabs!]] writes it alongside `:name`
   [:position {:optional true} ::dashboards.schema/dashboard-tab.position]])

(defn- track-dashcard-and-tab-events!
  [{dashboard-id :id}
   {:keys [created-dashcards
           created-tab-ids deleted-tab-ids total-num-tabs]}]
  ;; Dashcard events
  (when (seq created-dashcards)
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
          changes-stats                      (atom nil)
          archived                           (atom nil)
          ;; tabs are always sent in production as well when dashcards are updated, but there are lots of
          ;; tests that exclude it. so this only checks for dashcards
          update-dashcards-and-tabs?         (contains? dash-updates :dashcards)
          dash-updates                       (api/updates-without-collection-when-archiving current-dash dash-updates)]
      (api/update-check current-dash dash-updates)
      (check-embedding-enabled current-dash dash-updates)
      (api/check-500
       (do
         (events/with-batched-events (t2/with-transaction [_conn]
                                       ;; If the dashboard has an updated position, or if the dashboard is moving to a new collection, we might need to
                                       ;; adjust the collection position of other dashboards in the collection
                                       (api/maybe-reconcile-collection-position! (select-keys current-dash [:collection_id :collection_position]) (select-keys dash-updates [:collection_id :collection_position]))
                                       (when-let [updates (not-empty
                                                           (u/select-keys-when
                                                            dash-updates
                                                            :present #{:description :position :width :collection_id :collection_position :cache_ttl :embedding_type}
                                                            :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started :enable_embedding
                                                                       :embedding_params :archived :auto_apply_filters}))]
                                         (dashboards.db/update-dashboard! id updates)
                                         (when (some? (:collection_id updates))
                                           (events/publish-event! :event/collection-touch {:collection-id (:collection_id updates) :user-id api/*current-user-id*}))
                                         ;; Handle broken subscriptions, if any, when parameters changed
                                         (when parameters
                                           (reset! archived (pulse.broken-subscriptions/handle-broken-subscriptions!
                                                             id original-params))))
                                       (when update-dashcards-and-tabs?
                                         (when (not (false? (:archived dash-updates)))
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
                                                :as   tabs-changes-stats}                (do-update-tabs! (:id current-dash) current-tabs new-tabs)
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
                                                    (select-keys dashcards-changes-stats [:created-dashcards :deleted-dashcards])))))))
         true))
      (let [dashboard (dashboards.db/dashboard id)]
        (track-dashcard-and-tab-events! dashboard @changes-stats)
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
   redact?   :- :boolean
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
                            (cond-> redact? (m/update-existing :discard #(mapv redact %))))))]
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
  "Takes a dashboard id, and duplicates the cards both on the dashboard's cards and dashcardseries as necessary.

  Returns `{:copied {old-card-id duplicated-card} :referenced {old-card-id card} :discarded [card]}` so that the new
  dashboard can adjust accordingly. `:discarded` carries [[cards-to-copy]]'s redaction.

  If `deep-copy?` is `false`, doesn't copy any cards *except* for Dashboard Questions, which must be copied."
  [deep-copy? authorize-card-copies? redact-uncopied? new-dashboard old-dashboard dest-coll-id]
  (let [same-collection?                 (= (:collection_id old-dashboard) dest-coll-id)
        {:keys [copy discard reference]} (cards-to-copy deep-copy? redact-uncopied? (:dashcards old-dashboard))]
    {:copied     (into {} (for [[id to-copy] copy]
                            [id (queries/with-copy-source-card to-copy
                                  (when authorize-card-copies?
                                    (api/create-check :model/Card (assoc to-copy :collection_id dest-coll-id)))
                                  (queries/create-card!
                                   (cond-> to-copy
                                     true                    (assoc :collection_id dest-coll-id)
                                     same-collection?        (update :name #(str % " - " (tru "Duplicate")))
                                     (:dashboard_id to-copy) (assoc :dashboard_id (u/the-id new-dashboard)))
                                   @api/*current-user*
                                   false))]))
     :discarded  discard
     :referenced reference}))

(defn- duplicate-tabs
  [new-dashboard existing-tabs]
  (let [new-tab-ids (dashboards.db/insert-dashboard-tabs!
                     (for [tab existing-tabs]
                       (-> tab
                           (assoc :dashboard_id (:id new-dashboard))
                           (dissoc :id :entity_id :created_at :updated_at))))]
    (zipmap (map :id existing-tabs) new-tab-ids)))

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

(def ^:private CopyOptions
  [:maybe [:map {:closed true}
           [:name                    {:optional true} [:maybe :string]]
           [:description             {:optional true} [:maybe :string]]
           [:collection_id           {:optional true} [:maybe ms/PositiveInt]]
           [:collection_position     {:optional true} [:maybe ms/PositiveInt]]
           [:is_deep_copy            {:optional true} [:maybe :boolean]]
           [:load-source             {:optional true} ifn?]
           [:authorize-card-copies?  {:optional true} :boolean]
           [:redact-uncopied?        {:optional true} :boolean]]])

(mu/defn copy-dashboard!
  "Copy the dashboard with `from-dashboard-id` into `:collection_id` (nil = root) and return the saved
  row, carrying `:uncopied` when permissions kept some cards out of the copy. `copy-opts` may override
  `:name`/`:description` and set `:collection_position`; `:is_deep_copy` also duplicates the dashboard's
  questions, which is mandatory when it holds Dashboard Questions. `:load-source` is a function of no arguments that
  returns the hydrated source dashboard, by default its read-checked row, and `:authorize-card-copies?` asks for the
  create permission of every copied card; `:redact-uncopied?` reduces an uncopied card the caller cannot read to its id.

  Requires read permission on the source and create permission on the destination collection."
  [from-dashboard-id :- ms/PositiveInt
   {:keys [name description collection_id collection_position is_deep_copy load-source authorize-card-copies? redact-uncopied?]} :- CopyOptions]
  (api/create-check :model/Dashboard {:name name, :description description, :collection_id collection_id
                                      :collection_position collection_position})
  (api/check-400 (not (and (false? is_deep_copy)
                           (contains-dashboard-questions? from-dashboard-id)))
                 (tru "You cannot do a shallow copy of this dashboard because it contains Dashboard Questions."))
  (let [existing-dashboard (if load-source
                             (load-source)
                             (-> (api/read-check :model/Dashboard from-dashboard-id)
                                 (t2/hydrate [:dashcards :card :series] :tabs)))
        dashboard-data {:name                (or name (:name existing-dashboard))
                        :description         (or description (:description existing-dashboard))
                        :parameters          (or (:parameters existing-dashboard) [])
                        :creator_id          api/*current-user-id*
                        :collection_id       collection_id
                        :collection_position collection_position
                        :width               (:width existing-dashboard)}
        dashboard      (events/with-batched-events (t2/with-transaction [_conn]
                                                     (api/maybe-reconcile-collection-position! (select-keys dashboard-data [:collection_id :collection_position]))
                                                     (let [dash (dashboards.db/insert-dashboard! dashboard-data)
                                                           {id->new-card :copied
                                                            id->referenced-card :referenced
                                                            uncopied :discarded}
                                                           (maybe-duplicate-cards is_deep_copy (boolean authorize-card-copies?) (boolean redact-uncopied?) dash existing-dashboard collection_id)

                                                           id->new-tab-id (when-let [existing-tabs (seq (:tabs existing-dashboard))]
                                                                            (duplicate-tabs dash existing-tabs))]
                                                       (when-let [dashcards (seq (update-cards-for-copy (:dashcards existing-dashboard)
                                                                                                        id->new-card
                                                                                                        id->referenced-card
                                                                                                        id->new-tab-id))]
                                                         (api/check-500 (add-dashcards! dash dashcards)))
                                                       (cond-> dash
                                                         (seq uncopied)
                                                         (assoc :uncopied uncopied)))))]
    (analytics/track-event! :snowplow/dashboard
                            {:event        :dashboard-created
                             :dashboard-id (u/the-id dashboard)})
    dashboard))
