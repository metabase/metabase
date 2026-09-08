(ns metabase.product-feedback.db
  "Application database queries for the product feedback module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.users.schema :as users.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private CreatorSentimentCandidate
  "Rows returned by [[creator-sentiment-candidates]]."
  [:map {:closed true}
   [:email      :string]
   [:created_at [:maybe ms/TemporalInstant]]
   [:first_name [:maybe :string]]
   [:num_dashboards ms/IntGreaterThanOrEqualToZero]
   [:num_questions  ms/IntGreaterThanOrEqualToZero]
   [:num_models     ms/IntGreaterThanOrEqualToZero]])

(mu/defn creator-sentiment-candidates :- [:sequential CreatorSentimentCandidate]
  "The email, join date, first name, and content counts of the active personal Users who created content in the past
  2 months, with at least 10 Cards (2 native), and at least 1 Dashboard. When `only-superusers?` is true, only
  superusers are considered."
  [only-superusers? :- :boolean]
  (let [created-after (h2x/add-interval-honeysql-form (mdb/db-type) :%now -2 :month)]
    (t2/query {:select [[:u.email :email]
                        [:u.date_joined :created_at]
                        [:u.first_name :first_name]
                        [[:count [:distinct [:case [:= :d.archived false] :d.id]]] :num_dashboards]
                        [[:count [:distinct [:case [:and [:= :rc.type "question"] [:= :rc.archived false]] :rc.id]]] :num_questions]
                        [[:count [:distinct [:case [:and [:= :rc.type "model"] [:= :rc.archived false]] :rc.id]]] :num_models]]
               :from [[:core_user :u]]
               :join [[:report_card :rc] [:= :rc.creator_id :u.id]
                      [:report_dashboard :d] [:= :d.creator_id :u.id]]
               :where [:and
                       [:>= :rc.created_at created-after]
                       [:>= :d.created_at created-after]
                       [:= :u.is_active true]
                       [:= :u.type "personal"]
                       (when only-superusers? [:= :u.is_superuser true])]
               :group-by [:u.id]
               :having [:and
                        [:>= [:count [:distinct :rc.id]] 10]
                        [:>= [:count [:distinct [:case [:= :rc.query_type "native"] :rc.id]]] 2]
                        [:>= [:count [:distinct :d.id]] 1]]})))

(mu/defn active-personal-user-count :- ms/IntGreaterThanOrEqualToZero
  "The number of active personal Users."
  []
  (t2/count :model/User :is_active true, :type "personal"))

(mu/defn unarchived-dashboard-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived Dashboards."
  []
  (t2/count :model/Dashboard :archived false))

(mu/defn non-audit-database-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Databases other than the audit Database."
  []
  (t2/count :model/Database :is_audit false))

(mu/defn unarchived-card-count :- ms/IntGreaterThanOrEqualToZero
  "The number of unarchived Cards of `card-type`."
  [card-type :- [:or :keyword :string]]
  (t2/count :model/Card :archived false :type card-type))

(mu/defn oldest-active-admin :- [:maybe ::users.schema/user]
  "The earliest-joined active superuser, or nil."
  []
  (t2/select-one :model/User :is_superuser true, :is_active true, {:order-by [:date_joined]}))

(mu/defn earliest-user-date-joined :- [:maybe ms/TemporalInstant]
  "The join date of the earliest-joined User, or nil."
  []
  (t2/select-one-fn :date_joined :model/User, {:order-by [[:date_joined :asc]]}))
