(ns metabase-enterprise.audit.pages.databases
  (:require [honeysql.core :as hsql]
            [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.cron :as cron]
            [schema.core :as s]))

;; SELECT
;;   db.id AS database_id,
;;   db.name AS database_name,
;;   count(*) AS queries,
;;   avg(qe.running_time) AS avg_running_time
;; FROM query_execution qe
;; JOIN report_card card     ON qe.card_id = card.id
;; JOIN metabase_table t     ON card.table_id = t.id
;; JOIN metabase_database db ON t.db_id = db.id
;; GROUP BY db.id
;; ORDER BY lower(db.name) ASC
(defn ^:internal-query-fn ^:deprecated total-query-executions-by-db
  "Return Databases with the total number of queries ran against them and the average running time for all queries."
  []
  {:metadata [[:database_id      {:display_name "Database ID",            :base_type :type/Integer, :remapped_to   :database_name}]
              [:database_name    {:display_name "Database",               :base_type :type/Text,    :remapped_from :database_id}]
              [:queries          {:display_name "Queries",                :base_type :type/Integer}]
              [:avg_running_time {:display_name "Avg. Running Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:select   [[:db.id :database_id]
                          [:db.name :database_name]
                          [:%count.* :queries]
                          [:%avg.qe.running_time :avg_running_time]]
               :from     [[:query_execution :qe]]
               :join     [[:report_card :card]     [:= :qe.card_id :card.id]
                          [:metabase_table :t]     [:= :card.table_id :t.id]
                          [:metabase_database :db] [:= :t.db_id :db.id]]
               :group-by [:db.id]
               :order-by [[:%lower.db.name :asc]]})})

(s/defn ^:internal-query-fn query-executions-by-time
  "Query that returns count of query executions grouped by Database and a `datetime-unit`."
  [datetime-unit :- common/DateTimeUnitStr]
  {:metadata [[:date          {:display_name "Date",          :base_type (common/datetime-unit-str->base-type datetime-unit)}]
              [:database_id   {:display_name "Database ID",   :base_type :type/Integer, :remapped_to   :database_name}]
              [:database_name {:display_name "Database Name", :base_type :type/Name,    :remapped_from :database_id}]
              [:count         {:display_name "Count",         :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with      [[:qx {:select    [[(common/grouped-datetime datetime-unit :qe.started_at) :date]
                                             :card.database_id
                                             [:%count.* :count]]
                                 :from      [[:query_execution :qe]]
                                 :left-join [[:report_card :card] [:= :qe.card_id :card.id]]
                                 :where     [:and
                                             [:not= :qe.card_id nil]
                                             [:not= :card.database_id nil]]
                                 :group-by  [(common/grouped-datetime datetime-unit :qe.started_at) :card.database_id]
                                 :order-by  [[(common/grouped-datetime datetime-unit :qe.started_at) :asc]
                                             [:card.database_id :asc]]}]]
               :select    [:qx.date
                           :qx.database_id
                           [:db.name :database_name]
                           :qx.count]
               :from      [:qx]
               :left-join [[:metabase_database :db] [:= :qx.database_id :db.id]]
               :order-by  [[:qx.date :asc]
                           [:%lower.db.name :asc]
                           [:qx.database_id :asc]]})})

(defn ^:deprecated ^:internal-query-fn query-executions-per-db-per-day
  "Query that returns count of query executions grouped by Database and day."
  []
  (query-executions-by-time "day"))


(s/defn ^:internal-query-fn table
  ([]
   (table nil))
  ([query-string :- (s/maybe s/Str)]
   ;; TODO - Should we convert sync_schedule from a cron string into English? Not sure that's going to be feasible for
   ;; really complicated schedules
   {:metadata [[:database_id   {:display_name "Database ID", :base_type :type/Integer, :remapped_to :title}]
               [:title         {:display_name "Title", :base_type :type/Text, :remapped_from :database_id}]
               [:added_on      {:display_name "Added On", :base_type :type/DateTime}]
               [:sync_schedule {:display_name "Sync Schedule", :base_type :type/Text}]
               [:schemas       {:display_name "Schemas", :base_type :type/Integer}]
               [:tables        {:display_name "Tables", :base_type :type/Integer}]]
    :results  (common/reducible-query
               (->
                {:with      [[:counts {:select   [[:db_id :id]
                                                  [(hsql/call :distinct-count :schema) :schemas]
                                                  [:%count.* :tables]]
                                       :from     [:metabase_table]
                                       :group-by [:db_id]}]]
                 :select    [[:db.id :database_id]
                             [:db.name :title]
                             [:db.created_at :added_on]
                             [:db.metadata_sync_schedule :sync_schedule]
                             [:counts.schemas :schemas]
                             [:counts.tables :tables]]
                 :from      [[:metabase_database :db]]
                 :left-join [:counts [:= :db.id :counts.id]]
                 :order-by  [[:%lower.db.name :asc]
                             [:database_id :asc]]}
                (common/add-search-clause query-string :db.name)))
    :xform    (map #(update (vec %) 3 cron/describe-cron-string))}))
