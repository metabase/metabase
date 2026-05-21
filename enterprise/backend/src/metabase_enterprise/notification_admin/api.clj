(ns metabase-enterprise.notification-admin.api
  "Admin endpoints for notifications (card-type alerts). Gated behind the `:audit-app` feature flag
  and `check-superuser`. Each row carries `:last_check` (latest scheduler tick — any terminal
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
   [metabase.notification.api :as notification-api]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; String-literal constants — hoisted to avoid scattered raw strings
;; ---------------------------------------------------------------------------

(def ^:private run-type-alert          "alert")
(def ^:private entity-type-card        "card")
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
    (->> (t2/select [:model/NotificationRecipient :notification_handler_id :details]
                    :type :notification-recipient/raw-value)
         (into #{}
               (comp (filter #(some-> % :details :value u/lower-case-en (= lower-email)))
                     (map :notification_handler_id))))))

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
  "`%foo%` substring pattern with the input lowercased."
  [s]
  (str "%" (u/lower-case-en s) "%"))

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

(defn- latest-run-per-card
  "Honey.sql subquery: one row per card with the most recent terminal alert-type TaskRun
  (status :success / :failed / :abandoned) within [[run-lookback-days]]. Excludes :started
  in-flight runs — they shouldn't surface as a `last_check`. Uses
  `ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY started_at DESC)`."
  []
  {:select [:id :entity_id :status :started_at :ended_at]
   :from   [[{:select [:id :entity_id :status :started_at :ended_at
                       [[:over [[:row_number]
                                {:partition-by [:entity_id]
                                 :order-by     [[:started_at :desc]]}]]
                        :rn]]
              :from   [:task_run]
              :where  [:and
                       [:= :run_type run-type-alert]
                       [:= :entity_type entity-type-card]
                       [:in :status terminal-statuses]
                       [:> :started_at (lookback-cutoff)]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(defn- latest-send-tick-per-card
  "Honey.sql subquery: one row per card summarising the LATEST tick that had channel-send
  attempts within [[run-lookback-days]].

  Strategy (cross-dialect — no JSON, no SUM/aggregate type issues):
    1. Inner subquery `lr` — rank `task_run` rows that have at least one `channel-send`
       child, by `started_at DESC` per card.  Keep only rank=1 (the latest send-tick).
    2. Outer query — expose `entity_id` and `started_at`, plus `has_failure`: 1 if ANY
       channel-send row under that run has status='failed', 0 otherwise.  Uses a correlated
       EXISTS rather than GROUP BY + SUM to stay H2/Postgres/MySQL compatible.

  Result columns:
    - `:entity_id`   — card ID (join key used by base-list-query)
    - `:started_at`  — the tick's started_at (for sort + `:last_send.at`)
    - `:has_failure` — 1 if any channel-send in the tick failed, 0 otherwise

  Note: `:last_send` on the list endpoint is card-level (not per-notification). Per-notification
  filtering is handled in `send-history-for-notification` on the detail page."
  []
  (let [lookback (lookback-cutoff)]
    {:select [:lr.entity_id
              [:lr.tick_started_at :started_at]
              [[:case
                [:exists {:select [[1]]
                          :from   [[:task_history :tf]]
                          :where  [:and
                                   [:= :tf.run_id :lr.run_id]
                                   [:= :tf.task task-channel-send]
                                   [:= :tf.status "failed"]]}]
                1
                :else 0]
               :has_failure]]
     :from   [[{:select [:tr2.entity_id
                         [:tr2.id         :run_id]
                         [:tr2.started_at :tick_started_at]
                         [[:over [[:row_number]
                                  {:partition-by [:tr2.entity_id]
                                   :order-by     [[:tr2.started_at :desc]]}]]
                          :rn]]
                :from   [[:task_run :tr2]]
                :where  [:and
                         [:= :tr2.run_type run-type-alert]
                         [:= :tr2.entity_type entity-type-card]
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

(defn- base-list-query
  "Select notifications plus run-summary columns, card name, and creator name computed inline.

  When `skip-run-joins?` is true (detail path only), the `lc`/`ls` window subqueries and their
  select columns are omitted — the detail endpoint overwrites `last_check`/`last_send` from
  per-notification histories anyway, so those joins are pure waste on that path."
  [{:keys [active creator_id creator_active creatorless card_id recipient_email channel last_send_status query
           skip-run-joins?]}]
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
                            [:ls.started_at                                    :ls_started_at]
                            [:ls.has_failure                                   :ls_has_failure]]))
           :from   [:notification]
           :where  [:= :notification.payload_type "notification/card"]}

    ;; These joins are always present regardless of the path.
    true
    (-> (sql.helpers/left-join [:notification_card :nc] [:= :nc.id :notification.payload_id])
        (sql.helpers/left-join [:report_card :c]        [:= :c.id :nc.card_id])
        (sql.helpers/left-join [:core_user :cu]         [:= :cu.id :notification.creator_id]))

    ;; Window subquery joins — skipped on the detail path (see docstring).
    (not skip-run-joins?)
    (-> (sql.helpers/left-join [(latest-run-per-card)       :lc] [:= :lc.entity_id :nc.card_id])
        (sql.helpers/left-join [(latest-send-tick-per-card) :ls] [:= :ls.entity_id :nc.card_id]))

    (some? active)
    (sql.helpers/where [:= :notification.active active])

    (some? creator_active)
    (sql.helpers/where [:= :cu.is_active creator_active])

    ;; `creatorless` = true:  no creator at all, OR a deactivated creator (both are "creatorless")
    ;; `creatorless` = false: has a live (active) creator
    ;; Use [:= col nil] for IS NULL and [:is-not col nil] for IS NOT NULL per HoneySQL 2 semantics.
    (true? creatorless)
    (sql.helpers/where [:or
                        [:= :notification.creator_id nil]
                        [:= :cu.is_active false]])

    (false? creatorless)
    (sql.helpers/where [:and
                        [:is-not :notification.creator_id nil]
                        [:= :cu.is_active true]])

    creator_id
    (sql.helpers/where [:= :notification.creator_id creator_id])

    card_id
    (sql.helpers/where [:= :nc.card_id card_id])

    (seq channel)
    (sql.helpers/where (channel-exists channel))

    last_send_status
    (sql.helpers/where (case last_send_status
                         :successful [:= :ls.has_failure 0]
                         :failing    [:= :ls.has_failure 1]))

    recipient_email
    (sql.helpers/where
     (let [ids (notification-ids-with-recipient-email recipient_email)]
       (if (seq ids) [:in :notification.id ids] [:= 1 0])))

    (not (str/blank? query))
    (sql.helpers/where (query-where-clause query))))

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
       :error  (when (= run-status :failing) error)
       :status run-status})))

(defn- coerce-status
  [status]
  (some-> status keyword))

(defn- error-by-run-id
  "Given a set of failed run IDs (from the page's `lc.id`s), return a map run_id → error message.
  One SQL query, latest failed task_history row per run wins. Avoids cross-dialect JSON SQL by
  letting toucan deserialize `task_details` and reading `:message` in Clojure."
  [run-ids]
  (when (seq run-ids)
    (->> (t2/select [:model/TaskHistory :run_id :task_details :ended_at]
                    {:where    [:and
                                [:in :run_id run-ids]
                                [:in :status ["failed"]]]
                     :order-by [[:ended_at :desc]]})
         (reduce (fn [acc {:keys [run_id task_details]}]
                   (if (contains? acc run_id)
                     acc
                     (assoc acc run_id (:message task_details))))
                 {}))))

(defn- has-failure?
  "True when a `has_failure` value from the `latest-send-tick-per-card` subquery indicates at
  least one channel failure.  H2 returns CASE expressions as strings ('0'/'1'); Postgres returns
  integers (0/1).  We coerce with `not=` against zero/\"0\" to handle both."
  [v]
  (and v (not= 0 v) (not= "0" (str v))))

(defn- decorate-runs
  "Build :last_check / :last_send maps on each row from the joined run columns + a one-shot
  task_history fetch for any failed/abandoned runs on the page (for last_check error messages).

  :last_send is built from the per-tick rollup columns ls_started_at / ls_has_failure.
  It carries no error string at the list level — error detail lives on the detail page.
  :last_send is nil when ls_started_at is nil (no send ever attempted for this card)."
  [rows]
  (let [failed-run-ids (into #{} (keep (fn [{:keys [lc_id lc_status]}]
                                         (when (#{"failed" "abandoned"} lc_status) lc_id)))
                             rows)
        run->error     (error-by-run-id failed-run-ids)]
    (mapv (fn [{:keys [lc_id lc_status lc_started_at
                       ls_started_at ls_has_failure] :as row}]
            (-> row
                (assoc :last_check (run->summary {:status (coerce-status lc_status)
                                                  :at     lc_started_at
                                                  :error  (get run->error lc_id)}))
                (assoc :last_send  (when ls_started_at
                                     {:at     ls_started_at
                                      :error  nil
                                      :status (if (has-failure? ls_has_failure)
                                                :failing
                                                :successful)}))
                (dissoc :lc_id :lc_status :lc_started_at
                        :ls_started_at :ls_has_failure)))
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
  notification's card (`successful` = latest channel-send succeeded; `failing` = latest
  channel-send failed). The Failing tab uses `?last_send_status=failing`.

  `creatorless=true` selects notifications with no creator or a deactivated creator (the Ownerless
  tab). `creatorless=false` selects the inverse.

  `channel` accepts a single string or a repeated query param for multi-select (OR logic)."
  [_route
   {:keys [active creator_id creator_active creatorless card_id recipient_email channel last_send_status
           query sort_column sort_direction]} :-
   [:map
    [:active            {:optional true} [:maybe ms/BooleanValue]]
    [:creator_id        {:optional true} ms/PositiveInt]
    [:creator_active    {:optional true} [:maybe ms/BooleanValue]]
    [:creatorless       {:optional true} [:maybe ms/BooleanValue]]
    [:card_id           {:optional true} ms/PositiveInt]
    [:recipient_email   {:optional true} ms/NonBlankString]
    [:channel           {:optional true} [:maybe [:or ms/NonBlankString [:sequential ms/NonBlankString]]]]
    [:last_send_status  {:optional true} ::run-status]
    [:query             {:optional true} ms/NonBlankString]
    [:sort_column       {:default :last_send} ::sort-column]
    [:sort_direction    {:default :desc}      ::sort-direction]]]
  (api/check-superuser)
  (list-notifications {:limit            (or (request/limit) 50)
                       :offset           (or (request/offset) 0)
                       :active           active
                       :creator_id       creator_id
                       :creator_active   creator_active
                       :creatorless      creatorless
                       :card_id          card_id
                       :recipient_email  recipient_email
                       :channel          channel
                       :last_send_status last_send_status
                       :query            query
                       :sort_column      sort_column
                       :sort_direction   sort_direction}))

;; ---------------------------------------------------------------------------
;; Detail endpoint helpers
;; ---------------------------------------------------------------------------

(defn- task-history-rows-for-card
  "Shared base query used by both `check-history-for-notification` and
  `send-history-for-notification`. Returns up to `row-cap` task_history rows for `card-id`
  within the lookback window, joined to task_run for tick metadata.

  `task-name`    — `:task` value to filter on (task-notification-send or task-channel-send).
  `extra-select` — additional HoneySQL select columns beyond the shared base set.
  `extra-where`  — optional additional HoneySQL WHERE clause (e.g. terminal-status filter)."
  [card-id task-name extra-select
   & {:keys [row-cap extra-where] :or {row-cap 500}}]
  (t2/select :model/TaskHistory
             {:select    (into [:th.run_id :th.task_details
                                [:tr.id         :task_run_id]
                                [:tr.status     :run_status]
                                [:tr.started_at :run_started_at]]
                               extra-select)
              :from      [[:task_history :th]]
              :join      [[:task_run :tr] [:= :tr.id :th.run_id]]
              :where     (cond-> [:and
                                  [:= :tr.run_type    run-type-alert]
                                  [:= :tr.entity_type entity-type-card]
                                  [:= :tr.entity_id   card-id]
                                  [:= :th.task        task-name]
                                  [:> :tr.started_at  (lookback-cutoff)]]
                           extra-where (conj extra-where))
              :order-by  [[:tr.started_at :desc]]
              :limit     row-cap}))

(defn- check-history-for-notification
  "Up to 10 most-recent terminal alert-type TaskRuns for `notification-id`, newest first.
  Filtered per-notification: we JOIN task_run → task_history (task=notification-send) with a
  row cap of 500 applied at the DB level, then in Clojure we keep only rows whose notification_id
  matches.  Returns a vector of `::run-summary` maps.

  Row-cap skew caveat: the 500-row cap is applied before the Clojure-side notification_id filter.
  For a card with many notifications and many ticks this cap ensures the query stays bounded, but
  it means very old ticks may be excluded.  In practice notifications don't accumulate tens of
  thousands of rows within the 90-day window."
  [card-id notification-id & {:keys [row-cap result-limit] :or {row-cap 500 result-limit 10}}]
  (let [rows      (task-history-rows-for-card card-id task-notification-send
                                              [:th.status]
                                              :row-cap    row-cap
                                              :extra-where [:in :tr.status terminal-statuses])
        matching  (into []
                        (comp
                         (filter (fn [{:keys [task_details]}]
                                   (= notification-id (:notification_id task_details))))
                         (take result-limit))
                        rows)
        failed-ids (into #{} (keep #(when (#{"failed" "abandoned"} (:run_status %)) (:task_run_id %)) matching))
        errors     (error-by-run-id failed-ids)]
    (mapv (fn [{:keys [task_run_id run_status run_started_at]}]
            (run->summary {:status (coerce-status run_status)
                           :at     run_started_at
                           :error  (get errors task_run_id)}))
          matching)))

(defn- ->channel-entry
  "Build a single `::channel-entry` from a channel-send task_history row."
  [{:keys [status task_details]}]
  (let [status-kw    (coerce-status status)
        run-status   (coerce-run-status (or status-kw :failed))
        channel-type (some-> task_details :channel_type keyword)]
    {:channel_type (or channel-type :channel/unknown)
     :status       run-status
     :error        (when (= run-status :failing)
                     (:message task_details))}))

(defn- send-history-for-notification
  "Per-tick send history for `notification-id`, newest tick first, up to `result-limit` ticks.

  Strategy (per-notification, per-tick):
    1. Pull up to `row-cap` channel-send rows for `card-id` within the lookback window,
       joined to task_run for the tick timestamp.  The card-level prefilter keeps the query
       bounded on the DB side.
    2. In Clojure: keep rows where notification_id matches.
    3. Rows are sorted by run started_at DESC, so all rows of one tick are adjacent —
       group with partition-by :run_id, take result-limit groups.
    4. Per group build one `::tick-send-entry`:
       - :at      — task_run.started_at for that tick
       - :status  — :successful iff every channel row succeeded; :failing if any failed
       - :error   — first error message from the failing channels, or nil
       - :channels — vector of ::channel-entry (one per channel-send row in the group)

  Goal-not-met ticks (no channel-send rows) are absent — they appear in check_history only."
  [card-id notification-id & {:keys [row-cap result-limit] :or {row-cap 500 result-limit 10}}]
  (let [rows     (task-history-rows-for-card card-id task-channel-send
                                             [:th.status]
                                             :row-cap row-cap)
        matching (filterv (fn [{:keys [task_details]}]
                            (= notification-id (:notification_id task_details)))
                          rows)]
    ;; Rows are sorted DESC by run_started_at; all rows of one tick are adjacent.
    (->> (partition-by :run_id matching)
         (take result-limit)
         (mapv (fn [tick-rows]
                 (let [at              (:run_started_at (first tick-rows))
                       channel-entries (mapv ->channel-entry tick-rows)
                       any-failing?    (some #(= :failing (:status %)) channel-entries)
                       first-error     (some :error channel-entries)]
                   {:at       at
                    :status   (if any-failing? :failing :successful)
                    :error    first-error
                    :channels channel-entries}))))))

(defn- get-notification-detail
  "Fetch a single card-type notification with `:last_check`, `:last_send`, `:check_history`,
  and `:send_history`. Returns nil if the notification doesn't exist or isn't a card-type
  notification.

  `:check_history` — up to 10 most-recent terminal alert-type TaskRuns for THIS notification
  (filtered by notification_id in task_details), newest first, each `::run-summary`.

  `:send_history` — up to 10 most-recent send ticks for THIS notification, rolled up across
  all channels per tick, newest tick first, each `::tick-send-entry`.

  `last_check` and `last_send` on the detail response are derived from the first entries of
  the computed histories so the detail page is internally consistent and per-notification
  (not subject to card-level bleed from other notifications sharing the same card).

  The window subquery joins (`lc`/`ls`) are skipped via `:skip-run-joins?` — the detail path
  overwrites last_check/last_send from the per-notification histories anyway."
  [id]
  (when-let [row (t2/select-one :model/Notification
                                (-> (base-list-query {:skip-run-joins? true})
                                    (sql.helpers/where [:= :notification.id id])))]
    (let [decorated      (-> [row]
                             ;; decorate-runs produces nil last_check/last_send when lc_*/ls_*
                             ;; columns are absent — that's fine; we overwrite them below.
                             decorate-runs
                             models.notification/hydrate-notification
                             first
                             splice-creator-active)
          card-id        (get-in decorated [:payload :card_id])
          check-history  (if card-id (check-history-for-notification card-id id) [])
          send-history   (if card-id (send-history-for-notification card-id id) [])
          ;; Derive last_check / last_send from the per-notification histories so the detail
          ;; page is self-consistent and not influenced by other notifications on the same card.
          last-check     (first check-history)
          last-send      (some-> (first send-history) (select-keys [:at :status :error]))]
      (assoc decorated
             :last_check    last-check
             :last_send     last-send
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
      before)))

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
