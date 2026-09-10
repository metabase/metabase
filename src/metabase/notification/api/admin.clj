(ns metabase.notification.api.admin
  "Admin endpoints for notifications (card-type alerts). Gated behind `check-superuser`. Each row
  carries `:last_check` (latest scheduler tick — any terminal
  outcome) and `:last_send` (latest channel-send delivery attempt — any outcome, including
  failures) computed from windowed subqueries; both expose `{at, error, status}`. The API surface
  uses `creator_*` throughout — matching `notification.creator_id` and the hydrated `:creator` map,
  and consistent with the public `metabase.notification.api` endpoints. (The admin UI labels these
  as \"owner\", but that's a frontend-only term and never appears on the wire.)

  Supported filters:
    - `active`            boolean — notification.active
    - `creator_id`        int     — notification.creator_id = ?
    - `creator_active`    boolean — core_user.is_active = ?  (active creators only / deactivated only)
    - `creatorless`       boolean — true: creator_id IS NULL OR is_active = false;
                                    false: inverse (has a live creator). Powers the Ownerless tab.
    - `card_id`           int     — notification_card.card_id = ?
    - `recipient_email`   string  — exact email match across user + raw-value recipients
    - `channel`           string or vec of strings — handler channel_type IN (...), OR semantics
    - `last_send_status`  :successful/:failing — filters on the latest channel-send outcome
    - `query`             string  — substring match across card name + creator first/last/email

  `last_send_status=failing` corresponds to the Failing tab — notifications whose most recent
  send tick (rolled up across all channels) had at least one channel failure."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.notification.api.notification :as notification-api]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; String-literal constants — hoisted to avoid scattered raw strings
;; ---------------------------------------------------------------------------

(def ^:private run-type-alert          "alert")
(def ^:private task-notification-send  "notification-send")
(def ^:private task-channel-send       "channel-send")
(def ^:private terminal-statuses       ["success" "failed" "abandoned"])

;; ---------------------------------------------------------------------------
;; Schema definitions
;; ---------------------------------------------------------------------------

(mr/def ::run-status
  [:enum :failing :successful])

(mr/def ::run-summary
  [:map {:closed true}
   [:at     ms/TemporalInstant]
   [:error  [:maybe :string]]
   [:status ::run-status]])

(mr/def ::channel-entry
  "One channel delivery attempt within a tick."
  [:map {:closed true}
   [:channel_type :keyword]
   [:status       ::run-status]
   [:error        [:maybe :string]]])

(mr/def ::tick-send-entry
  "One tick's worth of sends, rolled up across all channels that fired in that tick."
  [:map {:closed true}
   [:at       ms/TemporalInstant]
   [:status   ::run-status]
   [:error    [:maybe :string]]
   [:channels [:sequential ::channel-entry]]])

(mr/def ::sort-column
  [:enum :id :last_send :last_check :card_name :creator_name :updated_at])

(mr/def ::sort-direction
  [:enum :asc :desc])

(mr/def ::list-row
  [:map
   [:id           ms/PositiveInt]
   [:active       :boolean]
   [:creator_id   [:maybe ms/PositiveInt]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]
   [:payload_type :keyword]
   [:payload_id   [:maybe ms/PositiveInt]]
   [:last_check   [:maybe ::run-summary]]
   [:last_send    [:maybe ::run-summary]]])

(mr/def ::list-response
  [:map
   [:data    [:sequential ::list-row]]
   [:total   ms/IntGreaterThanOrEqualToZero]
   [:limit   [:maybe ms/PositiveInt]]
   [:offset  [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::detail-response
  [:merge ::list-row
   [:map
    [:check_history [:sequential ::run-summary]]
    [:send_history  [:sequential ::tick-send-entry]]]])

(mr/def ::bulk-response
  [:map
   [:updated ms/IntGreaterThanOrEqualToZero]])

(defn- handler-ids-with-raw-value-matching
  "Set of notification_handler IDs whose raw-value (external) recipients have `details.value`
  equal to (lowercased) `email`. Used by `?recipient_email=` only — the `?query=` substring
  search no longer descends into recipients (per design iteration)."
  [email]
  (let [lower-email (u/lower-case-en email)]
    ;; reducible-select so the (necessarily) in-memory `details.value` scan streams rows rather
    ;; than realizing the whole raw-value recipient table at once.
    (into #{}
          (comp (filter #(some-> % :details :value u/lower-case-en (= lower-email)))
                (map :notification_handler_id))
          (notification.db/raw-value-recipients-reducible))))

(defn- notification-ids-with-recipient-email
  "Notification IDs whose recipients (user or raw-value) match `email` exactly. One SQL query
  unions both paths: user-recipients via an indexed `core_user.email` equality, raw-value
  recipients via a pre-resolved set of handler IDs from an in-memory scan."
  [email]
  (let [lower-email     (u/lower-case-en email)
        raw-handler-ids (handler-ids-with-raw-value-matching email)]
    (notification.db/handler-notification-ids-for-email lower-email raw-handler-ids)))

(defn- coerce-run-status
  "Map a task_run/task_history `:status` keyword to the public `::run-status` enum.
    :success              → :successful
    :failed / :abandoned  → :failing
  Returns nil when `status` is nil (no run exists)."
  [status]
  (when status
    (case status
      :success             :successful
      (:failed :abandoned) :failing)))

(defn- run->summary
  "Build a `::run-summary` map (or nil) from a task_run row joined onto the list query.
  Inputs:
    - status     ; :success / :failed / :abandoned, or nil if no run exists
    - at         ; started_at timestamp
    - error      ; string from task_history.task_details->>'message', or nil

  Mapping:
    - :success      → :successful
    - :failed       → :failing
    - :abandoned    → :failing            (heartbeat-killed in-flight runs roll up to failing —
                                           the FE only cares about success/failure, not the
                                           lifecycle reason)
    - nil / no row  → nil                 (never run / not visible to admin)
    - :started      → not reachable here — the lc/ls subqueries exclude :started runs."
  [{:keys [status at error]}]
  (when (and status at)
    (let [run-status (coerce-run-status status)]
      {:at     at
       ;; Abandoned runs are heartbeat-killed mid-flight, so they usually have no task_history
       ;; message. Without a synthesized reason the Failing tab would show them as failing with a
       ;; blank "why", which is the first question an admin asks. Fall back to an explanation.
       :error  (when (= run-status :failing)
                 (or error
                     (when (= status :abandoned)
                       (tru "The run was abandoned, likely because the instance restarted while it was queued."))))
       :status run-status})))

(defn- coerce-status
  [status]
  (some-> status keyword))

(defn- error-by-run-id
  "Map run_id → error message for the given failed/abandoned run IDs. When `task-name` is non-nil,
  restrict to that task type (used by `last_send`, which is specifically about channel-send). When
  nil, the ORDER BY tiebreaker prefers `notification-send` then falls back to the latest by
  `ended_at` (used by `last_check`, which wants the most-signal message for the whole run). The
  CASE is a no-op when `task-name` is supplied — all candidate rows share the same `:task`."
  [task-name run-ids]
  (when (seq run-ids)
    (->> (notification.db/latest-failed-task-history task-notification-send run-ids task-name)
         (into {} (map (juxt :run_id (comp :message :task_details)))))))

(defn- has-failure?
  "True when the `has_failure` value from `latest-send-tick-per-notification` indicates at least one
  channel failure. `bit->boolean` absorbs the MySQL/MariaDB bit-vs-boolean JDBC quirk so H2,
  Postgres, and MySQL all read uniformly."
  [v]
  (boolean (api/bit->boolean v)))

(defn- decorate-runs
  "Build :last_check / :last_send maps on each row from the joined run columns + per-page
  task_history lookups for the error messages on any failed runs.

  :last_check error uses the tiebreaker (prefer the outer notification-send message; fall back to
  the latest by ended_at). :last_send error is restricted to channel-send rows — `last_send` is
  specifically about the send tick, and the outer notification-send may have succeeded.
  :last_send is nil when ls_started_at is nil (no send ever attempted for this notification)."
  [rows]
  (let [failed-lc-ids (into #{} (keep (fn [{:keys [lc_id lc_status]}]
                                        (when (#{"failed" "abandoned"} lc_status) lc_id)))
                            rows)
        failed-ls-ids (into #{} (keep (fn [{:keys [ls_id ls_has_failure]}]
                                        (when (and ls_id (has-failure? ls_has_failure)) ls_id)))
                            rows)
        lc->error     (error-by-run-id nil failed-lc-ids)
        ls->error     (error-by-run-id task-channel-send failed-ls-ids)]
    (mapv (fn [{:keys [lc_id lc_status lc_started_at
                       ls_id ls_started_at ls_has_failure] :as row}]
            (-> row
                (assoc :last_check (run->summary {:status (coerce-status lc_status)
                                                  :at     lc_started_at
                                                  :error  (get lc->error lc_id)}))
                (assoc :last_send  (when ls_started_at
                                     {:at     ls_started_at
                                      :error  (get ls->error ls_id)
                                      :status (if (has-failure? ls_has_failure)
                                                :failing
                                                :successful)}))
                (dissoc :lc_id :lc_status :lc_started_at
                        :ls_id :ls_started_at :ls_has_failure)))
          rows)))

(defn- splice-creator-active
  "Splice `:is_active` (joined from `core_user`) onto the hydrated `:creator` map — `t2/hydrate
  :creator` strips it because `default-user-columns` omits it — and drop the internal
  `:creator_is_active` carrier column. The response keeps `creator_id` / `creator` as-is."
  [{:keys [creator creator_is_active] :as row}]
  (-> row
      (cond-> creator (assoc :creator (assoc creator :is_active creator_is_active)))
      (dissoc :creator_is_active)))

(defn- list-notifications
  "Single SQL query for the page; one extra query for failed-run error messages on that page."
  [{:keys [limit offset recipient_email] :as filters}]
  (let [base-filters (cond-> (-> filters (dissoc :limit :offset :recipient_email))
                       recipient_email
                       (assoc :recipient_notification_ids (notification-ids-with-recipient-email recipient_email)))
        page-rows    (notification.db/admin-notifications-page base-filters limit offset)
        total        (or (notification.db/admin-notifications-count base-filters) 0)
        decorated    (-> page-rows
                         decorate-runs
                         models.notification/hydrate-notification)]
    {:data    (mapv splice-creator-active decorated)
     :total   total
     :limit   limit
     :offset  offset}))

;; snake_case query params are intentional here — they match the existing
;; `metabase.notification.api.notification` endpoints so clients can share param names between
;; the public and admin surfaces.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- ::list-response
  "List card-type notifications (alerts) for admin management. Supports pagination (`limit` +
  `offset` query params — handled by the offset-paging middleware), filtering, and sorting.

  `last_send_status` filter operates on the latest channel-send task_history row for the
  notification (`successful` = latest channel-send succeeded; `failing` = latest channel-send
  failed).

  `last_check_status` filter operates on the latest terminal TaskRun for the notification — the
  whole-run rollup (`successful` = the run succeeded; `failing` = it failed or was abandoned). This
  is a superset of `last_send_status`: it also catches query failures and heartbeat-abandoned runs
  that never reached the send step. The Failing tab uses `?last_check_status=failing`.

  `creatorless=true` selects notifications with no creator or a deactivated creator (the Ownerless
  tab). `creatorless=false` selects the inverse.

  `channel` accepts a single string or a repeated query param for multi-select (OR logic)."
  [_route
   {:keys [active creator_id creator_active creatorless card_id recipient_email channel last_send_status
           last_check_status query sort_column sort_direction]} :-
   [:map
    [:active            {:optional true} [:maybe ms/BooleanValue]]
    [:creator_id        {:optional true} ms/PositiveInt]
    [:creator_active    {:optional true} [:maybe ms/BooleanValue]]
    [:creatorless       {:optional true} [:maybe ms/BooleanValue]]
    [:card_id           {:optional true} ms/PositiveInt]
    [:recipient_email   {:optional true} ms/NonBlankString]
    [:channel           {:optional true} [:maybe [:or ms/NonBlankString [:sequential ms/NonBlankString]]]]
    [:last_send_status  {:optional true} ::run-status]
    [:last_check_status {:optional true} ::run-status]
    [:query             {:optional true} ms/NonBlankString]
    [:sort_column       {:default :last_send} ::sort-column]
    [:sort_direction    {:default :desc}      ::sort-direction]]]
  (api/check-superuser)
  (list-notifications {:limit             (or (request/limit) 50)
                       :offset            (or (request/offset) 0)
                       :active            active
                       :creator_id        creator_id
                       :creator_active    creator_active
                       :creatorless       creatorless
                       :card_id           card_id
                       :recipient_email   recipient_email
                       :channel           channel
                       :last_send_status  last_send_status
                       :last_check_status last_check_status
                       :query             query
                       :sort_column       sort_column
                       :sort_direction    sort_direction}))

;; ---------------------------------------------------------------------------
;; Detail endpoint helpers
;; ---------------------------------------------------------------------------

(defn- task-details-key
  "Look up `k` in `task_details`, checking top level then `:original-info` (where
  `with-task-history` nests the caller's payload on failure)."
  [task_details k]
  (or (get task_details k)
      (get-in task_details [:original-info k])))

(defn- ->channel-entry
  "Build a single `::channel-entry` from a channel-send task_history row."
  [{:keys [status task_details]}]
  (let [status-kw    (coerce-status status)
        run-status   (coerce-run-status (or status-kw :failed))
        channel-type (some-> (task-details-key task_details :channel_type) keyword)]
    {:channel_type (or channel-type :channel/unknown)
     :status       run-status
     :error        (when (= run-status :failing)
                     (:message task_details))}))

(defn- check-history-for-notification
  "Up to `:result-limit` most-recent terminal alert TaskRuns for `notification-id`, newest first, as
  `::run-summary` maps. Attributed directly via `task_run.notification_id`."
  [notification-id & {:keys [result-limit] :or {result-limit 10}}]
  (let [runs       (notification.db/terminal-alert-runs run-type-alert
                                                        notification-id
                                                        terminal-statuses
                                                        (notification.db/admin-lookback-cutoff)
                                                        result-limit)
        failed-ids (into #{} (keep (fn [{:keys [id status]}]
                                     (when (#{:failed :abandoned} status) id))
                                   runs))
        errors     (error-by-run-id nil failed-ids)]
    (mapv (fn [{:keys [id status started_at]}]
            (run->summary {:status status :at started_at :error (get errors id)}))
          runs)))

(defn- send-history-for-notification
  "Up to `:result-limit` most-recent send ticks for `notification-id`, newest first, each a
  `::tick-send-entry` rolling up all channels in that tick. Channel-send rows are attributed via
  their run's `task_run.notification_id`."
  [notification-id & {:keys [result-limit] :or {result-limit 10}}]
  ;; channel-send rows of one tick share a run_id and are adjacent in started_at-desc order, so
  ;; partition-by run_id segments them into ticks; take `result-limit` ticks. `realize` each row
  ;; before partition-by holds it — reducible-select rows go invalid once `take` closes the cursor.
  (into []
        (comp (map t2.realize/realize)
              (partition-by :run_id)
              (take result-limit)
              (map (fn [tick-rows]
                     (let [channel-entries (mapv ->channel-entry tick-rows)]
                       {:at       (:run_started_at (first tick-rows))
                        :status   (if (some #(= :failing (:status %)) channel-entries) :failing :successful)
                        :error    (some :error channel-entries)
                        :channels channel-entries}))))
        (notification.db/channel-send-history-reducible run-type-alert
                                                        notification-id
                                                        task-channel-send
                                                        (notification.db/admin-lookback-cutoff))))

(defn- get-notification-detail
  "Fetch a single card-type notification with `:last_check`, `:last_send`, `:check_history`, and
  `:send_history`, each attributed to THIS notification via `task_run.notification_id`. Returns nil
  for a missing or non-card notification."
  [id]
  (when-let [row (notification.db/admin-notification-detail-row id)]
    (let [decorated     (-> (models.notification/hydrate-notification [row])
                            first
                            splice-creator-active)
          check-history (check-history-for-notification id)
          send-history  (send-history-for-notification id)]
      (assoc decorated
             :last_check    (first check-history)
             :last_send     (some-> (first send-history) (select-keys [:at :status :error]))
             :check_history check-history
             :send_history  send-history))))

(api.macros/defendpoint :get "/:id" :- ::detail-response
  "Get a single card-type notification with last_check, last_send, check_history (up to 10
  most-recent terminal alert-type TaskRuns) and send_history (up to 10 most-recent channel-send
  delivery attempts). 404 if the notification doesn't exist or isn't a card-type notification."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (get-notification-detail id)))

(defn- action->update-map
  [action creator-id]
  (case (keyword action)
    :archive        {:active false}
    :change-creator (do (api/check (integer? creator-id) [400 "creator_id required for change-creator"])
                        {:creator_id creator-id})))

(defn- bulk-update!
  "Apply `update-map` to all card-type notifications in `ids` in a single SQL update. Returns the
  hydrated before-state so the caller can drive post-commit side effects via
  [[notification-api/publish-notification-update!]]."
  [update-map ids]
  ;; Guard empty `ids`: `[:in :id []]` is degenerate SQL, and there's nothing to select/update or
  ;; publish side effects for. (The endpoint schema also enforces `:min 1`.)
  (if (empty? ids)
    []
    ;; The endpoint is superuser-gated (`api/check-superuser`), which is what the model's
    ;; before-update hook checks before permitting a `creator_id` change. (Harmless for the
    ;; archive action, whose update-map never touches creator_id.)
    (t2/with-transaction [_conn]
      (let [before (-> (notification.db/card-notifications ids)
                       models.notification/hydrate-notification
                       vec)]
        (notification.db/update-card-notifications! ids update-map)
        before))))

(api.macros/defendpoint :post "/bulk" :- ::bulk-response
  "Bulk-archive or -change-creator a set of notifications. The per-notification `:active` flip goes
  through `:model/Notification`'s `before-update` hook, which creates / tears down the Quartz
  triggers. Recipient emails and `:event/notification-update` audit events are
  published via the shared [[notification-api/publish-notification-update!]] helper so this
  endpoint's side-effect contract can't drift from `PUT /api/notification/:id`."
  [_route _query
   {:keys [notification_ids action creator_id]} :-
   [:map
    [:notification_ids [:sequential {:min 1} ms/PositiveInt]]
    [:action           [:enum "archive" "change-creator"]]
    [:creator_id       {:optional true} ms/PositiveInt]]]
  (api/check-superuser)
  (let [update-map (action->update-map action creator_id)
        before     (bulk-update! update-map notification_ids)
        after      (->> (notification.db/notifications-by-id (mapv :id before))
                        models.notification/hydrate-notification
                        (m/index-by :id))]
    (doseq [b    before
            :let [a (get after (:id b))]
            :when a]
      (notification-api/publish-notification-update! a b))
    {:updated (count before)}))
