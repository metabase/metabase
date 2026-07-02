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
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.notification.api.notification :as notification-api]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
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
          (t2/reducible-select [:model/NotificationRecipient :notification_handler_id :details]
                               :type :notification-recipient/raw-value))))

(defn- notification-ids-with-recipient-email
  "Notification IDs whose recipients (user or raw-value) match `email` exactly. One SQL query
  unions both paths: user-recipients via an indexed `core_user.email` equality, raw-value
  recipients via a pre-resolved set of handler IDs from an in-memory scan."
  [email]
  (let [lower-email     (u/lower-case-en email)
        raw-handler-ids (handler-ids-with-raw-value-matching email)
        user-clause     [:and
                         [:= :nr.type "notification-recipient/user"]
                         [:= [:lower :cu.email] lower-email]]
        where-clause    (if (seq raw-handler-ids)
                          [:or user-clause [:in :notification_handler.id raw-handler-ids]]
                          user-clause)]
    (t2/select-fn-set
     :notification_id (t2/table-name :model/NotificationHandler)
     {:join      [[(t2/table-name :model/NotificationRecipient) :nr]
                  [:= :nr.notification_handler_id :notification_handler.id]]
      :left-join [[:core_user :cu] [:= :cu.id :nr.user_id]]
      :where     where-clause})))

(defn- wildcard-string
  "`%foo%` substring pattern with the input lowercased and LIKE metacharacters (`\\`, `%`, `_`)
  escaped so they match literally rather than as wildcards. Relies on the default `\\` LIKE escape
  character, which H2, Postgres, and MySQL all share."
  [s]
  (let [escaped (-> (u/lower-case-en s)
                    (str/replace "\\" "\\\\")
                    (str/replace "_" "\\_")
                    (str/replace "%" "\\%"))]
    (str "%" escaped "%")))

(defn- query-where-clause
  "WHERE clause for the fuzzy `?query=` filter. Substring ILIKE OR'd across card name and creator
  first/last/email. Recipient branches were removed in the design iteration — recipients stay as
  the structured `?recipient_email=` filter."
  [query]
  (let [wildcard (wildcard-string query)]
    [:or
     [:like [:lower :c.name]        wildcard]
     [:like [:lower :cu.first_name] wildcard]
     [:like [:lower :cu.last_name]  wildcard]
     [:like [:lower :cu.email]      wildcard]]))

(def ^:private run-lookback-days
  "How far back to consider alert-type TaskRuns / TaskHistory rows when computing run summaries."
  90)

(defn- lookback-cutoff []
  (h2x/add-interval-honeysql-form (mdb/db-type) (mi/now) (- run-lookback-days) :day))

(defn- latest-run-per-notification
  "Honey.sql subquery: one row per notification with its most recent terminal alert-type TaskRun
  (status :success / :failed / :abandoned) within [[run-lookback-days]]. Excludes :started in-flight
  runs (they shouldn't surface as a `last_check`) and runs with no `notification_id` (unattributable,
  e.g. created before that column existed). Uses
  `ROW_NUMBER() OVER (PARTITION BY notification_id ORDER BY started_at DESC)`."
  []
  {:select [:id :notification_id :status :started_at :ended_at]
   :from   [[{:select [:id :notification_id :status :started_at :ended_at
                       [[:over [[:row_number]
                                {:partition-by [:notification_id]
                                 :order-by     [[:started_at :desc]]}]]
                        :rn]]
              :from   [:task_run]
              :where  [:and
                       [:= :run_type run-type-alert]
                       [:is-not :notification_id nil]
                       [:in :status terminal-statuses]
                       [:> :started_at (lookback-cutoff)]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(defn- latest-send-tick-per-notification
  "Honey.sql subquery: one row per notification summarising the LATEST tick that had channel-send
  attempts within [[run-lookback-days]]. The inner subquery ranks each notification's runs that have
  a channel-send child by `started_at DESC` and keeps rank=1; the outer computes `has_failure` with
  a correlated EXISTS rather than GROUP BY + SUM, to stay H2/Postgres/MySQL compatible.

  Result columns:
    - `:notification_id` — join key used by base-list-query
    - `:id`          — task_run.id of the latest send tick (for looking up channel-send error msg)
    - `:started_at`  — the tick's started_at (for sort + `:last_send.at`)
    - `:has_failure` — true if any channel-send in the tick failed"
  []
  (let [lookback (lookback-cutoff)]
    {:select [:lr.notification_id
              [:lr.run_id          :id]
              [:lr.tick_started_at :started_at]
              ;; Boolean CASE, read back in Clojure — same pattern as
              ;; `metabase.search.in-place.legacy/bookmark-col`. `has-failure?` runs it through
              ;; `bit->boolean` to absorb the MySQL/MariaDB bit-vs-boolean JDBC quirk.
              [[:case
                [:exists {:select [[1]]
                          :from   [[:task_history :tf]]
                          :where  [:and
                                   [:= :tf.run_id :lr.run_id]
                                   [:= :tf.task task-channel-send]
                                   [:= :tf.status "failed"]]}]
                true
                :else false]
               :has_failure]]
     :from   [[{:select [:tr2.notification_id
                         [:tr2.id         :run_id]
                         [:tr2.started_at :tick_started_at]
                         [[:over [[:row_number]
                                  {:partition-by [:tr2.notification_id]
                                   :order-by     [[:tr2.started_at :desc]]}]]
                          :rn]]
                :from   [[:task_run :tr2]]
                :where  [:and
                         [:= :tr2.run_type run-type-alert]
                         [:is-not :tr2.notification_id nil]
                         [:in :tr2.status terminal-statuses]
                         [:> :tr2.started_at lookback]
                         ;; only keep runs that actually had channel-send rows
                         [:exists {:select [[1]]
                                   :from   [[:task_history :tx]]
                                   :where  [:and
                                            [:= :tx.run_id :tr2.id]
                                            [:= :tx.task task-channel-send]]}]]}
               :lr]]
     :where [:= :lr.rn 1]}))

(def ^:private sort-column->order-by
  "Maps the public `sort_column` enum to the SQL expression used in `ORDER BY`. Uses raw
  expressions rather than the SELECT aliases because H2 does not resolve aliases inside
  expressions. Whitelist; values outside this map are rejected by the `::sort-column` malli enum
  upstream."
  {:id           :notification.id
   :last_send    :ls.started_at
   :last_check   :lc.started_at
   :card_name    :c.name
   :creator_name [:coalesce :cu.last_name :cu.first_name :cu.email]
   :updated_at   :notification.updated_at})

(defn- channel-exists
  "Honey `EXISTS` correlated with `:notification.id`: TRUE when the notification has at least one
  handler whose channel_type is IN `channels`. Accepts either a single string or a vector of
  strings (OR semantics across multiple channel types). Subquery instead of JOIN so the outer
  query needs no `DISTINCT`."
  [channels]
  (let [channels (if (sequential? channels) channels [channels])]
    [:exists
     {:select [[1]]
      :from   [(t2/table-name :model/NotificationHandler)]
      :where  [:and
               [:= :notification_handler.notification_id :notification.id]
               [:in :notification_handler.channel_type channels]]}]))

(defn- list-where-clauses
  "Optional WHERE clauses for the list/detail query, returned as data (a seq with inactive filters
  elided) so `base-list-query` can `(reduce sql.helpers/where ...)` them onto the query."
  [{:keys [active creator_id creator_active creatorless card_id recipient_email channel
           last_send_status last_check_status query]}]
  (keep
   identity
   [(when (some? active)         [:= :notification.active active])
    (when (some? creator_active) [:= :cu.is_active creator_active])
    ;; `creatorless` = true:  no creator at all, OR a deactivated creator (both are "creatorless")
    ;; `creatorless` = false: has a live (active) creator
    ;; [:= col nil] is IS NULL and [:is-not col nil] is IS NOT NULL per HoneySQL 2 semantics.
    (when (true? creatorless)
      [:or [:= :notification.creator_id nil] [:= :cu.is_active false]])
    (when (false? creatorless)
      [:and [:is-not :notification.creator_id nil] [:= :cu.is_active true]])
    (when creator_id    [:= :notification.creator_id creator_id])
    (when card_id       [:= :nc.card_id card_id])
    (when (seq channel) (channel-exists channel))
    (when last_send_status
      (case last_send_status
        :successful [:= :ls.has_failure false]
        :failing    [:= :ls.has_failure true]))
    ;; `last_check` is the whole-run rollup (success/failed/abandoned), so it's a superset of
    ;; `last_send`: it catches query failures and heartbeat-abandoned runs that never reached the
    ;; channel-send step, not just delivery failures. The Failing tab filters on this.
    (when last_check_status
      (case last_check_status
        :successful [:= :lc.status "success"]
        :failing    [:in :lc.status ["failed" "abandoned"]]))
    (when recipient_email
      (let [ids (notification-ids-with-recipient-email recipient_email)]
        ;; No recipient matched → an always-false predicate so the page comes back empty. We use
        ;; the truthy `[:= 1 0]` (renders `WHERE 1 = 0`) rather than `false`/`nil`, which the
        ;; `keep identity` above would elide — turning "no matches" into "no filter".
        (if (seq ids) [:in :notification.id ids] [:= 1 0])))
    (when-not (str/blank? query) (query-where-clause query))]))

(defn- base-list-query
  "Select notifications plus run-summary columns, card name, and creator name computed inline.

  When `skip-run-joins?` is true (detail path only), the `lc`/`ls` window subqueries and their
  select columns are omitted — the detail endpoint overwrites `last_check`/`last_send` from
  per-notification histories anyway, so those joins are pure waste on that path."
  [{:keys [skip-run-joins?] :as filters}]
  (reduce
   sql.helpers/where
   (cond-> {:select (cond-> [:notification.id
                             :notification.active
                             :notification.creator_id
                             :notification.created_at
                             :notification.updated_at
                             :notification.payload_type
                             :notification.payload_id
                             [:c.name                                           :card_name]
                             [:cu.is_active                                     :creator_is_active]
                             [[:coalesce :cu.last_name :cu.first_name :cu.email] :creator_name]]
                      (not skip-run-joins?)
                      (into [[:lc.id                                            :lc_id]
                             [:lc.status                                        :lc_status]
                             [:lc.started_at                                    :lc_started_at]
                             [:ls.id                                            :ls_id]
                             [:ls.started_at                                    :ls_started_at]
                             [:ls.has_failure                                   :ls_has_failure]]))
            :from   [:notification]
            ;; A `notification/card` row with no payload_id is orphaned — it has no card, so
            ;; every card-derived column is null and it can't be managed here. Exclude it.
            :where  [:and
                     [:= :notification.payload_type "notification/card"]
                     [:is-not :notification.payload_id nil]]}

     ;; These joins are always present regardless of the path.
     true
     (-> (sql.helpers/left-join [:notification_card :nc] [:= :nc.id :notification.payload_id])
         (sql.helpers/left-join [:report_card :c]        [:= :c.id :nc.card_id])
         (sql.helpers/left-join [:core_user :cu]         [:= :cu.id :notification.creator_id]))

     ;; Window subquery joins — skipped on the detail path (see docstring). Keyed by notification_id
     ;; so each notification gets exactly its own latest run, not the card's (which would bleed
     ;; across every notification sharing the card).
     (not skip-run-joins?)
     (-> (sql.helpers/left-join [(latest-run-per-notification)       :lc] [:= :lc.notification_id :notification.id])
         (sql.helpers/left-join [(latest-send-tick-per-notification) :ls] [:= :ls.notification_id :notification.id])))
   (list-where-clauses filters)))

(defn- order-by-clauses
  "Resolve `sort_column` + `sort_direction` (both already malli-validated enums) into an
  honeysql `:order-by` vector. Pushes nulls last unconditionally — H2/Postgres/MySQL all default
  to NULLS-FIRST under DESC. Always tie-breaks on `notification.id desc` so paging is stable."
  [sort-column sort-direction]
  (let [col (sort-column->order-by sort-column)
        dir (or sort-direction :desc)]
    [[[:case [:= col nil] 1 :else 0] :asc]
     [col dir]
     [:notification.id :desc]]))

(defn- list-query
  [{:keys [sort_column sort_direction] :as filters}]
  (assoc (base-list-query (dissoc filters :sort_column :sort_direction))
         :order-by (order-by-clauses (or sort_column :last_send) sort_direction)))

(defn- count-query
  [filters]
  (-> (list-query filters)
      (assoc :select [[[:count :notification.id] :count]])
      (dissoc :order-by)))

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
    (->> (t2/select :model/TaskHistory
                    {:select [:run_id :task_details]
                     :from   [[{:select [:run_id :task_details
                                         [[:over [[:row_number]
                                                  {:partition-by [:run_id]
                                                   :order-by     [[[:case
                                                                    [:= :task task-notification-send] 0
                                                                    :else                             1] :asc]
                                                                  [:ended_at :desc]]}]]
                                          :rn]]
                                :from   [:task_history]
                                :where  (cond-> [:and
                                                 [:in :run_id run-ids]
                                                 [:in :status ["failed" "abandoned"]]]
                                          task-name (conj [:= :task task-name]))}
                               :sub]]
                     :where  [:= :sub.rn 1]})
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
  [{:keys [limit offset] :as filters}]
  (let [base-filters (dissoc filters :limit :offset)
        page-rows    (t2/select :model/Notification
                                (assoc (list-query base-filters)
                                       :limit  limit
                                       :offset offset))
        total        (or (:count (t2/query-one (count-query base-filters))) 0)
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
  (let [runs       (t2/select [:model/TaskRun :id :status :started_at]
                              {:where    [:and
                                          [:= :run_type run-type-alert]
                                          [:= :notification_id notification-id]
                                          [:in :status terminal-statuses]
                                          [:> :started_at (lookback-cutoff)]]
                               :order-by [[:started_at :desc] [:id :desc]]
                               :limit    result-limit})
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
        (t2/reducible-select :model/TaskHistory
                             {:select   [:th.run_id :th.task_details :th.status
                                         [:tr.started_at :run_started_at]]
                              :from     [[:task_history :th]]
                              :join     [[:task_run :tr] [:= :tr.id :th.run_id]]
                              :where    [:and
                                         [:= :tr.run_type        run-type-alert]
                                         [:= :tr.notification_id notification-id]
                                         [:= :th.task            task-channel-send]
                                         [:> :tr.started_at      (lookback-cutoff)]]
                              ;; tr.id tie-breaks runs sharing a started_at so partition-by run_id
                              ;; keeps each run's rows adjacent.
                              :order-by [[:tr.started_at :desc] [:tr.id :desc]]
                              ;; safety cap; the (take result-limit) over partition-by run_id
                              ;; normally closes the cursor first.
                              :limit    500})))

(defn- get-notification-detail
  "Fetch a single card-type notification with `:last_check`, `:last_send`, `:check_history`, and
  `:send_history`, each attributed to THIS notification via `task_run.notification_id`. Returns nil
  for a missing or non-card notification."
  [id]
  (when-let [row (t2/select-one :model/Notification
                                (-> (base-list-query {:skip-run-joins? true})
                                    (sql.helpers/where [:= :notification.id id])))]
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
      (let [before (-> (t2/select :model/Notification
                                  :id           [:in ids]
                                  :payload_type :notification/card)
                       models.notification/hydrate-notification
                       vec)]
        (t2/update! :model/Notification
                    :id           [:in ids]
                    :payload_type :notification/card
                    update-map)
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
        after      (->> (t2/select :model/Notification :id [:in (mapv :id before)])
                        models.notification/hydrate-notification
                        (m/index-by :id))]
    (doseq [b    before
            :let [a (get after (:id b))]
            :when a]
      (notification-api/publish-notification-update! a b))
    {:updated (count before)}))
