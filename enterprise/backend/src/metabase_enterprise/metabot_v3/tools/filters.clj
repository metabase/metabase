(ns metabase-enterprise.metabot-v3.tools.filters
  (:require
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

(defn- date-filter?
  "Tests if a date type filter is against a value without time component."
  [{:keys [operation value]}]
  (and (#{:date-equals :date-not-equals :date-before :date-on-or-before :date-after :date-on-or-after} operation)
       (string? value)
       (re-matches #"\d{4}-\d\d-\d\d" value)))

(defn- add-filter
  [query llm-filter]
  (let [llm-filter (update llm-filter :operation keyword)
        {:keys [column operation value]} llm-filter
        column (cond-> column
                 (date-filter? llm-filter) (lib/with-temporal-bucket :day))
        filter
        (case operation
          :is-null                      (lib/is-null column)
          :is-not-null                  (lib/not-null column)
          :string-is-empty              (lib/is-empty column)
          :string-is-not-empty          (lib/not-empty column)
          :is-true                      (lib/= column true)
          :is-false                     (lib/= column false)
          :year-equals                  (lib/= (lib/get-year column) value)
          :year-not-equals              (lib/!= (lib/get-year column) value)
          :quarter-equals               (lib/= (lib/get-quarter column) value)
          :quarter-not-equals           (lib/!= (lib/get-quarter column) value)
          :month-equals                 (lib/= (lib/get-month column) value)
          :month-not-equals             (lib/!= (lib/get-month column) value)
          :day-of-week-equals           (lib/= (lib/get-day-of-week column :iso) value)
          :day-of-week-not-equals       (lib/!= (lib/get-day-of-week column :iso) value)
          :hour-equals                  (lib/= (lib/get-hour column) value)
          :hour-not-equals              (lib/!= (lib/get-hour column) value)
          :minute-equals                (lib/= (lib/get-minute column) value)
          :minute-not-equals            (lib/!= (lib/get-minute column) value)
          :second-equals                (lib/= (lib/get-second column) value)
          :second-not-equals            (lib/!= (lib/get-second column) value)
          :date-equals                  (lib/= column value)
          :date-not-equals              (lib/!= column value)
          :date-before                  (lib/< column value)
          :date-on-or-before            (lib/<= column value)
          :date-after                   (lib/> column value)
          :date-on-or-after             (lib/>= column value)
          :string-equals                (lib/= column value)
          :string-not-equals            (lib/!= column value)
          :string-contains              (lib/contains column value)
          :string-not-contains          (lib/not (lib/contains column value))
          :string-starts-with           (lib/starts-with column value)
          :string-ends-with             (lib/ends-with column value)
          :number-equals                (lib/= column value)
          :number-not-equals            (lib/!= column value)
          :number-greater-than          (lib/> column value)
          :number-greater-than-or-equal (lib/>= column value)
          :number-less-than             (lib/< column value)
          :number-less-than-or-equal    (lib/<= column value)
          (throw (ex-info (str "unknown filter operation " operation) {:agent-error? true})))]
    (lib/filter query filter)))

(defn- add-breakout
  [query {:keys [column field_granularity]}]
  (let [expr (cond-> column
               (and field_granularity
                    (lib.types.isa/temporal? column))
               (lib/with-temporal-bucket (keyword field_granularity)))]
    (lib/breakout query expr)))

(defn- query-metric*
  [{:keys [metric-id filters group-by] :as _arguments}]
  (let [card (metabot-v3.tools.u/get-card metric-id)
        mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))
        base-query (->> (lib/query mp (lib.metadata/card mp metric-id))
                        lib/remove-all-breakouts)
        visible-cols (lib/visible-columns base-query)
        filter-field-id-prefix (metabot-v3.tools.u/card-field-id-prefix metric-id)
        query (as-> base-query $q
                (reduce add-filter
                        $q
                        (map #(metabot-v3.tools.u/resolve-column % filter-field-id-prefix visible-cols) filters))
                (reduce add-breakout
                        $q
                        (map #(metabot-v3.tools.u/resolve-column % filter-field-id-prefix visible-cols) group-by)))
        query-id (u/generate-nano-id)
        query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query_id query-id
     :query (lib/->legacy-MBQL query)
     :result_columns (into []
                           (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                           returned-cols)}))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (let [id 135]
      (query-metric* {:metric-id id})))
  -)

(defn query-metric
  "Create a query based on a metric."
  [{:keys [metric-id] :as arguments}]
  (try
    (if (int? metric-id)
      {:structured-output (query-metric* arguments)}
      {:output (str "Invalid metric_id " metric-id)})
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output (str "No metric found with metric_id " metric-id)}
        (metabot-v3.tools.u/handle-agent-error e)))))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (query-metric* {:metric-id 135
                    :filters
                    [{:operation "number-greater-than",
                      :field_id "field_[27]_[:field {:base-type :type/Float, :effective-type :type/Float} 257]",
                      :value 35}],
                    :group-by nil}))
  -)

(defn- base-query
  [data-source e]
  (let [{:keys [table_id query query_id report_id]} data-source
        model-id (lib.util/legacy-string-table-id->card-id table_id)
        handle-query (fn [query query_id]
                       (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database query))]
                         [(if query_id
                            (metabot-v3.tools.u/query-field-id-prefix query_id)
                            metabot-v3.tools.u/any-prefix-pattern)
                          (-> (lib/query mp query) lib/append-stage)]))]
    (cond
      model-id
      (if-let [model (metabot-v3.tools.u/get-card model-id)]
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id model))]
          [(metabot-v3.tools.u/card-field-id-prefix model-id)
           (lib/query mp (lib.metadata/card mp model-id))])
        (throw (ex-info (str "No table found with table_id " table_id) {:agent-error? true
                                                                        :data_source data-source})))

      table_id
      (let [table_id (cond-> table_id
                       (string? table_id) parse-long)]
        (if-let [table (metabot-v3.tools.u/get-table table_id :db_id)]
          (let [mp (lib.metadata.jvm/application-database-metadata-provider (:db_id table))]
            [(metabot-v3.tools.u/table-field-id-prefix table_id)
             (lib/query mp (lib.metadata/table mp table_id))])
          (throw (ex-info (str "No table found with table_id " table_id) {:agent-error? true
                                                                          :data_source data-source}))))

      report_id
      (if-let [card (metabot-v3.tools.u/get-card report_id)]
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))]
          [(metabot-v3.tools.u/card-field-id-prefix report_id)
           (lib/query mp (cond-> (lib.metadata/card mp report_id)
                           ;; pivot questions have strange result-columns so we work with the dataset-query
                           (#{:question} (:type card)) (get :dataset-query)))])
        (throw (ex-info (str "No report found with report_id " report_id) {:agent-error? true
                                                                           :data_source data-source})))

      query
      (handle-query query query_id)

      query_id
      (if-let [query (metabot-v3.envelope/find-query e query_id)]
        (handle-query query query_id)
        (throw (ex-info (str "No query found with query_id " query_id) {:agent-error? true
                                                                        :data_source data-source})))

      :else
      (throw (ex-info "Invalid data_source" {:agent-error? true
                                             :data_source data-source})))))

(defn filter-records
  "Add `filters` to the query referenced by `data-source`"
  ([arguments]
   (filter-records arguments nil))
  ([{:keys [data-source filters] :as _arguments} e]
   (try
     (let [[filter-field-id-prefix base] (base-query data-source e)
           returned-cols (lib/returned-columns base)
           query (reduce add-filter base (map #(metabot-v3.tools.u/resolve-column % filter-field-id-prefix returned-cols) filters))
           query-id (u/generate-nano-id)
           query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)]
       {:structured-output
        {:type :query
         :query_id query-id
         :query (lib/->legacy-MBQL query)
         :result_columns (into []
                               (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                               (lib/returned-columns query))}})
     (catch Exception ex
       (metabot-v3.tools.u/handle-agent-error ex)))))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (filter-records {:data-source {:table_id 27}
                     :filters [{:operation "number-greater-than"
                                :field_id "field_[27]_[:field {:base-type :type/Float, :effective-type :type/Float} 257]"
                                :value 50}]}))
  -)
