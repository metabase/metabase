(ns metabase-enterprise.metabot-v3.tools.filters
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

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
  (if-let [segment-id (:segment-id llm-filter)]
    ;; Segment-based filter
    (if-let [segment (lib.metadata/segment query segment-id)]
      (lib/filter query segment)
      (throw (ex-info (tru "Segment with id {0} not found" segment-id)
                      {:agent-error? true
                       :status-code 404
                       :segment-id segment-id})))
    ;; Standard field-based filter logic
    (let [{:keys [operation value values]} llm-filter
          expr (filter-bucketed-column llm-filter)
          with-values-or-value (fn with-values-or-value
                                 ([f]
                                  (with-values-or-value f expr))
                                 ([f expr]
                                  (if values
                                    (apply f expr values)
                                    (f expr value))))
          string-match (fn [match-fn]
                         (-> (with-values-or-value match-fn)
                             (lib.options/update-options assoc :case-sensitive false)))
          filter
          (case operation
            :is-null                      (lib/is-null expr)
            :is-not-null                  (lib/not-null expr)
            :string-is-empty              (lib/is-empty expr)
            :string-is-not-empty          (lib/not-empty expr)
            :is-true                      (lib/= expr true)
            :is-false                     (lib/= expr false)
            :equals                       (with-values-or-value lib/=)
            :not-equals                   (with-values-or-value lib/!=)
            :greater-than                 (lib/> expr value)
            :greater-than-or-equal        (lib/>= expr value)
            :less-than                    (lib/< expr value)
            :less-than-or-equal           (lib/<= expr value)
            :year-equals                  (with-values-or-value lib/=  (lib/get-year expr))
            :year-not-equals              (with-values-or-value lib/!= (lib/get-year expr))
            :quarter-equals               (with-values-or-value lib/=  (lib/get-quarter expr))
            :quarter-not-equals           (with-values-or-value lib/!= (lib/get-quarter expr))
            :month-equals                 (with-values-or-value lib/=  (lib/get-month expr))
            :month-not-equals             (with-values-or-value lib/!= (lib/get-month expr))
            :day-of-week-equals           (with-values-or-value lib/=  (lib/get-day-of-week expr :iso))
            :day-of-week-not-equals       (with-values-or-value lib/!= (lib/get-day-of-week expr :iso))
            :hour-equals                  (with-values-or-value lib/=  (lib/get-hour expr))
            :hour-not-equals              (with-values-or-value lib/!= (lib/get-hour expr))
            :minute-equals                (with-values-or-value lib/=  (lib/get-minute expr))
            :minute-not-equals            (with-values-or-value lib/!= (lib/get-minute expr))
            :second-equals                (with-values-or-value lib/=  (lib/get-second expr))
            :second-not-equals            (with-values-or-value lib/!= (lib/get-second expr))
            :date-equals                  (with-values-or-value lib/=)
            :date-not-equals              (with-values-or-value lib/!=)
            :date-before                  (lib/< expr value)
            :date-on-or-before            (lib/<= expr value)
            :date-after                   (lib/> expr value)
            :date-on-or-after             (lib/>= expr value)
            :string-equals                (with-values-or-value lib/=)
            :string-not-equals            (with-values-or-value lib/!=)
            :string-contains              (string-match lib/contains)
            :string-not-contains          (string-match lib/does-not-contain)
            :string-starts-with           (string-match lib/starts-with)
            :string-ends-with             (string-match lib/ends-with)
            :number-equals                (with-values-or-value lib/=)
            :number-not-equals            (with-values-or-value lib/!=)
            :number-greater-than          (lib/> expr value)
            :number-greater-than-or-equal (lib/>= expr value)
            :number-less-than             (lib/< expr value)
            :number-less-than-or-equal    (lib/<= expr value)
            (throw (ex-info (str "unknown filter operation " operation)
                            {:agent-error? true :status-code 400})))]
      (lib/filter query filter))))

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
        mp (lib-be/application-database-metadata-provider (:database_id card))
        base-query (->> (lib/query mp (lib.metadata/card mp metric-id))
                        lib/remove-all-breakouts)
        field-id-prefix (metabot-v3.tools.u/card-field-id-prefix metric-id)
        visible-cols (lib/visible-columns base-query)
        resolve-visible-column #(metabot-v3.tools.u/resolve-column % field-id-prefix visible-cols)
        ;; Separate segment filters from field filters before column resolution
        resolved-filters (map #(if (:segment-id %) % (resolve-visible-column %)) filters)
        query (as-> base-query $q
                (reduce add-filter $q resolved-filters)
                (reduce add-breakout
                        $q
                        (map #(metabot-v3.tools.u/resolve-column % field-id-prefix visible-cols) group-by)))
        query-id (u/generate-nano-id)
        query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query-id query-id
     :query query
     :result-columns (into []
                           (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                           returned-cols)}))

(defn query-metric
  "Create a query based on a metric."
  [{:keys [metric-id] :as arguments}]
  (try
    (if (int? metric-id)
      {:structured-output (query-metric* arguments)}
      (throw (ex-info (str "Invalid metric_id " metric-id)
                      {:agent-error? true :status-code 400})))
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output (str "No metric found with metric_id " metric-id) :status-code 404}
        (metabot-v3.tools.u/handle-agent-error e)))))

(defn- apply-aggregation-sort-order
  "If sort-order is specified, add an order-by clause for the last aggregation in the query."
  [query sort-order]
  (if sort-order
    (let [query-aggregations (lib/aggregations query)
          last-aggregation-idx (dec (count query-aggregations))]
      (lib/order-by query (lib/aggregation-ref query last-aggregation-idx) sort-order))
    query))

(defn- add-aggregation
  [query aggregation]
  (let [sort-order (:sort-order aggregation)
        query-with-aggregation
        (if-let [measure-id (:measure-id aggregation)]
          ;; Measure-based aggregation
          (if-let [measure (lib.metadata/measure query measure-id)]
            (lib/aggregate query measure)
            (throw (ex-info (tru "Measure with id {0} not found" measure-id)
                            {:agent-error? true
                             :status-code 404
                             :measure-id measure-id})))
          ;; Field-based aggregation
          (let [expr (bucketed-column aggregation)
                agg-expr (case (:function aggregation)
                           :count          (lib/count)
                           :count-distinct (lib/distinct expr)
                           :sum            (lib/sum expr)
                           :min            (lib/min expr)
                           :max            (lib/max expr)
                           :avg            (lib/avg expr))]
            (lib/aggregate query agg-expr)))]
    (apply-aggregation-sort-order query-with-aggregation sort-order)))

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
        mp (lib-be/application-database-metadata-provider (:database_id card))
        base-query (lib/query mp (lib.metadata/card mp model-id))
        field-id-prefix (metabot-v3.tools.u/card-field-id-prefix model-id)
        visible-cols (lib/visible-columns base-query)
        resolve-visible-column #(metabot-v3.tools.u/resolve-column % field-id-prefix visible-cols)
        resolve-order-by-column (fn [{:keys [field direction]}] {:field (resolve-visible-column field) :direction direction})
        projection (map (comp (juxt filter-bucketed-column (fn [{:keys [column bucket]}]
                                                             (let [column (cond-> column
                                                                            bucket (assoc :unit bucket))]
                                                               (lib/display-name base-query -1 column :long))))
                              resolve-visible-column)
                        fields)
        ;; Measures and segments don't require column resolution
        resolved-aggregations (map #(if (:measure-id %) % (resolve-visible-column %)) aggregations)
        resolved-filters (map #(if (:segment-id %) % (resolve-visible-column %)) filters)
        reduce-query (fn [query f coll] (reduce f query coll))
        query (-> base-query
                  (reduce-query (fn [query [expr-or-column expr-name]]
                                  (lib/expression query expr-name expr-or-column))
                                (filter (comp expression? first) projection))
                  (add-fields projection)
                  (reduce-query add-filter resolved-filters)
                  (reduce-query add-aggregation resolved-aggregations)
                  (reduce-query add-breakout (map resolve-visible-column group-by))
                  (reduce-query add-order-by (map resolve-order-by-column order-by))
                  (add-limit limit))
        query-id (u/generate-nano-id)
        query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query-id query-id
     :query query
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

(defn- resolve-datasource
  "Resolve datasource parameters to [field-id-prefix base-query] tuple.
   Accepts either {:table-id id} or {:model-id id}."
  [{:keys [table-id model-id]}]
  (cond
    model-id
    [(metabot-v3.tools.u/card-field-id-prefix model-id) (metabot-v3.tools.u/card-query model-id)]

    table-id
    [(metabot-v3.tools.u/table-field-id-prefix table-id) (metabot-v3.tools.u/table-query table-id)]

    :else
    (throw (ex-info "Either table-id or model-id must be provided" {:agent-error? true}))))

(defn- query-datasource*
  [{:keys [fields filters aggregations group-by order-by limit] :as arguments}]
  (let [[filter-field-id-prefix base-query] (resolve-datasource arguments)
        visible-cols (lib/visible-columns base-query)
        resolve-visible-column #(metabot-v3.tools.u/resolve-column % filter-field-id-prefix visible-cols)
        resolve-order-by-column (fn [{:keys [field direction]}] {:field (resolve-visible-column field) :direction direction})
        projection (map (comp (juxt filter-bucketed-column (fn [{:keys [column bucket]}]
                                                             (let [column (cond-> column
                                                                            bucket (assoc :unit bucket))]
                                                               (lib/display-name base-query -1 column :long))))
                              resolve-visible-column)
                        fields)
        ;; Measures and segments don't require column resolution
        all-aggregations (map #(if (:measure-id %) % (resolve-visible-column %)) aggregations)
        all-filters (map #(if (:segment-id %) % (resolve-visible-column %)) filters)
        reduce-query (fn [query f coll] (reduce f query coll))
        query (-> base-query
                  (reduce-query (fn [query [expr-or-column expr-name]]
                                  (lib/expression query expr-name expr-or-column))
                                (filter (comp expression? first) projection))
                  (add-fields projection)
                  (reduce-query add-filter all-filters)
                  (reduce-query add-aggregation all-aggregations)
                  (reduce-query add-breakout (map resolve-visible-column group-by))
                  (reduce-query add-order-by (map resolve-order-by-column order-by))
                  (add-limit limit))
        query-id (u/generate-nano-id)
        query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)
        returned-cols (lib/returned-columns query)]
    {:type :query
     :query-id query-id
     :query query
     :result-columns (into []
                           (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                           returned-cols)}))

(defn query-datasource
  "Create a query based on a datasource (table or model)."
  [{:keys [table-id model-id] :as arguments}]
  (try
    (cond
      (and table-id model-id)
      (throw (ex-info "Cannot provide both table_id and model_id"
                      {:agent-error? true :status-code 400}))

      (int? model-id)
      {:structured-output (query-datasource* arguments)}

      (int? table-id)
      {:structured-output (query-datasource* arguments)}

      model-id
      (throw (ex-info (str "Invalid model_id " model-id)
                      {:agent-error? true :status-code 400}))

      table-id
      (throw (ex-info (str "Invalid table_id " table-id)
                      {:agent-error? true :status-code 400}))

      :else
      (throw (ex-info "Either table_id or model_id must be provided"
                      {:agent-error? true :status-code 400})))
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output       (ex-message e)
         :status-code 404}
        (metabot-v3.tools.u/handle-agent-error e)))))

(defn- base-query
  [data-source]
  (let [{:keys [table-id query query-id report-id]} data-source
        model-id (lib.util/legacy-string-table-id->card-id table-id)
        handle-query (fn [query query-id]
                       (let [normalized-query (lib-be/normalize-query query)
                             database-id (:database normalized-query)
                             _ (api/read-check :model/Database database-id)
                             mp (lib-be/application-database-metadata-provider database-id)]
                         [(if query-id
                            (metabot-v3.tools.u/query-field-id-prefix query-id)
                            metabot-v3.tools.u/any-prefix-pattern)
                          (-> (lib/query mp normalized-query) lib/append-stage)]))]
    (cond
      model-id
      (if-let [model-query (metabot-v3.tools.u/card-query model-id)]
        [(metabot-v3.tools.u/card-field-id-prefix model-id) model-query]
        (throw (ex-info (str "No model found with model_id " model-id)
                        {:agent-error? true :status-code 404 :data-source data-source})))

      table-id
      (let [table-id (cond-> table-id
                       (string? table-id) parse-long)]
        (if-let [table-query (metabot-v3.tools.u/table-query table-id)]
          [(metabot-v3.tools.u/table-field-id-prefix table-id) table-query]
          (throw (ex-info (str "No table found with table_id " table-id)
                          {:agent-error? true :status-code 404 :data-source data-source}))))

      report-id
      (if-let [query (metabot-v3.tools.u/card-query report-id)]
        [(metabot-v3.tools.u/card-field-id-prefix report-id) query]
        (throw (ex-info (str "No report found with report_id " report-id)
                        {:agent-error? true :status-code 404 :data-source data-source})))

      query
      (handle-query query query-id)

      :else
      (throw (ex-info "Invalid data_source"
                      {:agent-error? true :status-code 400 :data-source data-source})))))

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
        :query query
        :result-columns (into []
                              (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                              (lib/returned-columns query))}})
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))
