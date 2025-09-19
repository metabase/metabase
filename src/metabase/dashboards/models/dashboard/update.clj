(ns metabase.dashboards.models.dashboard.update
  "(Most of the) hairball logic around updating a Dashboard.

  TODO -- this should probably all get rolled into the default Toucan `before-update`/`after-update` methods for a
  `:model/Dashboard`, rather than having these secret bespoke functions only used by the REST API."
  (:require
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.channel.email.messages :as messages]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.embedding.validation :as embedding.validation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.pulse.core :as pulse]
   [metabase.query-permissions.core :as query-perms]
   [metabase.revisions.core :as revisions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(defn- update-dashcards-and-tabs?
  "Tabs are always sent in production as well when dashcards are updated, but there are lots of tests that exclude it.
  so this only checks for dashcards"
  [dash-updates]
  (contains? dash-updates :dashcards))

(defn- check-allowed-to-change-embedding
  "You must be a superuser to change the value of `enable_embedding` or `embedding_params`. Embedding must be
  enabled."
  [dash-before-update dash-updates]
  (when (or (api/column-will-change? :enable_embedding dash-before-update dash-updates)
            (api/column-will-change? :embedding_params dash-before-update dash-updates))
    (embedding.validation/check-embedding-enabled)
    (api/check-superuser)))

(defn- check-allowed-to-update-dashboard [current-dash dash-updates]
  (collection/check-allowed-to-change-collection current-dash dash-updates)
  (check-allowed-to-change-embedding current-dash dash-updates)
  ;; - if the dashboard is archived, we don't want to let you muck around with its contents
  ;;
  ;; - but if we're mucking around with its contents and unarchiving it at the same time, that's cool
  (when (update-dashcards-and-tabs? dash-updates)
    (api/check-not-archived (merge current-dash (select-keys dash-updates [:archived])))))

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
                                                                         field-id (params/param-target->field-id target query)]
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
                                         (let [mapping           (parameters/normalize-parameter-mapping mapping)
                                               existing-mappings (get dashcard-id->existing-mappings dashcard-id)]
                                           (contains? existing-mappings (select-keys mapping [:target :parameter_id]))))
        new-mappings                   (for [{mappings :parameter_mappings, dashcard-id :id} dashcards
                                             mapping mappings
                                             :when   (not (existing-mapping? dashcard-id mapping))]
                                         (assoc mapping :dashcard-id dashcard-id))
        ;; need to add the appropriate `:card-id` for all the new mappings we're going to check.
        dashcard-id->card-id           (when (seq new-mappings)
                                         (t2/select-pk->fn :card_id :model/DashboardCard
                                                           :dashboard_id dashboard-id
                                                           :id           [:in (set (map :dashcard-id new-mappings))]))
        new-mappings                   (for [{:keys [dashcard-id], :as mapping} new-mappings]
                                         (assoc mapping :card-id (get dashcard-id->card-id dashcard-id)))]
    (check-parameter-mapping-permissions new-mappings)))

(mu/defn- create-dashcards!
  [dashboard :- ::dashboards.schema/dashboard.update
   dashcards :- ::dashboards.schema/dashcards.update]
  (doseq [{:keys [card_id]} dashcards
          :when  (pos-int? card_id)]
    (api/check-not-archived (api/read-check :model/Card card_id)))
  (check-parameter-mapping-permissions (for [{:keys [card_id parameter_mappings]} dashcards
                                             mapping parameter_mappings]
                                         (assoc mapping :card-id card_id)))
  (api/check-500 (dashboard/add-dashcards! dashboard dashcards)))

(mu/defn- update-dashcards!
  [dashboard :- ::dashboards.schema/dashboard.update
   dashcards :- ::dashboards.schema/dashcards.update]
  (check-updated-parameter-mapping-permissions (:id dashboard) dashcards)
  ;; transform the dashcard data to the format of the DashboardCard model
  ;; so update-dashcards! can compare them with existing dashcards
  (dashboard/update-dashcards! dashboard (map dashboard-card/from-parsed-json dashcards))
  dashcards)

(mu/defn- delete-dashcards! [dashcard-ids :- [:or
                                              [:sequential {:min 1} ::lib.schema.id/dashcard]
                                              [:set {:min 1} ::lib.schema.id/dashcard]]]
  (when (seq dashcard-ids)
    (let [dashboard-cards (t2/select :model/DashboardCard :id [:in dashcard-ids])]
      (dashboard-card/delete-dashboard-cards! dashcard-ids)
      dashboard-cards)))

(defn- assert-new-dashcards-are-not-internal-to-other-dashboards [dashboard to-create]
  (when-let [card-ids (seq (concat
                            (seq (keep :card_id to-create))
                            (->> to-create
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
    (assert-new-dashcards-are-not-internal-to-other-dashboards dashboard to-create)
    (when (seq to-update)
      (update-dashcards! dashboard to-update))
    {:deleted-dashcards (when (seq to-delete)
                          (delete-dashcards! (map :id to-delete)))
     :created-dashcards (when (seq to-create)
                          (create-dashcards! dashboard to-create))}))

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
    (for [{:keys [card_id]} created-dashcards
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

;;;;;;;;;;;; Bad pulse check & repair

(defn- bad-pulse-notification-data
  "Given a pulse and bad parameters, return relevant notification data:
  - The name of the pulse
  - Which selected parameter values are broken
  - The user info for the creator of the pulse
  - The users affected by the pulse"
  [{bad-pulse-id :id pulse-name :name :keys [parameters creator_id]}]
  (let [creator (t2/select-one [:model/User :first_name :last_name :email] creator_id)]
    {:pulse-id       bad-pulse-id
     :pulse-name     pulse-name
     :bad-parameters parameters
     :pulse-creator  creator
     :affected-users (flatten
                      (for [{pulse-channel-id  :id
                             channel-type      :channel_type
                             {:keys [channel]} :details} (t2/select [:model/PulseChannel :id :channel_type :details]
                                                                    :pulse_id [:= bad-pulse-id])]
                        (case channel-type
                          :email (let [pulse-channel-recipients (when (= :email channel-type)
                                                                  (t2/select :model/PulseChannelRecipient
                                                                             :pulse_channel_id pulse-channel-id))]
                                   (when (seq pulse-channel-recipients)
                                     (map
                                      (fn [{:keys [common_name] :as recipient}]
                                        (assoc recipient
                                               :notification-type channel-type
                                               :recipient common_name))
                                      (t2/select [:model/User :first_name :last_name :email]
                                                 :id [:in (map :user_id pulse-channel-recipients)]))))
                          :slack {:notification-type channel-type
                                  :recipient         channel}
                          nil)))}))

(defn- broken-pulses
  "Identify and return any pulses used in a subscription that contain parameters that are no longer on the dashboard."
  [dashboard-id original-dashboard-params]
  (when (seq original-dashboard-params)
    (let [{:keys [resolved-params]} (t2/hydrate
                                     (t2/select-one [:model/Dashboard :id :parameters] dashboard-id)
                                     :resolved-params)
          dashboard-params (set (keys resolved-params))]
      (->> (t2/select :model/Pulse :dashboard_id dashboard-id :archived false)
           (keep (fn [{:keys [parameters] :as pulse}]
                   (let [bad-params (filterv
                                     (fn [{param-id :id}] (not (contains? dashboard-params param-id)))
                                     parameters)]
                     (when (seq bad-params)
                       (assoc pulse :parameters bad-params)))))
           seq))))

(defn- broken-subscription-data
  "Given a dashboard id and original parameters, return data (if any) on any broken subscriptions. This will be a seq
  of maps, each containing:
  - The pulse id that was broken
  - name and email data for the dashboard creator and pulse creator
  - Affected recipient information
  - Basic descriptive data on the affected dashboard, pulse, and parameters for use in downstream notifications"
  [dashboard-id original-dashboard-params]
  (when-some [broken-pulses (broken-pulses dashboard-id original-dashboard-params)]
    (let [{dashboard-name        :name
           dashboard-description :description
           dashboard-creator     :creator} (t2/hydrate
                                            (t2/select-one [:model/Dashboard :name :description :creator_id] dashboard-id)
                                            :creator)]
      (for [broken-pulse broken-pulses]
        (assoc
         (bad-pulse-notification-data broken-pulse)
         :dashboard-id dashboard-id
         :dashboard-name dashboard-name
         :dashboard-description dashboard-description
         :dashboard-creator (select-keys dashboard-creator [:first_name :last_name :email :common_name]))))))

(defn- handle-broken-subscriptions!
  "Given a dashboard id and original parameters, determine if any of the subscriptions are broken (we've removed params
  that subscriptions require). If so, delete the subscriptions and notify the dashboard and pulse creators."
  [dashboard-id current-dash {:keys [parameters], :as _dash-updates}]
  ;; If there are parameters in the update, we want the old params so that we can do a check to see if any of
  ;; the notifications were broken by the update.
  (let [{original-params :resolved-params} current-dash]
    (doseq [{:keys [pulse-id] :as broken-subscription} (broken-subscription-data dashboard-id original-params)]
      ;; Archive the pulse
      (pulse/update-pulse! {:id pulse-id :archived true})
      ;; Let the pulse and subscription creator know about the broken pulse
      (messages/send-broken-subscription-notification! broken-subscription))))

;;;;;;;;;;;;;;;;;;;;; End functions to handle broken subscriptions

(defn- maybe-archive-or-unarchive-cards! [id current-dash dash-updates]
  (when (api/column-will-change? :archived current-dash dash-updates)
    (if (:archived dash-updates)
      (t2/update! :model/Card
                  :dashboard_id id
                  :archived false
                  {:archived true :archived_directly false})
      (t2/update! :model/Card
                  :dashboard_id id
                  :archived true
                  :archived_directly false
                  {:archived false}))))

(defn- maybe-update-card-collection-ids! [id current-dash dash-updates]
  (when (api/column-will-change? :collection_id current-dash dash-updates)
    (t2/update! :model/Card :dashboard_id id {:collection_id (:collection_id dash-updates)})))

(defn- select-dash-update-keys [dash-updates]
  (u/select-keys-when
   dash-updates
   :present #{:description :position :width :collection_id :collection_position :cache_ttl
              :archived_directly}
   :non-nil #{:name :parameters :caveats :points_of_interest :show_in_getting_started
              :enable_embedding :embedding_params :archived :auto_apply_filters}))

(defn- update-dashcards-and-tabs! [current-dash {:keys [dashcards tabs], :as dash-updates} changes-stats]
  (when (update-dashcards-and-tabs? dash-updates)
    (let [{current-dashcards :dashcards
           current-tabs      :tabs
           :as               hydrated-current-dash} (t2/hydrate current-dash [:dashcards :series :card] :tabs)
          _                                         (when (and (seq current-tabs)
                                                               (not (every? #(some? (:dashboard_tab_id %)) dashcards)))
                                                      (throw (ex-info (tru "This dashboard has tab, makes sure every card has a tab")
                                                                      {:status-code 400})))
          new-tabs                                  (map-indexed (fn [idx tab] (assoc tab :position idx)) tabs)
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
               (select-keys dashcards-changes-stats [:created-dashcards :deleted-dashcards]))))))

(defn- update-dashboard*! [id current-dash dash-updates changes-stats]
  (t2/with-transaction [_conn]
    (when-let [dash-updates (not-empty (select-dash-update-keys dash-updates))]
      ;; If the dashboard has an updated position, or if the dashboard is moving to a new collection, we might
      ;; need to adjust the collection position of other dashboards in the collection
      (api/maybe-reconcile-collection-position! current-dash dash-updates)
      (maybe-archive-or-unarchive-cards! id current-dash dash-updates)
      (maybe-update-card-collection-ids! id current-dash dash-updates)
      (t2/update! :model/Dashboard id dash-updates)
      (when (contains? dash-updates :collection_id)
        (events/publish-event! :event/collection-touch {:collection-id id :user-id api/*current-user-id*}))
      ;; Handle broken subscriptions, if any, when parameters changed
      (handle-broken-subscriptions! id current-dash dash-updates))
    ;; [[update-dashcards-and-tabs!]] uses `:dashcards` which is removed by [[select-dash-update-keys]]
    (update-dashcards-and-tabs! current-dash dash-updates changes-stats)))

(defn- fetch-updated-dashboard [id dash-updates changes-stats]
  (let [dashboard (t2/select-one :model/Dashboard id)]
    ;; skip publishing the event if it's just a change in its collection position
    (when-not (= #{:collection_position}
                 (set (keys dash-updates)))
      (events/publish-event! :event/dashboard-update {:object dashboard :user-id api/*current-user-id*}))
    (track-dashcard-and-tab-events! dashboard @changes-stats)
    (-> dashboard
        dashboard/hydrate-dashboard-details
        (assoc :last-edit-info (revisions/edit-information-for-user @api/*current-user*)))))

(mu/defn update-dashboard!
  "Updates a Dashboard. Designed to be reused by PUT /api/dashboard/:id and PUT /api/dashboard/:id/cards"
  [id           :- ::lib.schema.id/dashboard
   dash-updates :- :map]
  (span/with-span! {:name       "update-dashboard"
                    :attributes {:dashboard/id id}}
    (let [dash-updates  (dashboards.schema/normalize-dashboard dash-updates ::dashboards.schema/dashboard.update)
          current-dash  (cond-> (api/write-check :model/Dashboard id)
                          (contains? dash-updates :parameters)
                          (t2/hydrate [:dashcards :card] :resolved-params))
          changes-stats (atom nil)
          dash-updates (api/updates-with-archived-directly current-dash dash-updates)]
      (check-allowed-to-update-dashboard current-dash dash-updates)
      (update-dashboard*! id current-dash dash-updates changes-stats)
      (fetch-updated-dashboard id dash-updates changes-stats))))
