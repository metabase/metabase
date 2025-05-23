(ns metabase-enterprise.metabot-v3.tools.filters
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

(defn- apply-filter-bucket
  [column bucket]
  (case bucket
    :second-of-minute (lib/get-second column)
    :minute-of-hour   (lib/get-minute column)
    :hour-of-day      (lib/get-hour column)
    :day-of-week      (lib/get-day-of-week column :iso)
    :day-of-month     (lib/get-day column)
    :week-of-year     (lib/get-week column :iso)
    :month-of-year    (lib/get-month column)
    :quarter-of-year  (lib/get-quarter column)
    :year-of-era      (lib/get-year column)
    ;; these below work in queries but not in the UI
    #_:millisecond
    #_:second
    #_:minute
    #_:hour
    #_:day
    #_:week
    #_:month
    #_:quarter
    #_:year
    #_:day-of-year
    (lib/with-temporal-bucket column bucket)))

(defn- filter-bucketed-column
  [{:keys [column bucket]}]
  (cond-> column
    (and bucket
         (lib.types.isa/temporal? column))
    (apply-filter-bucket bucket)))

(defn- apply-bucket
  [column bucket]
  (case bucket
    ;; these two work in queries but not in the UI
    :day-of-week  (lib/get-day-of-week column :iso)
    :week-of-year (lib/get-week column :iso)
    #_:second-of-minute
    #_:minute-of-hour
    #_:hour-of-day
    #_:day-of-month
    #_:month-of-year
    #_:quarter-of-year
    #_:year-of-era
    #_:millisecond
    #_:second
    #_:minute
    #_:hour
    #_:day
    #_:week
    #_:month
    #_:quarter
    #_:year
    #_:day-of-year
    (lib/with-temporal-bucket column bucket)))

(defn- bucketed-column
  [{:keys [column bucket]}]
  (cond-> column
    (and bucket
         (lib.types.isa/temporal? column))
    (apply-bucket bucket)))

(defn- add-filter
  [query llm-filter]
  (let [{:keys [operation value values]} llm-filter
        expr (filter-bucketed-column llm-filter)
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
  [query {:keys [column field-granularity]}]
  (let [expr (cond-> column
               (and field-granularity
                    (lib.types.isa/temporal? column))
               (lib/with-temporal-bucket field-granularity))]
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
     :query-id query-id
     :query (lib/->legacy-MBQL query)
     :result-columns (into []
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

(defn- add-aggregation
  [query aggregation]
  (let [expr     (bucketed-column aggregation)
        sort-order (:sort-order aggregation)
        agg-expr (case (:function aggregation)
                   :count          (lib/count)
                   :count-distinct (lib/distinct expr)
                   :sum            (lib/sum expr)
                   :min            (lib/min expr)
                   :max            (lib/max expr)
                   :avg            (lib/avg expr))
        query-with-aggregation (lib/aggregate query agg-expr)]
    (if sort-order
      (let [query-aggregations (lib/aggregations query-with-aggregation)
            last-aggregation-idx (dec (count query-aggregations))]
        (lib/order-by query-with-aggregation (lib/aggregation-ref query-with-aggregation last-aggregation-idx) sort-order))
      query-with-aggregation)))

(defn- expression?
  [expr-or-column]
  (vector? expr-or-column))

(defn- add-fields
  [query projection]
  (->> projection
       (map (fn [[expr-or-column expr-name]]
              (if (expression? expr-or-column)
                (lib/expression-ref query expr-name)
                ;; bucketed columns don't work in the UI
                expr-or-column)))
       (lib/with-fields query)))

(defn- add-order-by [query {:keys [field direction]}]
  (lib/order-by query (:column field) direction))

(defn- add-limit [query limit]
  (if limit
    (lib/limit query limit)
    query))

(defn- query-model*
  [{:keys [model-id fields filters aggregations group-by order-by limit] :as _arguments}]
  (let [card (metabot-v3.tools.u/get-card model-id)
        mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))
        base-query (lib/query mp (lib.metadata/card mp model-id))
        visible-cols (lib/visible-columns base-query)
        filter-field-id-prefix (metabot-v3.tools.u/card-field-id-prefix model-id)
        resolve-visible-column  #(metabot-v3.tools.u/resolve-column % filter-field-id-prefix visible-cols)
        resolve-order-by-column (fn [{:keys [field direction]}] {:field (resolve-visible-column field) :direction direction})
        projection (map (comp (juxt filter-bucketed-column (fn [{:keys [column bucket]}]
                                                             (let [column (cond-> column
                                                                            bucket (assoc :unit bucket))]
                                                               (lib/display-name base-query -1 column :long))))
                              resolve-visible-column)
                        fields)
        reduce-query (fn [query f coll] (reduce f query coll))
        query (-> base-query
                  (reduce-query (fn [query [expr-or-column expr-name]]
                                  (lib/expression query expr-name expr-or-column))
                                (filter (comp expression? first) projection))
                  (add-fields projection)
                  (reduce-query add-filter (map resolve-visible-column filters))
                  (reduce-query add-aggregation (map resolve-visible-column aggregations))
                  (reduce-query add-breakout (map resolve-visible-column group-by))
                  (reduce-query add-order-by (map resolve-order-by-column order-by))
                  (add-limit limit))
        query-id (u/generate-nano-id)
        query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query-id query-id
     :query (lib/->legacy-MBQL query)
     :result-columns (into []
                           (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                           returned-cols)}))

(defn query-model
  "Create a query based on a model."
  [{:keys [model-id] :as arguments}]
  (try
    (if (int? model-id)
      {:structured-output (query-model* arguments)}
      {:output (str "Invalid model_id " model-id)})
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output (str "No model found with model_id " model-id)}
        (metabot-v3.tools.u/handle-agent-error e)))))

(defn- base-query
  [data-source]
  (let [{:keys [table-id query query-id report-id]} data-source
        model-id (lib.util/legacy-string-table-id->card-id table-id)
        handle-query (fn [query query-id]
                       (let [database-id (:database query)
                             _ (api/read-check :model/Database database-id)
                             mp (lib.metadata.jvm/application-database-metadata-provider database-id)]
                         [(if query-id
                            (metabot-v3.tools.u/query-field-id-prefix query-id)
                            metabot-v3.tools.u/any-prefix-pattern)
                          (-> (lib/query mp query) lib/append-stage)]))]
    (cond
      model-id
      (if-let [model (metabot-v3.tools.u/get-card model-id)]
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id model))]
          [(metabot-v3.tools.u/card-field-id-prefix model-id)
           (lib/query mp (lib.metadata/card mp model-id))])
        (throw (ex-info (str "No table found with table_id " table-id) {:agent-error? true
                                                                        :data-source data-source})))

      table-id
      (let [table-id (cond-> table-id
                       (string? table-id) parse-long)]
        (if-let [table (metabot-v3.tools.u/get-table table-id :db_id)]
          (let [mp (lib.metadata.jvm/application-database-metadata-provider (:db_id table))]
            [(metabot-v3.tools.u/table-field-id-prefix table-id)
             (lib/query mp (lib.metadata/table mp table-id))])
          (throw (ex-info (str "No table found with table_id " table-id) {:agent-error? true
                                                                          :data-source data-source}))))

      report-id
      (if-let [card (metabot-v3.tools.u/get-card report-id)]
        (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))]
          [(metabot-v3.tools.u/card-field-id-prefix report-id)
           (lib/query mp (cond-> (lib.metadata/card mp report-id)
                           ;; pivot questions have strange result-columns so we work with the dataset-query
                           (#{:question} (:type card)) (get :dataset-query)))])
        (throw (ex-info (str "No report found with report_id " report-id) {:agent-error? true
                                                                           :data-source data-source})))

      query
      (handle-query query query-id)

      :else
      (throw (ex-info "Invalid data_source" {:agent-error? true
                                             :data-source data-source})))))

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
        :query-id query-id
        :query (lib/->legacy-MBQL query)
        :result-columns (into []
                              (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                              (lib/returned-columns query))}})
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))

(comment
  (require '[metabase.query-processor :as qp]
           '[toucan2.core :as t2])
  (t2/select :model/Field)
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (-> (filter-records #_{:data-source {:tabl-id 3}
                           :filters [{:operation "number-greater-than"
                                      :field-id "t3/6"
                                      :value 50}]}
         {:data-source {:table-id 1}
          :filters [{:operation "greater-than"
                     :bucket "month-of-year"
                     :field-id "t1/3"
                     :value #_"2020-01-01" 1}]})
        :structured-output :query qp/process-query :data :native_form :query))
  -)
