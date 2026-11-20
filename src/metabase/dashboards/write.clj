(ns metabase.dashboards.write
  "Permission-checked create/update operations for Dashboards, used by the REST API, MCP's tools, the Metabot toolkit
  and the Agent API, and the write functions of Dashboards, DashboardCards, DashboardTabs and DashboardCardSeries
  through which every writer of them goes.

  The request functions return the saved Dashboard row; response-shaping concerns such as hydration and
  `:last-edit-info` belong to the callers."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.cache.core :as cache]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]
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
   [metabase.public-sharing.core :as public-sharing]
   [metabase.pulse.broken-subscriptions :as pulse.broken-subscriptions]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Model write functions -----------------------------------------------

(def non-timestamped-columns
  "The columns of a Dashboard whose change alone leaves its `updated_at` as it is."
  #{:last_viewed_at})

(defn- changed
  "The columns of `changes` whose values differ from those of `row`."
  [row changes]
  (into {} (remove (fn [[k v]] (= v (get row k)))) changes))

(defn- with-updated-at
  "`changes` with the time of the update, unless it gives one or changes only the `non-timestamped` columns."
  [changes non-timestamped]
  (cond-> changes
    (and (not (contains? changes :updated_at))
         (seq (set/difference (set (keys changes)) non-timestamped)))
    (assoc :updated_at (mi/now))))

(defn- event-context
  "The keys of `opts` that the events of a write carry."
  [opts]
  (select-keys opts [:revision-message :archived-with]))

(defn- clean-row-or-select
  "`row-or-id` when it is a row the caller loaded, else the row with that id, selected by `select`."
  [row-or-id select]
  (if (map? row-or-id) row-or-id (select row-or-id)))

(defn changes-embedding?
  "Whether `changes` change the embedding of `dashboard`."
  [dashboard changes]
  (boolean (some #(api/column-will-change? (get dashboard %) (get changes % ::api/not-provided))
                 [:enable_embedding :embedding_type :embedding_params])))

(defn check-dashcard-tab
  "Throws a 400 unless the tab of `dashcard`, if any, belongs to the Dashboard of the dashcard."
  [{:keys [dashboard_id dashboard_tab_id]}]
  (when (and dashboard_tab_id
             (not= dashboard_id (:dashboard_id (dashboards.db/dashboard-tab dashboard_tab_id))))
    (throw (ex-info (tru "The tab of a dashboard card must belong to its dashboard.") {:status-code 400}))))

(defn- validate-link-card-entity-id
  "Require the link-card entity id to be an integer before it is stored. It is used as an id when the linked
  entity is looked up on read, so validating on write keeps a malformed value from being persisted."
  [dashcard]
  (when-let [id (get-in dashcard [:visualization_settings :link :entity :id])]
    (dashboards.db/ensure-integer-link-card-id id))
  dashcard)

(defn- validate-click-behavior-target-ids
  "Require click-behavior target ids to be integers before they are stored. They are later used as entity ids
  (e.g. by the dependency backfill), so validating on write keeps a malformed value from being persisted."
  [dashcard]
  (let [viz (:visualization_settings dashcard)]
    (doseq [cb (cons (:click_behavior viz)
                     (map (comp :click_behavior val) (:column_settings viz)))
            :let [id (:targetId cb)]
            :when (some? id)]
      (when-not (integer? id)
        (throw (ex-info "Click behavior target id must be an integer"
                        {:status-code 400, :id id})))))
  dashcard)

(defn validate-dashcard-on-write
  "Throws unless the link and the click behaviors of `dashcard` name entities by integer ids."
  [dashcard]
  (-> dashcard
      validate-link-card-entity-id
      validate-click-behavior-target-ids))

;;; ------------------------------------------------------ Questions -----------------------------------------------

(defn- write-questions!
  "Apply `changes` to `questions`, Cards internal to a Dashboard, through the write function of Cards when they have one,
  else by calling `fallback`, a thunk."
  [questions changes opts fallback]
  (if-let [update! (:update! (mi/write-fns :model/Card))]
    (run! #(update! % changes opts) questions)
    (fallback)))

(defn- carry-questions!
  "Archive, when `archived?`, or restore the Cards internal to the Dashboard with `dashboard-id` that the change takes
  along, the writes carrying the Dashboard's `:archived-with`."
  [dashboard-id archived?]
  (let [carrier   [:model/Dashboard dashboard-id]
        questions (if archived?
                    (dashboards.db/questions-archived-with-dashboard dashboard-id)
                    (dashboards.db/questions-restored-with-dashboard dashboard-id))]
    (events/with-event-context {:archived-with carrier}
      (write-questions! questions {:archived archived?} {:archived-with carrier}
                        #(if archived?
                           (dashboards.db/archive-dashboard-questions! dashboard-id)
                           (dashboards.db/unarchive-dashboard-questions! dashboard-id))))))

(defn- move-questions!
  "Move the Cards internal to the Dashboard with `dashboard-id` to the Collection with `collection-id`."
  [dashboard-id collection-id]
  (write-questions! (dashboards.db/dashboard-questions dashboard-id) {:collection_id collection-id} {}
                    #(dashboards.db/move-dashboard-questions! dashboard-id collection-id)))

;;; ------------------------------------------------------ Dashboards ----------------------------------------------

(mu/defn insert-dashboard! :- :map
  "Insert the Dashboard `row` and publish its create event, returning the inserted Dashboard; for the REST API's copy."
  [row :- ::dashboards.schema/dashboard.update]
  (events/with-batched-events
    (dashboards.db/insert-dashboard! row)))

(defn- dashboard-changes
  "The columns of `dashboard`, a Dashboard as selected, that `changes` change with those they derive, after the checks of
  an update of a Dashboard, or nil when `changes` change none."
  [dashboard changes]
  (when-let [changes (not-empty (changed dashboard changes))]
    (let [normalized (lib/normalize ::dashboards.schema/dashboard changes)
          new-row    (lib/normalize ::dashboards.schema/dashboard (merge dashboard changes))]
      (when (contains? normalized :collection_id)
        (collection/check-collection-for :model/Dashboard new-row))
      (params/assert-valid-parameters new-row)
      (let [new-row (cond-> new-row
                      (contains? normalized :archived)
                      (assoc :archived_directly (if (contains? normalized :archived_directly)
                                                  (:archived_directly new-row)
                                                  (boolean (and (:archived new-row)
                                                                (not (collection/archived? (:collection_id new-row)))))))

                      true
                      maybe-populate-initially-published-at

                      (contains? normalized :public_uuid)
                      public-sharing/add-public-uuid-prefix)]
        (with-updated-at (changed dashboard new-row) non-timestamped-columns)))))

(defn- write-dashboard-changes!
  "Apply the `plans`, `[dashboard changes]` pairs, moving each Dashboard's questions, keeping its parameter cards,
  updating those with the same changes in one statement, publishing their update events and archiving or restoring their
  questions, returning the number of Dashboards updated."
  [plans opts]
  (events/with-event-context (event-context opts)
    (events/with-batched-events
      (doseq [[{:keys [id]} changes] plans]
        (when (contains? changes :collection_id)
          (move-questions! id (:collection_id changes)))
        (when (:parameters changes)
          (queries/upsert-or-delete-parameter-cards-from-parameters! "dashboard" id (:parameters changes))))
      (let [n (reduce + 0 (for [[changes group] (group-by second plans)]
                            (dashboards.db/update-dashboards! (mapv (comp :id first) group) changes)))]
        (doseq [[dashboard changes] plans]
          (events/updated! :model/Dashboard (merge dashboard changes) dashboard))
        (doseq [[{:keys [id]} changes] plans
                :when (contains? changes :archived)]
          (carry-questions! id (:archived changes)))
        n))))

(mu/defn update-dashboard-row! :- :int
  "Apply `changes` to `dashboard-or-id`, a Dashboard the caller loaded or the id of one, moving the Dashboard's
  questions with it, keeping its parameter cards, archiving or restoring its questions with it and publishing its update
  event, returning the number of Dashboards updated; for the REST API, the Agent API, the Metabot and MCP tools, revision
  revert, the collection archive, replacement and the SerDes import, whose `:import?` changes nothing, as master's hooks
  checked imports too."
  [dashboard-or-id :- [:or ::lib.schema.id/dashboard :map]
   changes         :- :map
   opts            :- ::dashboards.schema/write-opts]
  (let [dashboard (clean-row-or-select dashboard-or-id dashboards.db/dashboard)
        changes   (when dashboard (dashboard-changes dashboard changes))]
    (if (empty? changes)
      0
      (write-dashboard-changes! [[dashboard changes]] opts))))

(mu/defn update-dashboard-rows! :- :int
  "Apply `changes` to `dashboards`, Dashboards the caller loaded, as [[update-dashboard-row!]] does, in one statement
  for those the changes update alike, returning the number updated; for the collection archive and restore and the
  shifts of collection positions."
  [dashboards :- [:sequential :map]
   changes    :- :map
   opts       :- ::dashboards.schema/write-opts]
  (let [plans (into [] (keep (fn [dashboard]
                               (when-let [final (not-empty (dashboard-changes dashboard changes))]
                                 [dashboard final])))
                    dashboards)]
    (if (empty? plans)
      0
      (write-dashboard-changes! plans opts))))

(mu/defn delete-dashboard-rows! :- :int
  "Delete the Dashboards with `ids`, their parameter cards, revisions, cache configs and subscriptions, and publish their
  delete events, returning the number deleted; for the REST API, the collection deletion and generic writers."
  [ids   :- [:maybe [:sequential ::lib.schema.id/dashboard]]
   opts  :- ::dashboards.schema/write-opts]
  (let [dashboards (when (seq ids) (dashboards.db/dashboards-by-ids ids))]
    (if (empty? dashboards)
      0
      (let [ids (mapv :id dashboards)]
        (events/with-event-context (event-context opts)
          (events/with-batched-events
            (events/deleting! :model/Dashboard dashboards
                              (fn []
                                (run! #(queries/delete-all-parameter-cards-for-parameterized-object! "dashboard" %) ids)
                                (dashboards.db/delete-dashboard-revisions! ids)
                                (cache/delete-target-configs! "dashboard" ids)
                                ((:delete! (mi/write-fns :model/Pulse)) (dashboards.db/pulse-ids-for-dashboards ids) {})
                                (dashboards.db/delete-dashboards! ids)))))))))

(mu/defn delete-dashboard-row! :- :int
  "Delete the Dashboard with `id` as [[delete-dashboard-rows!]] does, returning the number deleted."
  [id   :- ::lib.schema.id/dashboard
   opts :- ::dashboards.schema/write-opts]
  (delete-dashboard-rows! [id] opts))

;;; ----------------------------------------------------- DashboardCards -------------------------------------------

(defn- check-dashcard-changes
  "Throws unless `changes`, the changed columns of `dashcard`, are an update a DashboardCard allows."
  [dashcard changes]
  (when (contains? changes :dashboard_id)
    (throw (ex-info (tru "You cannot move a dashboard card to another dashboard.") {:status-code 400})))
  (let [new-row (merge dashcard changes)]
    (when (contains? changes :dashboard_tab_id)
      (check-dashcard-tab new-row))
    (validate-dashcard-on-write new-row)))

(mu/defn update-dashcard! :- :int
  "Apply `changes` to `dashcard-or-id`, a DashboardCard the caller loaded or the id of one, and publish its update
  event, returning the number of DashboardCards updated; for the Agent API, the Card save that puts a Card on a
  Dashboard, `update-dashboard-cards!` and generic writers."
  [dashcard-or-id :- [:or ::lib.schema.id/dashcard :map]
   changes        :- :map
   opts           :- ::dashboards.schema/write-opts]
  (let [dashcard (clean-row-or-select dashcard-or-id dashboards.db/dashcard)
        changes  (when dashcard (changed dashcard changes))]
    (if (empty? changes)
      0
      (do
        (check-dashcard-changes dashcard changes)
        (let [changes (with-updated-at changes #{})]
          (events/with-event-context (event-context opts)
            (events/with-batched-events
              (u/prog1 (dashboards.db/update-dashcard! (:id dashcard) changes)
                (events/updated! :model/DashboardCard (merge dashcard changes) dashcard)))))))))

(mu/defn delete-dashcards! :- :int
  "Delete the DashboardCards with `ids`, their series and pulse cards, and publish their delete events, returning the
  number deleted; for `delete-dashboard-cards!`, the Card moves and deletions that take a Card off Dashboards, the Action
  deletion and generic writers."
  [ids   :- [:maybe [:sequential ::lib.schema.id/dashcard]]
   opts  :- ::dashboards.schema/write-opts]
  (let [dashcards (when (seq ids) (dashboards.db/dashcards-by-ids ids))]
    (if (empty? dashcards)
      0
      (events/with-event-context (event-context opts)
        (events/with-batched-events
          (events/deleting! :model/DashboardCard dashcards
                            #(dashboards.db/delete-dashcards! (mapv :id dashcards))))))))

;;; --------------------------------------------------- DashboardCardSeries ----------------------------------------

(mu/defn update-dashcard-series! :- :int
  "Apply `changes` to `series-or-id`, a DashboardCardSeries the caller loaded or the id of one, and publish its update
  event, returning the number updated; for generic writers."
  [series-or-id :- [:or ms/PositiveInt :map]
   changes      :- :map
   opts         :- ::dashboards.schema/write-opts]
  (let [series  (clean-row-or-select series-or-id #(first (dashboards.db/series-by-ids [%])))
        changes (when series (changed series changes))]
    (if (empty? changes)
      0
      (do
        (when (contains? changes :dashboardcard_id)
          (throw (ex-info (tru "You cannot move a series to another dashboard card.") {:status-code 400})))
        (events/with-event-context (event-context opts)
          (events/with-batched-events
            (u/prog1 (dashboards.db/update-dashcard-series! (:id series) changes)
              (events/updated! :model/DashboardCardSeries (merge series changes) series))))))))

(defn- delete-series-rows!
  "Delete `series`, rows of DashboardCardSeries, and publish their delete events."
  [series]
  (when (seq series)
    (events/with-batched-events
      (events/deleting! :model/DashboardCardSeries series
                        #(dashboards.db/delete-dashcard-series! (mapv :id series))))))

(mu/defn delete-dashcard-series! :- :int
  "Delete the DashboardCardSeries with `ids` and publish their delete events, returning the number deleted; for the Card
  deletion and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   opts  :- ::dashboards.schema/write-opts]
  (let [series (when (seq ids) (dashboards.db/series-by-ids ids))]
    (if (empty? series)
      0
      (events/with-event-context (event-context opts)
        (delete-series-rows! series)
        (count series)))))

;;; ------------------------------------------------- DashboardTabs ----------------------------------------------

(mu/defn insert-dashboard-tabs! :- [:sequential ms/PositiveInt]
  "Insert the DashboardTab `rows` and publish their create events, returning their ids; for the REST API's copy."
  [rows :- [:sequential [:map {:closed true}
                         [:dashboard_id ::lib.schema.id/dashboard]
                         [:name         ::dashboards.schema/dashboard-tab.name]
                         [:position     {:optional true} ::dashboards.schema/dashboard-tab.position]]]]
  (events/with-batched-events
    (dashboards.db/insert-dashboard-tabs! rows)))

(mu/defn update-dashboard-tab! :- :int
  "Apply `changes` to `tab-or-id`, a DashboardTab the caller loaded or the id of one, and publish its update event,
  returning the number updated; for `update-tabs!` and generic writers."
  [tab-or-id :- [:or ms/PositiveInt :map]
   changes   :- :map
   opts      :- ::dashboards.schema/write-opts]
  (let [tab     (clean-row-or-select tab-or-id #(first (dashboards.db/dashboard-tabs-by-ids [%])))
        changes (when tab (changed tab changes))]
    (if (empty? changes)
      0
      (do
        (when (contains? changes :dashboard_id)
          (throw (ex-info (tru "You cannot move a tab to another dashboard.") {:status-code 400})))
        (let [changes (with-updated-at changes #{})]
          (events/with-event-context (event-context opts)
            (events/with-batched-events
              (u/prog1 (dashboards.db/update-dashboard-tab! (:id tab) changes)
                (events/updated! :model/DashboardTab (merge tab changes) tab)))))))))

(mu/defn delete-dashboard-tabs! :- :int
  "Delete the DashboardTabs with `ids`, which the database takes their DashboardCards with, and publish their delete
  events, returning the number deleted; for `do-update-tabs!` and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   opts  :- ::dashboards.schema/write-opts]
  (let [tabs (when (seq ids) (dashboards.db/dashboard-tabs-by-ids ids))]
    (if (empty? tabs)
      0
      (events/with-event-context (event-context opts)
        (events/with-batched-events
          (events/deleting! :model/DashboardTab tabs
                            #(dashboards.db/delete-dashboard-tabs! (mapv :id tabs))))))))

(mu/defn create-tabs! :- [:map-of neg-int? pos-int?]
  "Create the new tabs and returned a mapping from temporary tab ID to the new tab ID."
  [dashboard-id :- ms/PositiveInt
   new-tabs     :- [:sequential [:merge ::dashboards.schema/dashboard-tab.update [:map {:closed true} [:id neg-int?]]]]]
  (let [new-tab-ids (events/with-batched-events
                      (dashboards.db/insert-dashboard-tabs! (->> new-tabs
                                                                 (map #(dissoc % :id))
                                                                 (map #(assoc % :dashboard_id dashboard-id)))))]
    (zipmap (map :id new-tabs) new-tab-ids)))

(mu/defn update-tabs! :- nil?
  "Updates tabs of a dashboard if changed."
  [current-tabs :- [:sequential ::dashboards.schema/dashboard-tab]
   new-tabs     :- [:sequential ::dashboards.schema/dashboard-tab]]
  (let [update-ks       [:name :position]
        id->current-tab (m/index-by :id current-tabs)
        to-update-tabs  (filter
                         ;; filter out tabs that haven't changed
                         (fn [new-tab]
                           (let [current-tab (get id->current-tab (:id new-tab))]
                             (not= (select-keys current-tab update-ks)
                                   (select-keys new-tab update-ks))))
                         new-tabs)]
    (when (seq to-update-tabs)
      (let [id->tab (m/index-by :id (dashboards.db/dashboard-tabs-by-ids (mapv :id to-update-tabs)))]
        (events/with-batched-events
          (doseq [tab to-update-tabs]
            (update-dashboard-tab! (get id->tab (:id tab)) (select-keys tab update-ks) {})))))
    nil))

(mu/defn delete-tabs! :- nil?
  "Delete tabs of a Dashboard"
  [tab-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (when (seq tab-ids)
    (delete-dashboard-tabs! tab-ids {}))
  nil)

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
                              (delete-tabs! to-delete-ids))
        old->new-tab-id     (when (seq to-create)
                              (let [new-tab-ids (events/with-batched-events
                                                  (dashboards.db/insert-dashboard-tabs!
                                                   (->> to-create
                                                        (map #(dissoc % :id))
                                                        (map #(assoc % :dashboard_id dashboard-id)))))]
                                (zipmap (map :id to-create) new-tab-ids)))]
    (when (seq to-update)
      (update-tabs! current-tabs to-update))
    {:old->new-tab-id old->new-tab-id
     :created-tab-ids (vals old->new-tab-id)
     :deleted-tab-ids to-delete-ids
     :total-num-tabs  (reduce + (map count [to-create to-update]))}))

;;; --------------------------------------------- Dashcards of a Dashboard ---------------------------------------

(defn update-dashboard-cards-series!
  "Batch update the DashboardCardSeries for multiple DashboardCards.
  Each `card-ids` list should be a definitive collection of *all* IDs of cards for the dashboard card in the desired order.

  *  If an ID in `card-ids` has no corresponding existing DashboardCardSeries object, one will be created.
  *  If an existing DashboardCardSeries has no corresponding ID in `card-ids`, it will be deleted.
  *  All cards will be updated with a `position` according to their place in the collection of `card-ids`"
  {:arglists '([dashcard-id->card-ids])}
  [dashcard-id->card-ids]
  (when (seq dashcard-id->card-ids)
    (events/with-batched-events
      ;; first off, just delete all series on the dashboard card (we add them again below)
      (delete-series-rows! (dashboards.db/series-for-dashcards (vec (keys dashcard-id->card-ids))))
      ;; now just insert all of the series that were given to us
      (when-let [card-series (seq (for [[dashcard-id card-ids] dashcard-id->card-ids
                                        [i card-id]            (map-indexed vector card-ids)]
                                    {:dashboardcard_id dashcard-id, :card_id card-id, :position i}))]
        (dashboards.db/insert-dashcard-series! card-series)))))

(def ^:private DashboardCardUpdates
  [:merge
   ::dashboards.schema/dashboard-card.update
   [:map {:closed true}
    [:id                     ms/PositiveInt]
    ;; series is a sequence of IDs of additional cards after the first to include as "additional serieses"
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

(mu/defn update-dashboard-cards!
  "Update existing DashboardCards, each given as a `[dashboard-card old-dashboard-card]` pair with `old-dashboard-card`
  sparing a DB call when nothing changed, rewriting their DashboardCardSeries in one statement for all of them, and
  returning nil."
  [pairs :- [:sequential [:tuple DashboardCardUpdates DashboardCardUpdates]]]
  (events/with-batched-events
    (let [update-ks [:action_id :card_id :row :col :size_x :size_y
                     :parameter_mappings :visualization_settings :dashboard_tab_id :inline_parameters]
          updates   (into []
                          (keep (fn [[dashboard-card old-dashboard-card]]
                                  (let [updates (shallow-updates (select-keys dashboard-card update-ks)
                                                                 (select-keys old-dashboard-card update-ks))]
                                    (when (seq updates)
                                      [(:id dashboard-card) updates]))))
                          pairs)
          id->row   (when (seq updates)
                      (m/index-by :id (dashboards.db/dashcards-by-ids (mapv first updates))))]
      (doseq [[id updates] updates]
        (update-dashcard! (or (get id->row id) id) updates {}))
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
    (events/with-batched-events
      (let [card-ids (keep :card_id dashboard-cards)]
        (when (seq card-ids)
          (let [in-report-cards (dashboards.db/document-cards-among card-ids)]
            (when (seq in-report-cards)
              (throw (ex-info "Cards with 'document_id' cannot be added to dashboards"
                              {:status-code 400
                               :in-report-card-ids (map :id in-report-cards)}))))))
      (let [dashboard-card-ids (dashboards.db/insert-dashcards!
                                (for [dashcard dashboard-cards]
                                  (merge {:parameter_mappings []
                                          :visualization_settings {}
                                          :inline_parameters []}
                                         (dissoc dashcard :id :created_at :updated_at :entity_id :series :card :collection_authority_level))))]
        ;; add series to the DashboardCard
        (update-dashboard-cards-series! (zipmap dashboard-card-ids (map #(get % :series []) dashboard-cards)))
        ;; return the full DashboardCard
        (-> (dashboards.db/dashcards-by-ids dashboard-card-ids)
            (t2/hydrate :series))))))

(defn- cleanup-orphaned-inline-parameters!
  "Remove inline parameter IDs from the dashboard's parameters list when dashcards are deleted.
   Since inline parameters can only be referenced by a single card, all inline parameters
   from deleted cards become orphaned."
  [dashboard-card-ids]
  (when (seq dashboard-card-ids)
    (let [cards-being-deleted (dashboards.db/dashcards-by-ids dashboard-card-ids)
          orphaned-param-ids (set (mapcat :inline_parameters cards-being-deleted))
          ;; Get dashboard IDs (should all be the same, but let's be safe)
          dashboard-ids (set (map :dashboard_id cards-being-deleted))]
      (when (and (seq orphaned-param-ids) (= 1 (count dashboard-ids)))
        (let [dashboard-id (first dashboard-ids)
              dashboard (dashboards.db/dashboard dashboard-id)
              current-params (:parameters dashboard)
              cleaned-params (filterv #(not (contains? orphaned-param-ids (:id %)))
                                      current-params)]
          (when (not= (count current-params) (count cleaned-params))
            (update-dashboard-row! dashboard {:parameters cleaned-params} {})
            (count orphaned-param-ids)))))))

(defn delete-dashboard-cards!
  "Delete DashboardCards of a Dashboard. Automatically cleans up orphaned inline parameters."
  [dashboard-card-ids]
  {:pre [(coll? dashboard-card-ids)]}
  (events/with-batched-events
    ;; Clean up inline parameters before deletion (since we need to read the cards first)
    (cleanup-orphaned-inline-parameters! dashboard-card-ids)
    ;; Delete the cards
    ((:delete! (mi/write-fns :model/PulseCard)) (dashboards.db/pulse-card-ids-for-dashcards (vec dashboard-card-ids)) {})
    (delete-dashcards! (vec dashboard-card-ids) {})))

(defn from-parsed-json
  "Convert a map with dashboard-card into a Toucan instance assuming it came from parsed JSON and the map keys have
   been keywordized. This is useful if the data from a request body inside a `defendpoint` body, and you need it in the
   same format as if it were selected from the DB with toucan. It doesn't transform the `:created_at` or `:updated_at`
   fields, as the types of timestamp values differ by the application database driver.

   For example:
   ```
   (= dashcard ;; from toucan select, excluding :created_at and :updated_at
      (-> (json/encode dashcard)
          json/decode+kw
          from-parsed-json))
   =>
   true
   ```"
  [dashboard-card]
  (t2/instance :model/DashboardCard
               (-> dashboard-card
                   (m/update-existing :parameter_mappings #(some->> % (lib/normalize ::parameters.schema/parameter-mappings)))
                   (m/update-existing :visualization_settings #(lib/normalize ::lib.schema.visualization/visualization-settings %)))))

(defn- set-questions-archived!
  "Sets `archived` of the Cards with `card-ids` to `archived?` when the current user may, else throws a 403."
  [card-ids archived?]
  (let [cards (dashboards.db/cards-to-set-archived card-ids archived?)]
    (api/check-403 (mi/can-update-each? :model/Card cards {:archived archived?}))
    (write-questions! cards {:archived archived?} {} #(dashboards.db/set-cards-archived! card-ids archived?))))

(defn archive-or-unarchive-internal-dashboard-questions!
  "When updating dashboard cards, if we're removing all references to a Dashboard Question (which is internal to the
  dashboard, not displayed as part of a collection) we want to archive it. Similarly, we want to mark any Dashboard
  Questions that *are* on the Dashboard as *not* archived. This function takes a dashboard and the set of dashcards
  about to be saved, and ensures that all DQs that appear on the dashboard are unarchived and all DQs that DON'T
  appear on the dashboard are archived."
  [dashboard-id new-cards]
  (let [;; the set of ALL Dashboard Questions (internal to the dashboard) for this Dashboard
        internal-dashboard-question-ids (dashboards.db/internal-dashboard-question-ids dashboard-id)
        ;; the set of all card IDs that are present on the dashboard
        used-card-ids (into #{} (map :card_id new-cards))
        ;; DQs that aren't used get archived
        internal-dashboard-questions-to-archive (set/difference internal-dashboard-question-ids used-card-ids)
        ;; DQs that ARE used get unarchived
        internal-dashboard-questions-to-unarchive (set/intersection internal-dashboard-question-ids used-card-ids)]
    (when-let [ids (seq internal-dashboard-questions-to-archive)]
      (set-questions-archived! (vec ids) true))
    (when-let [ids (seq internal-dashboard-questions-to-unarchive)]
      (set-questions-archived! (vec ids) false))))

;;; ------------------------------------------------- Generic writers ----------------------------------------------

(defmethod mi/write-fns :model/Dashboard
  [_model]
  {:update!     update-dashboard-row!
   :update-all! update-dashboard-rows!
   :delete!     delete-dashboard-rows!})

(defmethod mi/write-fns :model/DashboardCard
  [_model]
  {:update! update-dashcard!
   :delete! delete-dashcards!})

(defmethod mi/write-fns :model/DashboardTab
  [_model]
  {:update! update-dashboard-tab!
   :delete! delete-dashboard-tabs!})

(defmethod mi/write-fns :model/DashboardCardSeries
  [_model]
  {:update! update-dashcard-series!
   :delete! delete-dashcard-series!})

;;; ------------------------------------------------ Dashcards and x-rays -----------------------------------------

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
    ;; ensure the dashcards we are updating are part of the given dashboard
    (when (seq only-new)
      (throw (ex-info (tru "Dashboard {0} does not have a DashboardCard with ID {1}"
                           (u/the-id dashboard) (first only-new))
                      {:status-code 404})))
    (events/with-batched-events
      ;; update-dashboard-cards! requires series to be a sequence of card IDs
      (update-dashboard-cards!
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
  (when (changes-embedding? dash-before-update dash-updates)
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

(defn- create-layout-dashcards!
  [dashboard dashcards]
  (doseq [card-id (into #{} (comp (mapcat dashcard-card-ids) (filter pos-int?)) dashcards)]
    (api/check-not-archived (dashboards.db/card card-id)))
  (check-parameter-mapping-permissions (for [{:keys [card_id parameter_mappings]} dashcards
                                             mapping parameter_mappings]
                                         (assoc mapping :card-id card_id)))
  (api/check-500 (add-dashcards! dashboard dashcards)))

(defn- update-layout-dashcards! [dashboard dashcards]
  (check-updated-parameter-mapping-permissions (:id dashboard) dashcards)
  ;; transform the dashcard data to the format of the DashboardCard model
  ;; so update-dashcards! can compare them with existing dashcards
  (update-dashcards! dashboard (map from-parsed-json dashcards))
  dashcards)

(defn- delete-layout-dashcards! [dashcard-ids]
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
      (update-layout-dashcards! dashboard to-update))
    {:deleted-dashcards (when (seq to-delete)
                          (delete-layout-dashcards! (map :id to-delete)))
     :created-dashcards (when (seq to-create)
                          (create-layout-dashcards! dashboard to-create))}))

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
  "Update the Dashboard with `id` and return the saved row. `dash-updates` may carry
  dashboard attributes plus `:dashcards` and `:tabs`, which fully replace the current layout — entries
  with negative ids are created, missing entries are deleted. Requires write permission on the dashboard;
  runs in one transaction and may notify owners of broken subscriptions."
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
                                         (update-dashboard-row! current-dash updates {})
                                         (when (some? (:collection_id updates))
                                           (events/publish-event! :event/collection-touch {:collection-id (:collection_id updates) :user-id api/*current-user-id*}))
                                         ;; Handle broken subscriptions, if any, when parameters changed
                                         (when parameters
                                           (pulse.broken-subscriptions/handle-broken-subscriptions! id original-params)))
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
        dashboard))))

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
  "Takes a dashboard id, and duplicates the cards both on the dashboard's cards and dashcardseries as necessary.

  Returns `{:copied {old-card-id duplicated-card} :referenced {old-card-id card} :discarded [card]}` so that the new
  dashboard can adjust accordingly. `:discarded` carries [[cards-to-copy]]'s redaction.

  If `deep-copy?` is `false`, doesn't copy any cards *except* for Dashboard Questions, which must be copied."
  [deep-copy? new-dashboard old-dashboard dest-coll-id]
  (let [same-collection?                 (= (:collection_id old-dashboard) dest-coll-id)
        {:keys [copy discard reference]} (cards-to-copy deep-copy? (:dashcards old-dashboard))]
    {:copied     (into {} (for [[id to-copy] copy]
                            [id (queries/with-copy-source-card to-copy
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
  (let [new-tab-ids (insert-dashboard-tabs!
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
        dashboard      (events/with-batched-events (t2/with-transaction [_conn]
                                                     ;; Adding a new dashboard at `collection_position` could cause other dashboards in this
                                                     ;; collection to change position, check that and fix up if needed
                                                     (api/maybe-reconcile-collection-position! (select-keys dashboard-data [:collection_id :collection_position]))
                                                     ;; Ok, now save the Dashboard
                                                     (let [dash (dashboards.db/insert-dashboard! dashboard-data)
                                                           {id->new-card :copied
                                                            id->referenced-card :referenced
                                                            uncopied :discarded}
                                                           (maybe-duplicate-cards is_deep_copy dash existing-dashboard collection_id)

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
