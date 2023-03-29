(ns metabase-enterprise.audit-app.pages.queries
  (:require
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase-enterprise.audit-app.pages.common :as common]
   [metabase-enterprise.audit-app.pages.common.cards :as cards]
   [metabase.db.connection :as mdb.connection]
   [metabase.util.honey-sql-2 :as h2x]))

;; DEPRECATED Query that returns data for a two-series timeseries chart with number of queries ran and average query
;; running time broken out by day.
(defmethod audit.i/internal-query ::views-and-avg-execution-time-by-day
  [_]
  {:metadata [[:day              {:display_name "Date",                   :base_type :type/Date}]
              [:views            {:display_name "Views",                  :base_type :type/Integer}]
              [:avg_running_time {:display_name "Avg. Running Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:select   [[(h2x/cast :date :started_at) :day]
                          [:%count.* :views]
                          [[:avg :running_time] :avg_running_time]]
               :from     [:query_execution]
               :group-by [(h2x/cast :date :started_at)]
               :order-by [[(h2x/cast :date :started_at) :asc]]})})

;; Query that returns the 10 most-popular Cards based on number of query executions, in descending order.
(defmethod audit.i/internal-query ::most-popular
  [_]
  {:metadata [[:card_id    {:display_name "Card ID",    :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name  {:display_name "Card",       :base_type :type/Title,   :remapped_from :card_id}]
              [:executions {:display_name "Executions", :base_type :type/Integer}]]
   :results  (common/reducible-query
              {:select   [[:c.id :card_id]
                          [:c.name :card_name]
                          [:%count.* :executions]]
               :from     [[:query_execution :qe]]
               :join     [[:report_card :c] [:= :qe.card_id :c.id]]
               :group-by [:c.id]
               :order-by [[:executions :desc]]
               :limit    10})})

;; DEPRECATED Query that returns the 10 slowest-running Cards based on average query execution time, in descending
;; order.
(defmethod audit.i/internal-query ::slowest
  [_]
  {:metadata [[:card_id          {:display_name "Card ID",                :base_type :type/Integer, :remapped_to   :card_name}]
              [:card_name        {:display_name "Card",                   :base_type :type/Title,   :remapped_from :card_id}]
              [:avg_running_time {:display_name "Avg. Running Time (ms)", :base_type :type/Decimal}]]
   :results  (common/reducible-query
              {:select   [[:c.id :card_id]
                          [:c.name :card_name]
                          [[:avg :running_time] :avg_running_time]]
               :from     [[:query_execution :qe]]
               :join     [[:report_card :c] [:= :qe.card_id :c.id]]
               :group-by [:c.id]
               :order-by [[:avg_running_time :desc]]
               :limit    10})})

;; List of all failing questions
(defmethod audit.i/internal-query ::bad-table
  ([_]
   (audit.i/internal-query ::bad-table nil nil nil nil nil))
  ([_
    error-filter
    db-filter
    collection-filter
    sort-column
    sort-direction]
   {:metadata [[:card_id         {:display_name "Card ID",            :base_type :type/Integer :remapped_to   :card_name}]
               [:card_name       {:display_name "Question",           :base_type :type/Text    :remapped_from :card_id}]
               [:error_substr    {:display_name "Error",              :base_type :type/Text    :code          true}]
               [:collection_id   {:display_name "Collection ID",      :base_type :type/Integer :remapped_to   :collection_name}]
               [:collection_name {:display_name "Collection",         :base_type :type/Text    :remapped_from :collection_id}]
               [:database_id     {:display_name "Database ID",        :base_type :type/Integer :remapped_to   :database_name}]
               [:database_name   {:display_name "Database",           :base_type :type/Text    :remapped_from :database_id}]
               [:schema_name     {:display_name "Schema",             :base_type :type/Text}]
               [:table_id        {:display_name "Table ID",           :base_type :type/Integer :remapped_to   :table_name}]
               [:table_name      {:display_name "Table",              :base_type :type/Text    :remapped_from :table_id}]
               [:last_run_at     {:display_name "Last run at",        :base_type :type/DateTime}]
               [:total_runs      {:display_name "Total runs",         :base_type :type/Integer}]
               ;; if it appears a billion times each in 2 dashboards, that's 2 billion appearances
               [:num_dashboards  {:display_name "Dashboards it's in", :base_type :type/Integer}]
               [:user_id         {:display_name "Created By ID",      :base_type :type/Integer :remapped_to   :user_name}]
               [:user_name       {:display_name "Created By",         :base_type :type/Text    :remapped_from :user_id}]
               [:updated_at      {:display_name "Updated At",         :base_type :type/DateTime}]]
    :results (common/reducible-query
              (let [coll-name    [:coalesce :coll.name "Our Analytics"]
                    error-substr [:concat
                                  [:substring
                                   :latest_qe.error
                                   [:inline (if (= (mdb.connection/db-type) :mysql) 1 0)]
                                   [:inline 60]]
                                  "..."]
                    dash-count   [:coalesce :dash_card.count [:inline 0]]]
                (->
                 {:with      [cards/query-runs
                              cards/latest-qe
                              cards/dashboards-count]
                  :select    [[:card.id :card_id]
                              [:card.name :card_name]
                              [error-substr :error_substr]
                              :collection_id
                              [coll-name :collection_name]
                              :card.database_id
                              [:db.name :database_name]
                              [:t.schema :schema_name]
                              :card.table_id
                              [:t.name :table_name]
                              [:latest_qe.started_at :last_run_at]
                              [:query_runs.count :total_runs]
                              [dash-count :num_dashboards]
                              [:card.creator_id :user_id]
                              [(common/user-full-name :u) :user_name]
                              [:card.updated_at :updated_at]]
                  :from      [[:report_card :card]]
                  :left-join [[:collection :coll]                [:= :card.collection_id :coll.id]
                              [:metabase_database :db]           [:= :card.database_id :db.id]
                              [:metabase_table :t]               [:= :card.table_id :t.id]
                              [:core_user :u]                    [:= :card.creator_id :u.id]
                              :latest_qe                         [:= :card.id :latest_qe.card_id]
                              :query_runs                        [:= :card.id :query_runs.card_id]
                              :dash_card                         [:= :card.id :dash_card.card_id]]
                  :where     [:and
                              [:= :card.archived false]
                              [:<> :latest_qe.error nil]]}
                 (common/add-search-clause error-filter :latest_qe.error)
                 (common/add-search-clause db-filter :db.name)
                 (common/add-search-clause collection-filter coll-name)
                 (common/add-sort-clause
                  (or sort-column "card.name")
                  (or sort-direction "asc")))))}))

;; A list of all questions.
;;
;; Three possible argument lists. All arguments are always nullable.
;;
;; - [] :
;; Dump them all, sort by name ascending
;;
;; - [question-filter] :
;; Dump all filtered by the question-filter string, sort by name ascending.
;; question-filter filters on the `name` column in `cards` table.
;;
;; - [question-filter, collection-filter, sort-column, sort-direction] :
;; Dump all filtered by both question-filter and collection-filter,
;; sort by the given column and sort direction.
;; question-filter filters on the `name` column in `cards` table.
;; collection-filter filters on the `name` column in `collections` table.
;;
;; Sort column is given over in keyword form to honeysql. Default `card.name`
;;
;; Sort direction can be `asc` or `desc`, ascending and descending respectively. Default `asc`.
;;
;; All inputs have to be strings because that's how the magic middleware
;; that turns these functions into clojure-backed 'datasets' works.
(defmethod audit.i/internal-query ::table
  ([query-type]
   (audit.i/internal-query query-type nil nil nil nil))

  ([query-type question-filter]
   (audit.i/internal-query query-type question-filter nil nil nil))

  ([_
    question-filter
    collection-filter
    sort-column
    sort-direction]
   {:metadata [[:card_id         {:display_name "Card ID",              :base_type :type/Integer, :remapped_to   :card_name}]
               [:card_name       {:display_name "Name",                 :base_type :type/Name,    :remapped_from :card_id}]
               [:collection_id   {:display_name "Collection ID",        :base_type :type/Integer, :remapped_to   :collection_name}]
               [:collection_name {:display_name "Collection",           :base_type :type/Text,    :remapped_from :collection_id}]
               [:database_id     {:display_name "Database ID",          :base_type :type/Integer, :remapped_to   :database_name}]
               [:database_name   {:display_name "Database",             :base_type :type/Text,    :remapped_from :database_id}]
               [:table_id        {:display_name "Table ID",             :base_type :type/Integer, :remapped_to   :table_name}]
               [:table_name      {:display_name "Table",                :base_type :type/Text,    :remapped_from :table_id}]
               [:user_id         {:display_name "Created By ID",        :base_type :type/Integer, :remapped_to   :user_name}]
               [:user_name       {:display_name "Created By",           :base_type :type/Text,    :remapped_from :user_id}]
               [:cache_ttl       {:display_name "Cache Duration",       :base_type :type/Integer}]
               [:avg_exec_time   {:display_name "Average Runtime (ms)", :base_type :type/Integer}]
               [:total_runtime   {:display_name "Total Runtime (ms)",   :base_type :type/Integer}]
               [:query_runs      {:display_name "Query Runs",           :base_type :type/Integer}]
               [:public_link     {:display_name "Public Link",          :base_type :type/URL}]]
    :results  (common/reducible-query
               (->
                {:with      [cards/avg-exec-time-45
                             cards/total-exec-time-45
                             cards/query-runs-45]
                 :select    [[:card.id :card_id]
                             [:card.name :card_name]
                             :collection_id
                             [:coll.name :collection_name]
                             :card.database_id
                             [:db.name :database_name]
                             :card.table_id
                             [:t.name :table_name]
                             [:card.creator_id :user_id]
                             [(common/user-full-name :u) :user_name]
                             :card.cache_ttl
                             [:avg_exec_time_45.avg_running_time_ms :avg_exec_time]
                             [:total_runtime_45.total_running_time_ms :total_runtime]
                             [(common/zero-if-null :query_runs.count) :query_runs]
                             [(common/card-public-url :card.public_uuid) :public_link]]
                 :from      [[:report_card :card]]
                 :left-join [[:collection :coll]      [:= :card.collection_id :coll.id]
                             [:metabase_database :db] [:= :card.database_id :db.id]
                             [:metabase_table :t]     [:= :card.table_id :t.id]
                             [:core_user :u]          [:= :card.creator_id :u.id]
                             :avg_exec_time_45        [:= :card.id :avg_exec_time_45.card_id]
                             :total_runtime_45        [:= :card.id :total_runtime_45.card_id]
                             :query_runs              [:= :card.id :query_runs.card_id]]
                 :where     [:= :card.archived false]}
                (common/add-search-clause question-filter :card.name)
                (common/add-search-clause collection-filter :coll.name)
                (common/add-sort-clause
                 (or sort-column "card.name")
                 (or sort-direction "asc"))))}))
