(ns metabase-enterprise.audit.pages.schemas
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]))

;; WITH counts AS (
;;     SELECT db."name" AS db_name, t."schema" AS db_schema
;;     FROM query_execution qe
;;     LEFT JOIN report_card card
;;       ON qe.card_id = card.id
;;     LEFT JOIN metabase_database db
;;       ON card.database_id = db.id
;;     LEFT JOIN metabase_table t
;;       ON card.table_id = t.id
;;     WHERE qe.card_id IS NOT NULL
;;       AND card.database_id IS NOT NULL
;;       AND card.table_id IS NOT NULL
;; )
;;
;; SELECT (db_name || ' ' || db_schema) AS "schema", count(*) AS executions
;; FROM counts
;; GROUP BY db_name, db_schema
;; ORDER BY count(*) DESC
;; LIMIT 10
(defn ^:internal-query-fn ^:deprecated most-queried
  "Query that returns the top 10 most-queried schemas, in descending order."
  []
  {:metadata [[:schema     {:display_name "Schema",     :base_type :type/Title}]
              [:executions {:display_name "Executions", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with     [[:counts {:select    [[:db.name :db_name]
                                                [:t.schema :db_schema]]
                                    :from      [[:query_execution :qe]]
                                    :left-join [[:report_card :card]     [:= :qe.card_id :card.id]
                                                [:metabase_database :db] [:= :card.database_id :db.id]
                                                [:metabase_table :t]     [:= :card.table_id :t.id]]
                                    :where     [:and
                                                [:not= :qe.card_id nil]
                                                [:not= :card.database_id nil]
                                                [:not= :card.table_id nil]]}]]
               :select   [[(hx/concat :db_name (hx/literal " ") :db_schema) :schema]
                          [:%count.* :executions]]
               :from     [:counts]
               :group-by [:db_name :db_schema]
               :order-by [[:%count.* :desc]]
               :limit    10})})

;; WITH counts AS (
;;     SELECT db."name" AS db_name, t."schema" AS db_schema, qe.running_time
;;     FROM query_execution qe
;;     LEFT JOIN report_card card
;;       ON qe.card_id = card.id
;;     LEFT JOIN metabase_database db
;;       ON card.database_id = db.id
;;     LEFT JOIN metabase_table t
;;       ON card.table_id = t.id
;;     WHERE qe.card_id IS NOT NULL
;;       AND card.database_id IS NOT NULL
;;       AND card.table_id IS NOT NULL
;; )
;;
;; SELECT (db_name || ' ' || db_schema) AS "schema", avg(running_time) AS avg_running_time
;; FROM counts
;; GROUP BY db_name, db_schema
;; ORDER BY avg_running_time DESC
;; LIMIT 10
(defn ^:internal-query-fn ^:deprecated slowest-schemas
  "Query that returns the top 10 schemas with the slowest average query execution time in descending order."
  []
  {:metadata [[:schema           {:display_name "Schema",                    :base_type :type/Title}]
              [:avg_running_time {:display_name "Average Running Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:with     [[:counts {:select    [[:db.name :db_name]
                                                [:t.schema :db_schema]
                                                :qe.running_time]
                                    :from      [[:query_execution :qe]]
                                    :left-join [[:report_card :card]     [:= :qe.card_id :card.id]
                                                [:metabase_database :db] [:= :card.database_id :db.id]
                                                [:metabase_table :t]     [:= :card.table_id :t.id]]
                                    :where     [:and
                                                [:not= :qe.card_id nil]
                                                [:not= :card.database_id nil]
                                                [:not= :card.table_id nil]]}]]
               :select   [[(hx/concat :db_name (hx/literal " ") :db_schema) :schema]
                          [:%avg.running_time :avg_running_time]]
               :from     [:counts]
               :group-by [:db_name :db_schema]
               :order-by [[:avg_running_time :desc]]
               :limit    10})})

;; WITH cards AS (
;;     SELECT t.db_id AS database_id, t."schema", count(*) AS saved_count
;;     FROM report_card c
;;     LEFT JOIN metabase_table t
;;       ON c.table_id = t.id
;;     WHERE c.table_id IS NOT NULL
;;     GROUP BY t.db_id, t."schema"
;; ),
;;
;; schemas AS (
;;     SELECT db.id AS database_id, db.name AS database_name, t."schema", COUNT(*) AS tables
;;     FROM metabase_table t
;;     LEFT JOIN metabase_database db
;;       ON t.db_id = db.id
;;     GROUP BY db.id, t."schema"
;;     ORDER BY db.name ASC, t."schema" ASC
;; )
;;
;; SELECT s.database_name AS "database", s."schema", s.tables, c.saved_count AS saved_queries
;; FROM schemas
;; LEFT JOIN cards c
;;   ON s.database_id = c.database_id AND s."schema" = c."schema"
(s/defn ^:internal-query-fn ^:deprecated table
  "Query that returns a data for a table full of fascinating information about the different schemas in use in our
  application."
  ([]
   (table nil))
  ([query-string :- (s/maybe s/Str)]
   {:metadata [[:database_id   {:display_name "Database ID",   :base_type :type/Integer, :remapped_to   :database}]
               [:database      {:display_name "Database",      :base_type :type/Title,   :remapped_from :database_id}]
               [:schema_id     {:display_name "Schema ID",     :base_type :type/Text,    :remapped_to   :schema}]
               [:schema        {:display_name "Schema",        :base_type :type/Title,   :remapped_from :schema_id}]
               [:tables        {:display_name "Tables",        :base_type :type/Integer}]
               [:saved_queries {:display_name "Saved Queries", :base_type :type/Integer}]]
    :results  (common/reducible-query
                (->
                 {:with      [[:cards {:select    [[:t.db_id :database_id]
                                                   :t.schema
                                                   [:%count.* :saved_count]]
                                       :from      [[:report_card :c]]
                                       :left-join [[:metabase_table :t] [:= :c.table_id :t.id]]
                                       :where     [:not= :c.table_id nil]
                                       :group-by  [:t.db_id :t.schema]}]
                              [:schemas {:select    [[:db.id :database_id]
                                                     [:db.name :database_name]
                                                     :t.schema
                                                     [:%count.* :tables]]
                                         :from      [[:metabase_table :t]]
                                         :left-join [[:metabase_database :db] [:= :t.db_id :db.id]]
                                         :group-by  [:db.id :t.schema]
                                         :order-by  [[:db.id :asc] [:t.schema :asc]]}]]
                  :select    [:s.database_id
                              [:s.database_name :database]
                              [(hx/concat :s.database_id (hx/literal ".") :s.schema) :schema_id]
                              :s.schema
                              :s.tables
                              [:c.saved_count :saved_queries]]
                  :from      [[:schemas :s]]
                  :left-join [[:cards :c] [:and
                                           [:= :s.database_id :c.database_id]
                                           [:= :s.schema :c.schema]]]}
                 (common/add-search-clause query-string :s.schema)))}))
