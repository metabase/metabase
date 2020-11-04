(ns metabase-enterprise.audit.pages.dashboards
  "Dashboards overview page."
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase-enterprise.audit.pages.common.dashboards :as dashboards]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]))

(defn ^:deprecated ^:internal-query-fn views-per-day
  "DEPRECATED: use `views-and-saves-by-time ` instead."
  []
  {:metadata [[:day   {:display_name "Date",  :base_type :type/Date}]
              [:views {:display_name "Views", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select   [[(hx/cast :date :timestamp) :day]
                          [:%count.* :views]]
               :from     [:view_log]
               :where    [:= :model (hx/literal "dashboard")]
               :group-by [(hx/cast :date :timestamp)]
               :order-by [(hx/cast :date :timestamp)]})})


(s/defn ^:internal-query-fn views-and-saves-by-time
  "Two-series timeseries that includes total number of Dashboard views and saves broken out by a `datetime-unit`."
  [datetime-unit :- common/DateTimeUnitStr]
  {:metadata [[:date  {:display_name "Date",  :base_type (common/datetime-unit-str->base-type datetime-unit)}]
              [:views {:display_name "Views", :base_type :type/Integer}]
              [:saves {:display_name "Saves", :base_type :type/Integer}]]
   ;; this is so nice and easy to implement in a single query with FULL OUTER JOINS but unfortunately only pg supports
   ;; them(!)
   :results (let [views        (common/query
                                 {:select   [[(common/grouped-datetime datetime-unit :timestamp) :date]
                                             [:%count.* :views]]
                                  :from     [:view_log]
                                  :where    [:= :model (hx/literal "dashboard")]
                                  :group-by [(common/grouped-datetime datetime-unit :timestamp)]})
                  date->views  (zipmap (map :date views) (map :views views))
                  saves        (common/query
                                 {:select   [[(common/grouped-datetime datetime-unit :created_at) :date]
                                             [:%count.* :saves]]
                                  :from     [:report_dashboard]
                                  :group-by [(common/grouped-datetime datetime-unit :created_at)]})
                  date->saves  (zipmap (map :date saves) (map :saves saves))
                  all-dates    (sort (keep identity (distinct (concat (keys date->views)
                                                                      (keys date->saves)))))]
              (for [date all-dates]
                {:date date
                 :views (date->views date 0)
                 :saves (date->saves date 0)}))})


(defn ^:internal-query-fn ^:deprecated most-popular
  "Deprecated: use `most-popular-with-avg-speed` instead."
  []
  {:metadata [[:dashboard_id   {:display_name "Dashboard ID", :base_type :type/Integer, :remapped_to   :dashboard_name}]
              [:dashboard_name {:display_name "Dashboard",    :base_type :type/Title,   :remapped_from :dashboard_id}]
              [:views          {:display_name "Views",        :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select    [[:d.id :dashboard_id]
                           [:d.name :dashboard_name]
                           [:%count.* :views]]
               :from      [[:view_log :vl]]
               :left-join [[:report_dashboard :d] [:= :vl.model_id :d.id]]
               :where     [:= :vl.model (hx/literal "dashboard")]
               :group-by  [:d.id]
               :order-by  [[:%count.* :desc]]
               :limit     10})})

(defn ^:internal-query-fn most-popular-with-avg-speed
  "10 most popular dashboards with their average speed."
  []
  {:metadata [[:dashboard_id     {:display_name "Dashboard ID",                 :base_type :type/Integer, :remapped_to   :dashboard_name}]
              [:dashboard_name   {:display_name "Dashboard",                    :base_type :type/Title,   :remapped_from :dashboard_id}]
              [:views            {:display_name "Views",                        :base_type :type/Integer}]
              [:avg_running_time {:display_name "Avg. Question Load Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
               {:with      [[:most_popular {:select    [[:d.id :dashboard_id]
                                                        [:d.name :dashboard_name]
                                                        [:%count.* :views]]
                                            :from      [[:view_log :vl]]
                                            :left-join [[:report_dashboard :d] [:= :vl.model_id :d.id]]
                                            :where     [:= :vl.model (hx/literal "dashboard")]
                                            :group-by  [:d.id]
                                            :order-by  [[:%count.* :desc]]
                                            :limit     10}]
                            [:card_running_time {:select   [:qe.card_id
                                                            [:%avg.qe.running_time :avg_running_time]]
                                                 :from     [[:query_execution :qe]]
                                                 :where    [:not= :qe.card_id nil]
                                                 :group-by [:qe.card_id]}]
                            [:dash_avg_running_time {:select    [[:d.id :dashboard_id]
                                                                 [:%avg.rt.avg_running_time :avg_running_time]]
                                                     :from      [[:report_dashboardcard :dc]]
                                                     :left-join [[:card_running_time :rt] [:= :dc.card_id :rt.card_id]
                                                                 [:report_dashboard :d]   [:= :dc.dashboard_id :d.id]]
                                                     :group-by  [:d.id]
                                                     :where     [:in :d.id {:select [:dashboard_id]
                                                                            :from   [:most_popular]}]}]]
                :select    [:mp.dashboard_id
                            :mp.dashboard_name
                            :mp.views
                            :rt.avg_running_time]
                :from      [[:most_popular :mp]]
                :left-join [[:dash_avg_running_time :rt] [:= :mp.dashboard_id :rt.dashboard_id]]
                :order-by  [[:mp.views :desc]]
                :limit     10})})


(defn ^:internal-query-fn ^:deprecated slowest
  "Query that returns the 10 Dashboards that have the slowest average execution times, in descending order."
  []
  {:metadata [[:dashboard_id     {:display_name "Dashboard ID",                 :base_type :type/Integer, :remapped_to   :dashboard_name}]
              [:dashboard_name   {:display_name "Dashboard",                    :base_type :type/Title,   :remapped_from :dashboard_id}]
              [:avg_running_time {:display_name "Avg. Question Load Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:with      [[:card_running_time {:select   [:qe.card_id
                                                           [:%avg.qe.running_time :avg_running_time]]
                                                :from     [[:query_execution :qe]]
                                                :where    [:not= :qe.card_id nil]
                                                :group-by [:qe.card_id]}]]
               :select    [[:d.id :dashboard_id]
                           [:d.name :dashboard_name]
                           [:%avg.rt.avg_running_time :avg_running_time]]
               :from      [[:report_dashboardcard :dc]]
               :left-join [[:card_running_time :rt] [:= :dc.card_id :rt.card_id]
                           [:report_dashboard :d]   [:= :dc.dashboard_id :d.id]]
               :group-by  [:d.id]
               :order-by  [[:avg_running_time :desc]]
               :limit     10})})


(defn ^:internal-query-fn ^:deprecated most-common-questions
  "Query that returns the 10 Cards that appear most often in Dashboards, in descending order."
  []
  {:metadata [[:card_id   {:display_name "Card ID", :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name {:display_name "Card",    :base_type :type/Title,   :remapped_from :card_id}]
              [:count     {:display_name "Count",   :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select   [[:c.id :card_id]
                          [:c.name :card_name]
                          [:%count.* :count]]
               :from     [[:report_dashboardcard :dc]]
               :join     [[:report_card :c] [:= :c.id :dc.card_id]]
               :group-by [:c.id]
               :order-by [[:%count.* :desc]]
               :limit    10})})


(s/defn ^:internal-query-fn table
  "Internal audit app query powering a table of different Dashboards with lots of extra info about them."
  ([]
   (table nil))
  ([query-string :- (s/maybe s/Str)]
   (dashboards/table query-string)))
