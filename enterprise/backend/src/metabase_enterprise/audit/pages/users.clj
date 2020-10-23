(ns metabase-enterprise.audit.pages.users
  (:require [honeysql.core :as hsql]
            [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.honeysql-extensions :as hx]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(defn ^:internal-query-fn ^:deprecated active-users-and-queries-by-day
  "Query that returns data for a two-series timeseries: the number of DAU (a User is considered active for purposes of
  this query if they ran at least one query that day), and total number of queries ran. Broken out by day."
  []
  {:metadata [[:users   {:display_name "Users",   :base_type :type/Integer}]
              [:queries {:display_name "Queries", :base_type :type/Integer}]
              [:day     {:display_name "Date",    :base_type :type/Date}]]
   :results  (common/reducible-query
              {:with     [[:user_qe {:select   [:executor_id
                                                [:%count.* :executions]
                                                [(hx/cast :date :started_at) :day]]
                                     :from     [:query_execution]
                                     :group-by [:executor_id :day]}]]
               :select   [[:%count.* :users]
                          [:%sum.executions :queries]
                          :day]
               :from     [:user_qe]
               :group-by [:day]
               :order-by [[:day :asc]]})})


(s/defn ^:internal-query-fn active-and-new-by-time
  "Two-series timeseries that returns number of active Users (Users who ran at least one query) and number of new Users,
  broken out by `datetime-unit`."
  [datetime-unit :- common/DateTimeUnitStr]
  {:metadata [[:date         {:display_name "Date",         :base_type (common/datetime-unit-str->base-type datetime-unit)}]
              [:active_users {:display_name "Active Users", :base_type :type/Integer}]
              [:new_users    {:display_name "New Users",    :base_type :type/Integer}]]
   ;; this is so nice and easy to implement in a single query with FULL OUTER JOINS but unfortunately only pg supports
   ;; them(!)
   :results  (let [active       (common/query
                                  {:select   [[(common/grouped-datetime datetime-unit :started_at) :date]
                                              [:%distinct-count.executor_id :count]]
                                   :from     [:query_execution]
                                   :group-by [(common/grouped-datetime datetime-unit :started_at)]})
                   date->active (zipmap (map :date active) (map :count active))
                   new          (common/query
                                  {:select   [[(common/grouped-datetime datetime-unit :date_joined) :date]
                                              [:%count.* :count]]
                                   :from     [:core_user]
                                   :group-by [(common/grouped-datetime datetime-unit :date_joined)]})
                   date->new    (zipmap (map :date new) (map :count new))
                   all-dates    (sort (keep identity (distinct (concat (keys date->active)
                                                                       (keys date->new)))))]
               (for [date all-dates]
                 {:date         date
                  :active_users (date->active date 0)
                  :new_users    (date->new   date 0)}))})


(defn ^:internal-query-fn most-active
  "Query that returns the 10 most active Users (by number of query executions) in descending order."
  []
  {:metadata [[:user_id {:display_name "User ID",          :base_type :type/Integer, :remapped_to   :name}]
              [:name    {:display_name "Name",             :base_type :type/Name,    :remapped_from :user_id}]
              [:count   {:display_name "Query Executions", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with      [[:qe_count {:select   [[:%count.* :count]
                                                  :qe.executor_id]
                                       :from     [[:query_execution :qe]]
                                       :where    [:not= nil :qe.executor_id]
                                       :group-by [:qe.executor_id]
                                       :order-by [[:%count.* :desc]]
                                       :limit    10}]]
               :select    [[:u.id :user_id]
                           [(common/user-full-name :u) :name]
                           [(common/zero-if-null :qe_count.count) :count]]
               :from      [[:core_user :u]]
               :left-join [:qe_count [:= :qe_count.executor_id :u.id]]
               :order-by  [[:count :desc]
                           [:%lower.u.last_name :asc]
                           [:%lower.u.first_name :asc]]
               :limit     10})})


(defn ^:internal-query-fn most-saves
  "Query that returns the 10 Users with the most saved objects in descending order."
  []
  {:metadata [[:user_id   {:display_name "User ID",       :base_type :type/Integer, :remapped_to :user_name}]
              [:user_name {:display_name "Name",          :base_type :type/Name,    :remapped_from :user_id}]
              [:saves     {:display_name "Saved Objects", :base_type :type/Integer}]]
   :results  (common/reducible-query
               {:with      [[:card_saves       {:select   [:creator_id
                                                           [:%count.* :count]]
                                                :from     [:report_card]
                                                :group-by [:creator_id]}]
                            [:dashboard_saves {:select   [:creator_id
                                                          [:%count.* :count]]
                                               :from     [:report_dashboard]
                                               :group-by [:creator_id]}]
                            [:pulse_saves     {:select   [:creator_id
                                                          [:%count.* :count]]
                                               :from     [:pulse]
                                               :group-by [:creator_id]}]]
                :select    [[:u.id :user_id]
                            [(common/user-full-name :u) :user_name]
                            [(hx/+ (common/zero-if-null :card_saves.count)
                                   (common/zero-if-null :dashboard_saves.count)
                                   (common/zero-if-null :pulse_saves.count))
                             :saves]]
                :from      [[:core_user :u]]
                :left-join [:card_saves      [:= :u.id :card_saves.creator_id]
                            :dashboard_saves [:= :u.id :dashboard_saves.creator_id]
                            :pulse_saves     [:= :u.id :pulse_saves.creator_id]]
                :order-by  [[:saves :desc]
                            [:u.last_name :asc]
                            [:u.first_name :asc]]
                :limit     10})})


(defn ^:internal-query-fn query-execution-time-per-user
  "Query that returns the total time spent executing queries, broken out by User, for the top 10 Users."
  []
  {:metadata [[:user_id           {:display_name "User ID",                   :base_type :type/Integer, :remapped_to   :name}]
              [:name              {:display_name "Name",                      :base_type :type/Name,    :remapped_from :user_id}]
              [:execution_time_ms {:display_name "Total Execution Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
               {:with      [[:exec_time {:select   [[:%sum.running_time :execution_time_ms]
                                                    :qe.executor_id]
                                         :from     [[:query_execution :qe]]
                                         :where    [:not= nil :qe.executor_id]
                                         :group-by [:qe.executor_id]
                                         :order-by [[:%sum.running_time :desc]]
                                         :limit    10}]]
                :select    [[:u.id :user_id]
                            [(common/user-full-name :u) :name]
                            [(hsql/call :case [:not= :exec_time.execution_time_ms nil] :exec_time.execution_time_ms
                                        :else 0)
                             :execution_time_ms]]
                :from      [[:core_user :u]]
                :left-join [:exec_time [:= :exec_time.executor_id :u.id]]
                :order-by  [[:execution_time_ms :desc]
                            [:%lower.u.last_name :asc]
                            [:%lower.u.first_name :asc]]
                :limit     10})})

(s/defn ^:internal-query-fn table
  ([]
   (table nil))

  ([query-string :- (s/maybe s/Str)]
   {:metadata [[:user_id          {:display_name "User ID",          :base_type :type/Integer, :remapped_to :name}]
               [:name             {:display_name "Name",             :base_type :type/Name,    :remapped_from :user_id}]
               [:role             {:display_name "Role",             :base_type :type/Text}]
               [:groups           {:display_name "Groups",           :base_type :type/Text}]
               [:date_joined      {:display_name "Date Joined",      :base_type :type/DateTime}]
               [:last_active      {:display_name "Last Active",      :base_type :type/DateTime}]
               [:signup_method    {:display_name "Signup Method",    :base_type :type/Text}]
               [:questions_saved  {:display_name "Questions Saved",  :base_type :type/Integer}]
               [:dashboards_saved {:display_name "Dashboards Saved", :base_type :type/Integer}]
               [:pulses_saved     {:display_name "Pulses Saved",     :base_type :type/Integer}]]
    :results  (common/reducible-query
               (->
                {:with      [[:last_query {:select   [[:executor_id :id]
                                                      [:%max.started_at :started_at]]
                                           :from     [:query_execution]
                                           :group-by [:executor_id]}]
                             [:groups {:select    [[:u.id :id]
                                                   [(common/group-concat :pg.name ", ") :groups]]
                                       :from      [[:core_user :u]]
                                       :left-join [[:permissions_group_membership :pgm] [:= :u.id :pgm.user_id]
                                                   [:permissions_group :pg]             [:= :pgm.group_id :pg.id]]
                                       :group-by  [:u.id]}]
                             [:questions_saved {:select    [[:u.id :id]
                                                            [:%count.* :count]]
                                                :from      [[:report_card :c]]
                                                :left-join [[:core_user :u] [:= :u.id :c.creator_id]]
                                                :group-by  [:u.id]}]
                             [:dashboards_saved {:select    [[:u.id :id]
                                                             [:%count.* :count]]
                                                 :from      [[:report_dashboard :d]]
                                                 :left-join [[:core_user :u] [:= :u.id :d.creator_id]]
                                                 :group-by  [:u.id]}]
                             [:pulses_saved {:select    [[:u.id :id]
                                                         [:%count.* :count]]
                                             :from      [[:pulse :p]]
                                             :left-join [[:core_user :u] [:= :u.id :p.creator_id]]
                                             :group-by  [:u.id]}]
                             [:users {:select [[(common/user-full-name :u) :name]
                                               [(hsql/call :case
                                                  [:= :u.is_superuser true]
                                                  (hx/literal "Admin")
                                                  :else
                                                  (hx/literal "User"))
                                                :role]
                                               :id
                                               :date_joined
                                               [(hsql/call :case
                                                  [:= nil :u.sso_source]
                                                  (hx/literal "Email")
                                                  :else
                                                  :u.sso_source)
                                                :signup_method]
                                               :last_name
                                               :first_name]
                                      :from   [[:core_user :u]]}]]
                 :select    [[:u.id :user_id]
                             :u.name
                             :u.role
                             :groups.groups
                             :u.date_joined
                             [:last_query.started_at :last_active]
                             :u.signup_method
                             [:questions_saved.count :questions_saved]
                             [:dashboards_saved.count :dashboards_saved]
                             [:pulses_saved.count :pulses_saved]]
                 :from      [[:users :u]]
                 :left-join [:groups           [:= :u.id :groups.id]
                             :last_query       [:= :u.id :last_query.id]
                             :questions_saved  [:= :u.id :questions_saved.id]
                             :dashboards_saved [:= :u.id :dashboards_saved.id]
                             :pulses_saved     [:= :u.id :pulses_saved.id]]
                 :order-by  [[:%lower.u.last_name :asc]
                             [:%lower.u.first_name :asc]]}
                (common/add-search-clause query-string :u.first_name :u.last_name)))}))


(defn ^:internal-query-fn query-views
  "Return a log of all query executions, including information about the Card associated with the query and the
  Collection it is in (both, if applicable) and Database/Table referenced by the query."
  []
  {:metadata [[:viewed_on     {:display_name "Viewed On",       :base_type :type/DateTime}]
              [:card_id       {:display_name "Card ID"          :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name     {:display_name "Query",           :base_type :type/Text,    :remapped_from :card_id}]
              [:query_hash    {:display_name "Query Hash",      :base_type :type/Text}]
              [:type          {:display_name "Type",            :base_type :type/Text}]
              [:collection_id {:display_name "Collection ID",   :base_type :type/Integer, :remapped_to   :collection}]
              [:collection    {:display_name "Collection",      :base_type :type/Text,    :remapped_from :collection_id}]
              [:viewed_by_id  {:display_name "Viewing User ID", :base_type :type/Integer, :remapped_to   :viewed_by}]
              [:viewed_by     {:display_name "Viewed By",       :base_type :type/Text,    :remapped_from :viewed_by_id}]
              [:saved_by_id   {:display_name "Saving User ID",  :base_type :type/Integer, :remapped_to   :saved_by}]
              [:saved_by      {:display_name "Saved By",        :base_type :type/Text,    :remapped_from :saved_by_id}]
              [:database_id   {:display_name "Database ID",     :base_type :type/Integer, :remapped_to   :source_db}]
              [:source_db     {:display_name "Source DB",       :base_type :type/Text,    :remapped_from :database_id}]
              [:table_id      {:display_name "Table ID"         :base_type :type/Integer, :remapped_to   :table}]
              [:table         {:display_name "Table",           :base_type :type/Text,    :remapped_from :table_id}]]
   :results (common/reducible-query
             {:select    [[:qe.started_at :viewed_on]
                          [:card.id :card_id]
                          [(common/card-name-or-ad-hoc :card) :card_name]
                          [:qe.hash :query_hash]
                          [(common/native-or-gui :qe) :type]
                          [:collection.id :collection_id]
                          [:collection.name :collection]
                          [:viewer.id :viewed_by_id]
                          [(common/user-full-name :viewer) :viewed_by]
                          [:creator.id :saved_by_id]
                          [(common/user-full-name :creator) :saved_by]
                          [:db.id :database_id]
                          [:db.name :source_db]
                          [:t.id :table_id]
                          [:t.display_name :table]]
              :from      [[:query_execution :qe]]
              :join      [[:metabase_database :db] [:= :qe.database_id :db.id]
                          [:core_user :viewer]     [:= :qe.executor_id :viewer.id]]
              :left-join [[:report_card :card]     [:= :qe.card_id :card.id]
                          :collection              [:= :card.collection_id :collection.id]
                          [:core_user :creator]    [:= :card.creator_id :creator.id]
                          [:metabase_table :t]     [:= :card.table_id :t.id]]
              :order-by  [[:qe.started_at :desc]]})
   :xform (map #(update (vec %) 3 codec/base64-encode))})

(defn ^:internal-query-fn dashboard-views
  "Return a log of when all Dashboard views, including the Collection the Dashboard belongs to."
  []
  {:metadata [[:timestamp       {:display_name "Viewed on",     :base_type :type/DateTime}]
              [:dashboard_id    {:display_name "Dashboard ID",  :base_type :type/Integer, :remapped_to   :dashboard_name}]
              [:dashboard_name  {:display_name "Dashboard",     :base_type :type/Text,    :remapped_from :dashboard_id}]
              [:collection_id   {:display_name "Collection ID", :base_type :type/Integer, :remapped_to   :collection_name}]
              [:collection_name {:display_name "Collection",    :base_type :type/Text,    :remapped_from :collection_id}]
              [:user_id         {:display_name "User ID",      :base_type :type/Integer,  :remapped_to   :user_name}]
              [:user_name       {:display_name "Viewed By",    :base_type :type/Text,     :remapped_from :user_id}]]
   :results (common/reducible-query
             {:select    [:vl.timestamp
                          [:dash.id :dashboard_id]
                          [:dash.name :dashboard_name]
                          [:coll.id :collection_id]
                          [:coll.name :collection_name]
                          [:u.id :user_id]
                          [(common/user-full-name :u) :user_name]]
              :from      [[:view_log :vl]]
              :where     [:= :vl.model (hx/literal "dashboard")]
              :join      [[:report_dashboard :dash] [:= :vl.model_id :dash.id]
                          [:core_user :u]           [:= :vl.user_id :u.id]]
              :left-join [[:collection :coll] [:= :dash.collection_id :coll.id]]
              :order-by  [[:vl.timestamp :desc]]})})
