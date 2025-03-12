(ns metabase-enterprise.metabot-v3.tools.filters
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

(defn- apply-bucket
  [column bucket]
  (case bucket
    :week-of-year (lib/get-week column :iso)
    :day-of-week  (lib/get-day-of-week column :iso)
    (lib/with-temporal-bucket column bucket)))

(defn- add-filter
  [query llm-filter]
  (let [llm-filter (update llm-filter :operation keyword)
        {:keys [column bucket operation value values]} llm-filter
        expr (cond-> column
               (and bucket
                    (lib.types.isa/temporal? column))
               (apply-bucket (keyword bucket)))
        filter
        (case operation
          :is-null                      (lib/is-null expr)
          :is-not-null                  (lib/not-null expr)
          :string-is-empty              (lib/is-empty expr)
          :string-is-not-empty          (lib/not-empty expr)
          :is-true                      (lib/= expr true)
          :is-false                     (lib/= expr false)
          :equals                       (if values
                                          (apply lib/= expr values)
                                          (lib/= expr value))
          :not-equals                   (if values
                                          (apply lib/!= expr values)
                                          (lib/!= expr value))
          :greater-than                 (lib/> expr value)
          :greater-than-or-equal        (lib/>= expr value)
          :less-than                    (lib/< expr value)
          :less-than-or-equal           (lib/<= expr value)
          :year-equals                  (if values
                                          (apply lib/= (lib/get-year expr) values)
                                          (lib/= (lib/get-year expr) value))
          :year-not-equals              (if values
                                          (apply lib/!= (lib/get-year expr) values)
                                          (lib/!= (lib/get-year expr) value))
          :quarter-equals               (if values
                                          (apply lib/= (lib/get-quarter expr) values)
                                          (lib/= (lib/get-quarter expr) value))
          :quarter-not-equals           (if values
                                          (apply lib/!= (lib/get-quarter expr) values)
                                          (lib/!= (lib/get-quarter expr) value))
          :month-equals                 (if values
                                          (apply lib/= (lib/get-month expr) values)
                                          (lib/= (lib/get-month expr) value))
          :month-not-equals             (if values
                                          (apply lib/!= (lib/get-month expr) values)
                                          (lib/!= (lib/get-month expr) value))
          :day-of-week-equals           (if values
                                          (apply lib/= (lib/get-day-of-week expr :iso) values)
                                          (lib/= (lib/get-day-of-week expr :iso) value))
          :day-of-week-not-equals       (if values
                                          (apply lib/!= (lib/get-day-of-week expr :iso) values)
                                          (lib/!= (lib/get-day-of-week expr :iso) value))
          :hour-equals                  (if values
                                          (apply lib/= (lib/get-hour expr) values)
                                          (lib/= (lib/get-hour expr) value))
          :hour-not-equals              (if values
                                          (apply lib/!= (lib/get-hour expr) values)
                                          (lib/!= (lib/get-hour expr) value))
          :minute-equals                (if values
                                          (apply lib/= (lib/get-minute expr) values)
                                          (lib/= (lib/get-minute expr) value))
          :minute-not-equals            (if values
                                          (apply lib/!= (lib/get-minute expr) values)
                                          (lib/!= (lib/get-minute expr) value))
          :second-equals                (if values
                                          (apply lib/= (lib/get-second expr) values)
                                          (lib/= (lib/get-second expr) value))
          :second-not-equals            (if values
                                          (apply lib/!= (lib/get-second expr) values)
                                          (lib/!= (lib/get-second expr) value))
          :date-equals                  (if values
                                          (apply lib/= expr values)
                                          (lib/= expr value))
          :date-not-equals              (if values
                                          (apply lib/!= expr values)
                                          (lib/!= expr value))
          :date-before                  (lib/< expr value)
          :date-on-or-before            (lib/<= expr value)
          :date-after                   (lib/> expr value)
          :date-on-or-after             (lib/>= expr value)
          :string-equals                (if values
                                          (apply lib/= expr values)
                                          (lib/= expr value))
          :string-not-equals            (if values
                                          (apply lib/!= expr values)
                                          (lib/!= expr value))
          :string-contains              (if values
                                          (apply lib/contains expr values)
                                          (lib/contains expr value))
          :string-not-contains          (if values
                                          (apply lib/not (lib/contains expr values))
                                          (lib/not (lib/contains expr value)))
          :string-starts-with           (if values
                                          (apply lib/starts-with expr values)
                                          (lib/starts-with expr value))
          :string-ends-with             (if values
                                          (apply lib/ends-with expr values)
                                          (lib/ends-with expr value))
          :number-equals                (if values
                                          (apply lib/= expr values)
                                          (lib/= expr value))
          :number-not-equals            (if values
                                          (apply lib/!= expr values)
                                          (lib/!= expr value))
          :number-greater-than          (lib/> expr value)
          :number-greater-than-or-equal (lib/>= expr value)
          :number-less-than             (lib/< expr value)
          :number-less-than-or-equal    (lib/<= expr value)
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
  [data-source]
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

      :else
      (throw (ex-info "Invalid data_source" {:agent-error? true
                                             :data_source data-source})))))

(defn filter-records
  "Add `filters` to the query referenced by `data-source`"
  [{:keys [data-source filters] :as _arguments}]
  (try
    (let [[filter-field-id-prefix base] (base-query data-source)
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
      (metabot-v3.tools.u/handle-agent-error ex))))

(comment
  (toucan2.core/select :model/Field)
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (-> (filter-records #_{:data-source {:table_id 3}
                           :filters [{:operation "number-greater-than"
                                      :field_id "t3/6"
                                      :value 50}]}
         {:data-source {:table_id 1}
          :filters [{:operation "greater-than"
                     :bucket "month-of-year"
                     :field_id "t1/3"
                     :value #_"2020-01-01" 1}]})
        :structured-output :query metabase.query-processor/process-query :data :native_form :query))
  -)
