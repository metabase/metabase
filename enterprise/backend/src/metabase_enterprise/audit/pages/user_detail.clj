(ns metabase-enterprise.audit.pages.user-detail
  (:require [honeysql.core :as hsql]
            [metabase-enterprise.audit.pages.common :as common]
            [metabase-enterprise.audit.pages.common.cards :as cards]
            [metabase-enterprise.audit.pages.common.dashboards :as dashboards]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [metabase.util.urls :as urls]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(s/defn ^:internal-query-fn table
  "Query that probides a single row of information about a given User, similar to the `users/table` query but restricted
  to a single result.
  (TODO - in the designs, this is pivoted; should we do that here in Clojure-land?)"
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:name             {:display_name "Name",             :base_type :type/Name}]
              [:role             {:display_name "Role",             :base_type :type/Text}]
              [:groups           {:display_name "Groups",           :base_type :type/Text}]
              [:date_joined      {:display_name "Date Joined",      :base_type :type/DateTime}]
              [:last_active      {:display_name "Last Active",      :base_type :type/DateTime}]
              [:signup_method    {:display_name "Signup Method",    :base_type :type/Text}]
              [:questions_saved  {:display_name "Questions Saved",  :base_type :type/Integer}]
              [:dashboards_saved {:display_name "Dashboards Saved", :base_type :type/Integer}]
              [:pulses_saved     {:display_name "Pulses Saved",     :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with   [[:last_query {:select [[:%max.started_at :started_at]]
                                      :from   [:query_execution]
                                      :where  [:= :executor_id user-id]}]
                        [:groups {:select    [[(common/group-concat :pg.name ", ") :groups]]
                                  :from      [[:permissions_group_membership :pgm]]
                                  :left-join [[:permissions_group :pg] [:= :pgm.group_id :pg.id]]
                                  :where     [:= :pgm.user_id user-id]}]
                        [:questions_saved {:select [[:%count.* :count]]
                                           :from   [:report_card]
                                           :where  [:= :creator_id user-id]}]
                        [:dashboards_saved {:select [[:%count.* :count]]
                                            :from   [:report_dashboard]
                                            :where  [:= :creator_id user-id]}]
                        [:pulses_saved {:select [[:%count.* :count]]
                                        :from   [:pulse]
                                        :where  [:= :creator_id user-id]}]
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
                                          :last_name]
                                 :from   [[:core_user :u]]
                                 :where  [:= :u.id user-id]}]]
               :select [:u.name
                        :u.role
                        :groups.groups
                        :u.date_joined
                        [:last_query.started_at :last_active]
                        :u.signup_method
                        [:questions_saved.count :questions_saved]
                        [:dashboards_saved.count :dashboards_saved]
                        [:pulses_saved.count :pulses_saved]]
               :from   [[:users :u]
                        :groups
                        :last_query
                        :questions_saved
                        :dashboards_saved
                        :pulses_saved]})})

(s/defn ^:internal-query-fn most-viewed-dashboards
  "Return the 10 most-viewed Dashboards for a given User, in descending order."
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:dashboard_id   {:display_name "Dashboard ID", :base_type :type/Integer, :remapped_to   :dashboard_name}]
              [:dashboard_name {:display_name "Dashboard",    :base_type :type/Name,    :remapped_from :dashboard_id}]
              [:count          {:display_name "Views",        :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select    [[:d.id :dashboard_id]
                           [:d.name :dashboard_name]
                           [:%count.* :count]]
               :from      [[:view_log :vl]]
               :left-join [[:report_dashboard :d] [:= :vl.model_id :d.id]]
               :where     [:and
                           [:= :vl.user_id user-id]
                           [:= :vl.model (hx/literal "dashboard")]]
               :group-by  [:d.id]
               :order-by  [[:%count.* :desc]]
               :limit     10})})

(s/defn ^:internal-query-fn most-viewed-questions
  "Return the 10 most-viewed Questions for a given User, in descending order."
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:card_id   {:display_name "Card ID", :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name {:display_name "Query",   :base_type :type/Name,    :remapped_from :card_id}]
              [:count     {:display_name "Views",   :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select    [[:d.id :card_id]
                           [:d.name :card_name]
                           [:%count.* :count]]
               :from      [[:view_log :vl]]
               :left-join [[:report_card :d] [:= :vl.model_id :d.id]]
               :where     [:and
                           [:= :vl.user_id user-id]
                           [:= :vl.model (hx/literal "card")]]
               :group-by  [:d.id]
               :order-by  [[:%count.* :desc]]
               :limit     10})})

(s/defn ^:internal-query-fn query-views
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:viewed_on     {:display_name "Viewed On",      :base_type :type/DateTime}]
              [:card_id       {:display_name "Card ID"         :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name     {:display_name "Query",          :base_type :type/Text,    :remapped_from :card_id}]
              [:query_hash    {:display_name "Query Hash",     :base_type :type/Text}]
              [:type          {:display_name "Type",           :base_type :type/Text}]
              [:collection_id {:display_name "Collection ID",  :base_type :type/Integer, :remapped_to   :collection}]
              [:collection    {:display_name "Collection",     :base_type :type/Text,    :remapped_from :collection_id}]
              [:saved_by_id   {:display_name "Saving User ID", :base_type :type/Integer, :remapped_to   :saved_by}]
              [:saved_by      {:display_name "Saved By",       :base_type :type/Text,    :remapped_from :saved_by_id}]
              [:database_id   {:display_name "Database ID",    :base_type :type/Integer, :remapped_to   :source_db}]
              [:source_db     {:display_name "Source DB",      :base_type :type/Text,    :remapped_from :database_id}]
              [:table_id      {:display_name "Table ID"        :base_type :type/Integer, :remapped_to   :table}]
              [:table         {:display_name "Table",          :base_type :type/Text,    :remapped_from :table_id}]]
   :results (common/reducible-query
             {:select    [[:qe.started_at :viewed_on]
                          [:card.id :card_id]
                          [(common/card-name-or-ad-hoc :card) :card_name]
                          [:qe.hash :query_hash]
                          [(common/native-or-gui :qe) :type]
                          [:collection.id :collection_id]
                          [:collection.name :collection]
                          [:u.id :saved_by_id]
                          [(common/user-full-name :u) :saved_by]
                          [:db.id :database_id]
                          [:db.name :source_db]
                          [:t.id :table_id]
                          [:t.display_name :table]]
              :from      [[:query_execution :qe]]
              :join      [[:metabase_database :db] [:= :qe.database_id :db.id]]
              :left-join [[:report_card :card]     [:= :qe.card_id :card.id]
                          :collection              [:= :card.collection_id :collection.id]
                          [:core_user :u]          [:= :card.creator_id :u.id]
                          [:metabase_table :t]     [:= :card.table_id :t.id]]
              :where     [:= :qe.executor_id user-id]
              :order-by  [[:qe.started_at :desc]]})
   :xform    (map #(update (vec %) 3 codec/base64-encode))})

(s/defn ^:internal-query-fn dashboard-views
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:timestamp       {:display_name "Viewed on",     :base_type :type/DateTime}]
              [:dashboard_id    {:display_name "Dashboard ID",  :base_type :type/Integer, :remapped_to   :dashboard_name}]
              [:dashboard_name  {:display_name "Dashboard",     :base_type :type/Text,    :remapped_from :dashboard_id}]
              [:collection_id   {:display_name "Collection ID", :base_type :type/Integer, :remapped_to   :collection_name}]
              [:collection_name {:display_name "Collection",    :base_type :type/Text,    :remapped_from :collection_id}]]
   :results (common/reducible-query
             {:select    [:vl.timestamp
                          [:dash.id :dashboard_id]
                          [:dash.name :dashboard_name]
                          [:coll.id :collection_id]
                          [:coll.name :collection_name]]
              :from      [[:view_log :vl]]
              :where     [:and
                          [:= :vl.model (hx/literal "dashboard")]
                          [:= :vl.user_id user-id]]
              :join      [[:report_dashboard :dash] [:= :vl.model_id :dash.id]]
              :left-join [[:collection :coll] [:= :dash.collection_id :coll.id]]
              :order-by  [[:vl.timestamp :desc]]})})

(s/defn ^:internal-query-fn object-views-by-time
  "Timeseries chart that shows the number of Question or Dashboard views for a User, broken out by `datetime-unit`."
  [user-id :- su/IntGreaterThanZero, model :- (s/enum "card" "dashboard"), datetime-unit :- common/DateTimeUnitStr]
  {:metadata [[:date {:display_name "Date",   :base_type (common/datetime-unit-str->base-type datetime-unit)}]
              [:views {:display_name "Views", :base_type :type/Integer}]]
   :results (common/reducible-query
             {:select   [[(common/grouped-datetime datetime-unit :timestamp) :date]
                         [:%count.* :views]]
              :from     [:view_log]
              :where    [:and
                         [:= :user_id user-id]
                         [:= :model model]]
              :group-by [(common/grouped-datetime datetime-unit :timestamp)]
              :order-by [[(common/grouped-datetime datetime-unit :timestamp) :asc]]})})

(s/defn ^:internal-query-fn created-dashboards
  ([user-id]
   (created-dashboards user-id nil))
  ([user-id :- su/IntGreaterThanZero, query-string :- (s/maybe s/Str)]
   (dashboards/table query-string [:= :u.id user-id])))

(s/defn ^:internal-query-fn created-questions
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:card_id             {:display_name "Card ID",              :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name           {:display_name "Title",                :base_type :type/Name,    :remapped_from :card_id}]
              [:collection_id       {:display_name "Collection ID",        :base_type :type/Integer, :remapped_to   :collection_name}]
              [:collection_name     {:display_name "Collection",           :base_type :type/Text,    :remapped_from :collection_id}]
              [:created_at          {:display_name "Created At",           :base_type :type/DateTime}]
              [:database_id         {:display_name "Database ID",          :base_type :type/Integer, :remapped_to   :database_name}]
              [:database_name       {:display_name "Database",             :base_type :type/Text,    :remapped_from :database_id}]
              [:table_id            {:display_name "Table ID",             :base_type :type/Integer, :remapped_to   :table_name}]
              [:table_name          {:display_name "Table",                :base_type :type/Text,    :remapped_from :table_id}]
              [:avg_running_time_ms {:display_name "Avg. exec. time (ms)", :base_type :type/Number}]
              [:cache_ttl           {:display_name "Cache TTL",            :base_type :type/Number}]
              [:public_link         {:display_name "Public Link",          :base_type :type/URL}]
              [:total_views         {:display_name "Total Views",          :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with      [cards/avg-exec-time
                           cards/views]
               :select    [[:card.id :card_id]
                           [:card.name :card_name]
                           [:coll.id :collection_id]
                           [:coll.name :collection_name]
                           :card.created_at
                           :card.database_id
                           [:db.name :database_name]
                           :card.table_id
                           [:t.name :table_name]
                           :avg_exec_time.avg_running_time_ms
                           :card.cache_ttl
                           [(hsql/call :case
                              [:not= :card.public_uuid nil]
                              (hx/concat (urls/public-card-prefix) :card.public_uuid))
                            :public_link]
                           [:card_views.count :total_views]]
               :from      [[:report_card :card]]
               :left-join [:avg_exec_time           [:= :card.id :avg_exec_time.card_id]
                           [:metabase_database :db] [:= :card.database_id :db.id]
                           [:metabase_table :t]     [:= :card.table_id :t.id]
                           [:collection :coll]      [:= :card.collection_id :coll.id]
                           :card_views              [:= :card.id :card_views.card_id]]
               :where     [:= :card.creator_id user-id]
               :order-by  [[:%lower.card.name :asc]]})})

(s/defn ^:internal-query-fn downloads
  "Table of query downloads (i.e., queries whose results are returned as CSV/JSON/XLS) done by this user, ordered by
  most recent."
  [user-id :- su/IntGreaterThanZero]
  {:metadata [[:downloaded_at   {:display_name "Downloaded At",   :base_type :type/DateTime}]
              [:rows_downloaded {:display_name "Rows Downloaded", :base_type :type/Integer}]
              [:card_id         {:display_name "Card ID",         :base_type :type/Integer, :remapped_to :card_name}]
              [:card_name       {:display_name "Query",           :base_type :type/Text,    :remapped_from :card_id}]
              [:query_type      {:display_name "Query Type",      :base_type :type/Text}]
              [:database_id     {:display_name "Database ID",     :base_type :type/Integer, :remapped_to :database}]
              [:database        {:display_name "Database",        :base_type :type/Text,    :remapped_from :database_id}]
              [:table_id        {:display_name "Table ID",        :base_type :type/Integer, :remapped_to :source_table}]
              [:source_table    {:display_name "Source Table",    :base_type :type/Text,    :remapped_from :table_id}]]
   :results  (common/reducible-query
               {:select    [[:qe.started_at :downloaded_at]
                            [:qe.result_rows :rows_downloaded]
                            [:card.id :card_id]
                            [(common/card-name-or-ad-hoc :card) :card_name]
                            [(common/native-or-gui :qe) :query_type]
                            [:db.id :database_id]
                            [:db.name :database]
                            [:t.id :table_id]
                            [:t.name :source_table]]
                :from      [[:query_execution :qe]]
                :left-join [[:report_card :card] [:= :card.id :qe.card_id]
                            [:metabase_database :db] [:= :qe.database_id :db.id]
                            [:metabase_table :t] [:= :card.table_id :t.id]]
                :where     [:and
                            [:= :executor_id user-id]
                            (common/query-execution-is-download :qe)]
                :order-by  [[:qe.started_at :desc]]})})
