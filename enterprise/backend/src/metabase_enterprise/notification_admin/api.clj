(ns metabase-enterprise.notification-admin.api
  "Admin endpoints for notifications (card-type alerts). Gated behind the `:audit-app` feature flag
  and `check-superuser`. Each row carries `:last_check` (latest scheduler tick — any terminal
  outcome) and `:last_sent` (latest successful delivery) computed from a windowed `task_run`
  subquery; both expose `{at, error, status}`. The owner rename (`creator_id` → `owner_id`,
  `creator_name` → `owner_name`) is API-surface-only — the underlying `notification.creator_id`
  column and hydrated `:creator` map stay; we rename keys at the response boundary."
  (:require
   [clojure.set :as set]
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

(mr/def ::run-status
  [:enum :failing :successful])

(mr/def ::run-summary
  [:map {:closed true}
   [:at     ms/TemporalInstant]
   [:error  [:maybe :string]]
   [:status ::run-status]])

(mr/def ::sort-column
  [:enum :last_sent :card_name :owner_name :updated_at])

(mr/def ::sort-direction
  [:enum :asc :desc])

(mr/def ::list-row
  [:map
   [:id           ms/PositiveInt]
   [:active       :boolean]
   [:owner_id     [:maybe ms/PositiveInt]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]
   [:payload_type :keyword]
   [:payload_id   [:maybe ms/PositiveInt]]
   [:last_check   [:maybe ::run-summary]]
   [:last_sent    [:maybe ::run-summary]]])

(mr/def ::list-response
  [:map
   [:data   [:sequential ::list-row]]
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  [:maybe ms/PositiveInt]]
   [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::detail-response ::list-row)

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
  "WHERE clause for the fuzzy `?query=` filter. Substring ILIKE OR'd across card name and owner
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
  "How far back to consider alert-type TaskRuns when computing `last_check` / `last_sent`."
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
                       [:= :run_type "alert"]
                       [:= :entity_type "card"]
                       [:in :status ["success" "failed" "abandoned"]]
                       [:> :started_at (lookback-cutoff)]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(defn- latest-success-per-card
  "Latest *successful* alert-type TaskRun per card within [[run-lookback-days]]. Powers
  `:last_sent` — the latest actually-delivered run, not the latest attempt."
  []
  {:select [:entity_id :ended_at]
   :from   [[{:select [:entity_id :ended_at
                       [[:over [[:row_number]
                                {:partition-by [:entity_id]
                                 :order-by     [[:ended_at :desc]]}]]
                        :rn]]
              :from   [:task_run]
              :where  [:and
                       [:= :run_type "alert"]
                       [:= :entity_type "card"]
                       [:= :status "success"]
                       [:> :started_at (lookback-cutoff)]]}
             :sub]]
   :where  [:= :sub.rn 1]})

(def ^:private sort-column->order-by
  "Maps the public `sort_column` enum to the SQL expression used in `ORDER BY`. Uses raw
  expressions rather than the SELECT aliases because H2 does not resolve aliases inside
  expressions. Whitelist; values outside this map are rejected by the `::sort-column` malli enum
  upstream."
  {:last_sent  :ls.ended_at
   :card_name  :c.name
   :owner_name [:coalesce :cu.last_name :cu.first_name :cu.email]
   :updated_at :notification.updated_at})

(defn- channel-exists
  "Honey `EXISTS` correlated with `:notification.id`: TRUE when the notification has at least one
  handler for this channel. Subquery instead of JOIN so the outer query needs no `DISTINCT`."
  [channel]
  [:exists
   {:select [[1]]
    :from   [(t2/table-name :model/NotificationHandler)]
    :where  [:and
             [:= :notification_handler.notification_id :notification.id]
             [:= :notification_handler.channel_type channel]]}])

(defn- base-list-query
  "Select notifications plus run-summary columns, card name, and owner name computed inline. The
  `lc` / `ls` joins run unconditionally so the response always carries `:last_check` /
  `:last_sent` even when the user is filtering on something else."
  [{:keys [active owner_id owner_active card_id recipient_email channel last_sent_status query]}]
  (cond-> {:select [:notification.id
                    :notification.active
                    :notification.creator_id
                    :notification.created_at
                    :notification.updated_at
                    :notification.payload_type
                    :notification.payload_id
                    [:lc.id                                            :lc_id]
                    [:lc.status                                        :lc_status]
                    [:lc.started_at                                    :lc_started_at]
                    [:ls.ended_at                                      :ls_ended_at]
                    [:c.name                                           :card_name]
                    [:cu.is_active                                     :owner_is_active]
                    [[:coalesce :cu.last_name :cu.first_name :cu.email] :owner_name]]
           :from   [:notification]
           :where  [:= :notification.payload_type "notification/card"]}

    true
    (-> (sql.helpers/left-join [:notification_card :nc] [:= :nc.id :notification.payload_id])
        (sql.helpers/left-join [:report_card :c]        [:= :c.id :nc.card_id])
        (sql.helpers/left-join [:core_user :cu]         [:= :cu.id :notification.creator_id])
        (sql.helpers/left-join [(latest-run-per-card)     :lc] [:= :lc.entity_id :nc.card_id])
        (sql.helpers/left-join [(latest-success-per-card) :ls] [:= :ls.entity_id :nc.card_id]))

    (some? active)
    (sql.helpers/where [:= :notification.active active])

    (some? owner_active)
    (sql.helpers/where [:= :cu.is_active owner_active])

    owner_id
    (sql.helpers/where [:= :notification.creator_id owner_id])

    card_id
    (sql.helpers/where [:= :nc.card_id card_id])

    channel
    (sql.helpers/where (channel-exists channel))

    last_sent_status
    (sql.helpers/where (case last_sent_status
                         :successful [:= :lc.status "success"]
                         :failing    [:in :lc.status ["failed" "abandoned"]]))

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
         :order-by (order-by-clauses (or sort_column :updated_at) sort_direction)))

(defn- count-query
  [filters]
  (-> (list-query filters)
      (assoc :select [[[:count :notification.id] :count]])
      (dissoc :order-by)))

(defn- run->summary
  "Build a `::run-summary` map (or nil) from a task_run row joined onto the list query.
  Inputs:
    - status     ; :success / :failed / :abandoned, or nil if no run exists
    - at         ; started_at (last_check) or ended_at (last_sent)
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
    (let [run-status (case status
                       :success                :successful
                       (:failed :abandoned)    :failing)]
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
                     (assoc acc run_id (some-> task_details :message))))
                 {}))))

(defn- decorate-runs
  "Build :last_check / :last_sent maps on each row from the joined run columns + a one-shot
  task_history fetch for any failed/abandoned runs on the page."
  [rows]
  (let [failed-run-ids (into #{} (keep (fn [{:keys [lc_id lc_status]}]
                                         (when (#{"failed" "abandoned"} lc_status) lc_id)))
                             rows)
        run->error     (error-by-run-id failed-run-ids)]
    (mapv (fn [{:keys [lc_id lc_status lc_started_at ls_ended_at] :as row}]
            (-> row
                (assoc :last_check (run->summary {:status (coerce-status lc_status)
                                                  :at     lc_started_at
                                                  :error  (get run->error lc_id)}))
                (assoc :last_sent  (run->summary {:status (when ls_ended_at :success)
                                                  :at     ls_ended_at
                                                  :error  nil}))
                (dissoc :lc_id :lc_status :lc_started_at :ls_ended_at)))
          rows)))

(defn- ->owner-keys
  "Surface the `creator_id` / `creator` slots as `owner_id` / `owner` on the response. Splices
  `:is_active` (joined from `core_user`) onto the owner map — `t2/hydrate :creator` strips it
  because `default-user-columns` omits it. Response-boundary rename: the DB column and internal
  hydrate key stay as `creator_*`."
  [{:keys [creator owner_is_active] :as row}]
  (-> row
      (cond-> creator (assoc :creator (assoc creator :is_active owner_is_active)))
      (dissoc :owner_is_active)
      (set/rename-keys {:creator_id :owner_id
                        :creator    :owner})))

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
    {:data   (mapv ->owner-keys decorated)
     :total  total
     :limit  limit
     :offset offset}))

;; snake_case query params are intentional here — they match the existing
;; `metabase.notification.api.notification` endpoints so clients can share param names between
;; the public and admin surfaces.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- ::list-response
  "List card-type notifications (alerts) for admin management. Supports pagination (`limit` +
  `offset` query params — handled by the offset-paging middleware), filtering, and sorting.

  `last_sent_status` filter operates on the latest task_run for the notification's card
  (`successful` = latest run was a successful delivery; `failing` = latest run failed or was
  abandoned). It's named after the FE field but semantically reflects the most recent run's
  outcome, not whether a successful delivery exists in the lookback window."
  [_route
   {:keys [active owner_id owner_active card_id recipient_email channel last_sent_status query
           sort_column sort_direction]} :-
   [:map
    [:active           {:optional true} [:maybe ms/BooleanValue]]
    [:owner_id         {:optional true} ms/PositiveInt]
    [:owner_active     {:optional true} [:maybe ms/BooleanValue]]
    [:card_id          {:optional true} ms/PositiveInt]
    [:recipient_email  {:optional true} ms/NonBlankString]
    [:channel          {:optional true} ms/NonBlankString]
    [:last_sent_status {:optional true} ::run-status]
    [:query            {:optional true} ms/NonBlankString]
    [:sort_column      {:default :updated_at} ::sort-column]
    [:sort_direction   {:default :desc}       ::sort-direction]]]
  (api/check-superuser)
  (list-notifications {:limit            (or (request/limit) 50)
                       :offset           (or (request/offset) 0)
                       :active           active
                       :owner_id         owner_id
                       :owner_active     owner_active
                       :card_id          card_id
                       :recipient_email  recipient_email
                       :channel          channel
                       :last_sent_status last_sent_status
                       :query            query
                       :sort_column      sort_column
                       :sort_direction   sort_direction}))

(defn- get-notification-detail
  "Fetch a single card-type notification with `:last_check` / `:last_sent`. Returns nil if the
  notification doesn't exist or isn't a card-type notification."
  [id]
  (when-let [row (t2/select-one :model/Notification
                                (-> (list-query {})
                                    (sql.helpers/where [:= :notification.id id])
                                    (dissoc :order-by)))]
    (-> [row]
        decorate-runs
        models.notification/hydrate-notification
        first
        ->owner-keys)))

(api.macros/defendpoint :get "/:id" :- ::detail-response
  "Get a single card-type notification with last_check and last_sent. 404 if the notification
  doesn't exist or isn't a card-type notification."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (get-notification-detail id)))

(defn- action->update-map
  [action owner-id]
  (case (keyword action)
    :archive      {:active false}
    :unarchive    {:active true}
    :change-owner (do (api/check (integer? owner-id) [400 "owner_id required for change-owner"])
                      {:creator_id owner-id})))

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
  "Bulk-archive, -unarchive, or -change-owner a set of notifications. The per-notification
  `:active` flip goes through `:model/Notification`'s `before-update` hook, which creates / tears
  down the Quartz triggers. Recipient emails and `:event/notification-update` audit events are
  published via the shared [[notification-api/publish-notification-update!]] helper so this
  endpoint's side-effect contract can't drift from `PUT /api/notification/:id`."
  [_route _query
   {:keys [notification_ids action owner_id]} :-
   [:map
    [:notification_ids [:sequential {:min 1} ms/PositiveInt]]
    [:action           [:enum "archive" "unarchive" "change-owner"]]
    [:owner_id         {:optional true} ms/PositiveInt]]]
  (api/check-superuser)
  (let [update-map (action->update-map action owner_id)
        before     (bulk-update! update-map notification_ids)
        after      (->> (t2/select :model/Notification :id [:in (mapv :id before)])
                        models.notification/hydrate-notification
                        (m/index-by :id))]
    (doseq [b    before
            :let [a (get after (:id b))]
            :when a]
      (notification-api/publish-notification-update! a b))
    {:updated (count before)}))
