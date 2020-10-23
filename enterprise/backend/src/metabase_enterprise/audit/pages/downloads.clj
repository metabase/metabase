(ns metabase-enterprise.audit.pages.downloads
  "Audit queries returning info about query downloads. Query downloads are any query executions whose results are returned
  as CSV/JSON/XLS."
  (:require [honeysql.core :as hsql]
            [metabase-enterprise.audit.pages.common :as common]
            [metabase.db :as mdb]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx]
            [schema.core :as s]))

;;; ------------------------------------------------ per-day-by-size -------------------------------------------------

(s/defn ^:internal-query-fn per-day-by-size
  "Pairs of count of rows downloaded and date downloaded for the 1000 largest (in terms of row count) queries over the
  past 30 days. Intended to power scatter plot."
  []
  {:metadata [[:date      {:display_name "Day",           :base_type :type/DateTime}]
              [:rows      {:display_name "Rows in Query", :base_type :type/Integer}]
              [:user_id   {:display_name "User ID",       :base_type :type/Integer, :remapped_to :user_name}]
              [:user_name {:display_name "User",          :base_type :type/Text,    :remapped_from :user_id}]]
   :results  (common/reducible-query
               {:select   [[:qe.started_at :date]
                           [:qe.result_rows :rows]
                           [:qe.executor_id :user_id]
                           [(common/user-full-name :u) :user_name]]
                :from     [[:query_execution :qe]]
                :left-join [[:core_user :u] [:= :qe.executor_id :u.id]]
                :where    [:and
                           [:> :qe.started_at (sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -30 :day)]
                           (common/query-execution-is-download :qe)]
                :order-by [[:qe.result_rows :desc]]
                :limit    1000})})


;;; ---------------------------------------------------- per-user ----------------------------------------------------

(s/defn ^:internal-query-fn per-user
  "Total count of query downloads broken out by user, ordered by highest total, for the top 10 users."
  []
  {:metadata [[:user_id   {:display_name "User ID",   :base_type :type/Integer, :remapped_to :user_name}]
              [:user_name {:display_name "User",      :base_type :type/Text,    :remapped_from :user_id}]
              [:downloads {:display_name "Downloads", :base_type :type/Integer}]]
   :results  (common/reducible-query
               {:with     [[:downloads_by_user
                            {:select   [[:qe.executor_id :user_id]
                                        [:%count.* :downloads]]
                             :from     [[:query_execution :qe]]
                             :where    (common/query-execution-is-download :qe)
                             :group-by [:qe.executor_id]
                             :order-by [[:%count.* :desc]]
                             :limit    10}]]
                :select   [[:d.user_id :user_id]
                           [(common/user-full-name :u) :user_name]
                           [:d.downloads :downloads]]
                :from     [[:downloads_by_user :d]]
                :join     [[:core_user :u] [:= :d.user_id :u.id]]
                :order-by [[:d.downloads :desc]]})})


;;; ---------------------------------------------------- by-size -----------------------------------------------------

(def ^:private bucket-maxes
  "Add/remove numbers here to adjust buckets returned by the `by-size` query."
  [     10
       100
      1000
      5000
     10000
     50000
    100000
    500000
   1000000])

(def ^:private rows->bucket-case-expression
  "`CASE` expression to put `result_rows` in appropriate buckets. Looks something like:

    CASE ... result_rows <= 100 THEN 100 ..."
  (apply hsql/call :case (concat
                          (mapcat (fn [bucket-max]
                                    [[:<= :result_rows bucket-max] bucket-max])
                                  bucket-maxes)
                          [:else -1])))

(def ^:private bucket-ranges
  "Pairs like [[0 10], [11 100], ...]"
  (reduce
   (fn [acc bucket-max]
     (conj acc [(or (some-> acc last last inc) 0) ; get min from last pair in acc or 0
                bucket-max]))
   []
   bucket-maxes))

(defn- format-number-add-commas
  "Format number to string adding commas as thousands separators."
  [^Number n]
  (.format (java.text.DecimalFormat. "#,###") n))

(defn- bucket-range->literal
  "Given a bucket range pair like [101 1000] return a formatted string including commas like `101-1,000`."
  [[bucket-min bucket-max]]
  (hx/literal (format "%s-%s" (format-number-add-commas bucket-min) (format-number-add-commas bucket-max))))

(def ^:private bucket->range-str-case-expression
  "`CASE` expression to generate range strings for each bucket. Looks something like:

    CASE ... (rows_bucket_max = 1000) THEN '101-1,000' ..."
  (apply hsql/call :case (concat
                          (mapcat (fn [[_ bucket-max :as bucket-range]]
                                    [[:= :rows_bucket_max bucket-max] (bucket-range->literal bucket-range)])
                                  bucket-ranges)
                          [[:= :rows_bucket_max -1]
                           (hx/literal (format "> %s" (format-number-add-commas (last bucket-maxes))))])))

(s/defn ^:internal-query-fn by-size
  "Query download count broken out by bucketed number of rows of query. E.g. 10 downloads of queries with 0-10 rows, 15
  downloads of queries with 11-100, etc. Intended to power bar chart."
  []
  {:metadata [[:rows      {:display_name "Rows Downloaded", :base_type :type/Text}]
              [:downloads {:display_name "Downloads",       :base_type :type/Integer}]]
   :results  (common/reducible-query
               {:with     [[:bucketed_downloads
                            {:select [[rows->bucket-case-expression :rows_bucket_max]]
                             :from   [:query_execution]
                             :where  [:and
                                      (common/query-execution-is-download :query_execution)
                                      [:not= :result_rows nil]]}]]
                :select   [[bucket->range-str-case-expression :rows]
                           [:%count.* :downloads]]
                :from     [:bucketed_downloads]
                :group-by [:rows_bucket_max]
                :order-by [[:rows_bucket_max :asc]]})})


;;; ----------------------------------------------------- table ------------------------------------------------------

(s/defn ^:internal-query-fn table
  "Table showing all query downloads ordered by most recent."
  []
  {:metadata [[:downloaded_at   {:display_name "Downloaded At",   :base_type :type/DateTime}]
              [:rows_downloaded {:display_name "Rows Downloaded", :base_type :type/Integer}]
              [:card_id         {:display_name "Card ID",         :base_type :type/Integer, :remapped_to :card_name}]
              [:card_name       {:display_name "Query",           :base_type :type/Text,    :remapped_from :card_id}]
              [:query_type      {:display_name "Query Type",      :base_type :type/Text}]
              [:database_id     {:display_name "Database ID",     :base_type :type/Integer, :remapped_to :database}]
              [:database        {:display_name "Database",        :base_type :type/Text,    :remapped_from :database_id}]
              [:source_table_id {:display_name "Source Table ID", :base_type :type/Integer, :remapped_to :source_table}]
              [:source_table    {:display_name "Source Table",    :base_type :type/Text,    :remapped_from :source_table_id}]
              [:user_id         {:display_name "User ID",         :base_type :type/Integer, :remapped_to :user_name}]
              [:user_name       {:display_name "User",            :base_type :type/Text,    :remapped_from :user_id}]]
   :results  (common/reducible-query
              {:select    [[:qe.started_at :downloaded_at]
                           [:qe.result_rows :rows_downloaded]
                           [:card.id :card_id]
                           [(common/card-name-or-ad-hoc :card) :card_name]
                           [(common/native-or-gui :qe) :query_type]
                           [:db.id :database_id]
                           [:db.name :database]
                           [:t.id :source_table_id]
                           [:t.name :source_table]
                           [:qe.executor_id :user_id]
                           [(common/user-full-name :u) :user_name]]
               :from      [[:query_execution :qe]]
               :left-join [[:report_card :card] [:= :card.id :qe.card_id]
                           [:metabase_database :db] [:= :qe.database_id :db.id]
                           [:metabase_table :t] [:= :card.table_id :t.id]
                           [:core_user :u] [:= :qe.executor_id :u.id]]
               :where     (common/query-execution-is-download :qe)
               :order-by  [[:qe.started_at :desc]]})})
