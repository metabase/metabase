(ns metabase-enterprise.audit.pages.tables
  (:require [metabase-enterprise.audit.pages.common :as common]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]))

;; WITH table_executions AS (
;;     SELECT t.id AS table_id, count(*) AS executions
;;     FROM query_execution qe
;;     JOIN report_card card ON qe.card_id = card.id
;;     JOIN metabase_table t ON card.table_id = t.id
;;     GROUP BY t.id
;;     ORDER BY count(*) {{asc-or-desc}}
;;     LIMIT 10
;; )
;;
;; SELECT tx.table_id, (db.name || ' ' || t.schema || ' ' t.name) AS table_name, tx.executions
;; FROM table_executions tx
;; JOIN metabase_table     t ON tx.table_id = t.id
;; JOIN metabase_database db ON t.db_id = db.id
;; ORDER BY executions {{asc-or-desc}}
(defn- query-counts [asc-or-desc]
  {:metadata [[:table_id   {:display_name "Table ID",   :base_type :type/Integer, :remapped_to   :table_name}]
              [:table_name {:display_name "Table",      :base_type :type/Title,   :remapped_from :table_id}]
              [:executions {:display_name "Executions", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:with [[:table_executions {:select [[:t.id :table_id]
                                                   [:%count.* :executions]]
                                          :from   [[:query_execution :qe]]
                                          :join   [[:report_card :card]     [:= :qe.card_id :card.id]
                                                   [:metabase_table :t]     [:= :card.table_id :t.id]]
                                          :group-by [:t.id]
                                          :order-by [[:%count.* asc-or-desc]]
                                          :limit    10}]]
               :select [:tx.table_id
                        [(hx/concat :db.name (hx/literal " ") :t.schema (hx/literal " ") :t.name) :table_name]
                        :tx.executions]
               :from [[:table_executions :tx]]
               :join [[:metabase_table :t]     [:= :tx.table_id :t.id]
                      [:metabase_database :db] [:= :t.db_id :db.id]]
               :order-by [[:executions asc-or-desc]]})})

(defn ^:internal-query-fn most-queried
  "Query that returns the top-10 most-queried Tables, in descending order."
  []
  (query-counts :desc))

(defn ^:internal-query-fn least-queried
  "Query that returns the top-10 least-queried Tables (with at least one query execution), in ascending order."
  []
  (query-counts :asc))



(s/defn ^:internal-query-fn table
  "A table of Tables."
  ([]
   (table nil))
  ([query-string :- (s/maybe s/Str)]
   {:metadata [[:database_id        {:display_name "Database ID",        :base_type :type/Integer, :remapped_to   :database_name}]
               [:database_name      {:display_name "Database",           :base_type :type/Text,    :remapped_from :database_id}]
               [:schema_id          {:display_name "Schema ID",          :base_type :type/Text,   :remapped_to   :schema_name}]
               [:table_schema       {:display_name "Schema",             :base_type :type/Text,    :remapped_from :schema_id}]
               [:table_id           {:display_name "Table ID",           :base_type :type/Integer, :remapped_to   :table_name}]
               [:table_name         {:display_name "Table Name in DB",   :base_type :type/Name,    :remapped_from :table_id}]
               [:table_display_name {:display_name "Table Display Name", :base_type :type/Text}]]
    :results (common/reducible-query
               (->
                {:select   [[:db.id :database_id]
                            [:db.name :database_name]
                            [(hx/concat :db.id (hx/literal ".") :t.schema) :schema_id]
                            [:t.schema :table_schema]
                            [:t.id :table_id]
                            [:t.name :table_name]
                            [:t.display_name :table_display_name]]
                 :from     [[:metabase_table :t]]
                 :join     [[:metabase_database :db] [:= :t.db_id :db.id]]
                 :order-by [[:%lower.db.name  :asc]
                            [:%lower.t.schema :asc]
                            [:%lower.t.name   :asc]]
                 :where    [:= :t.active true]}
                (common/add-search-clause query-string :db.name :t.schema :t.name :t.display_name)))}))
