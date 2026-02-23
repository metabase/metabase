(ns metabase-enterprise.metabot-v3.tools.filters
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; URL Generation for Auto-Navigation

(defn- query->url-hash
  "Convert an MLv2/MBQL query to a base64-encoded URL hash."
  [query]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (let [dataset-query (if (and (map? query) (:lib/type query))
                        (lib/->legacy-MBQL query)
                        query)]
    (-> {:dataset_query dataset-query}
        json/encode
        (.getBytes "UTF-8")
        codecs/bytes->b64-str)))

(defn- query->results-url
  "Convert a query to a /question# URL for navigation."
  [query]
  (str "/question#" (query->url-hash query)))

;;; Filter Operations

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

;;; Temporal bucket metadata
;;
;; Extraction buckets (e.g., :year-of-era) extract an integer component from a
;; date/datetime.  Truncation buckets (e.g., :day) round to a boundary and expect
;; date/datetime string values.
;;
;; This metadata drives both coercion (date-string → integer for extraction buckets)
;; and validation (range checks, rejecting negative/numeric values for truncation
;; buckets).  It is used by [[coerce-and-validate-temporal-filter]].

(def ^:private extraction-bucket-specs
  "Extraction bucket → `{:min :max :hint}`.
  Filter values for extraction buckets must be integers (or integer-strings).
  Date strings are rejected — the LLM should filter date fields directly without a bucket
  for date range comparisons."
  {:year-of-era      {}
   :quarter-of-year  {:min 1 :max 4  :hint "quarter-of-year expects 1-4"}
   :month-of-year    {:min 1 :max 12 :hint "month-of-year expects 1-12"}
   :week-of-year     {:min 1 :max 53 :hint "week-of-year expects 1-53"}
   :day-of-month     {:min 1 :max 31 :hint "day-of-month expects 1-31"}
   :day-of-week      {:min 1 :max 7  :hint "day-of-week expects 1-7 (1=Monday, 7=Sunday)"}
   :hour-of-day      {:min 0 :max 23 :hint "hour-of-day expects 0-23"}
   :minute-of-hour   {:min 0 :max 59 :hint "minute-of-hour expects 0-59"}
   :second-of-minute {:min 0 :max 59 :hint "second-of-minute expects 0-59"}})

(def ^:private truncation-buckets
  "Temporal buckets that truncate a date/datetime to a boundary (e.g., `:day` truncates to midnight).
  Filter values for these buckets should be date/datetime strings, not relative integers."
  #{:millisecond :second :minute :hour :day :week :month :quarter :year :day-of-year})

(defn- agent-error!
  "Throw an `:agent-error?` exception (returned to the LLM so it can retry)."
  [msg]
  (throw (ex-info msg {:agent-error? true :status-code 400})))

(defn- coerce-extraction-value
  "Coerce a single filter value to an integer for an extraction bucket.
  Parses integer strings but rejects date strings — extraction buckets require plain
  integers, not dates. If the LLM passes a date string like \"2025-09-01\" with bucket
  \"day-of-month\", it almost certainly meant to filter the date field directly without
  a bucket (date range comparison), not extract the day component.
  Validates that the result is within the expected range."
  [v {:keys [min max hint] :as _spec} bucket]
  (letfn [(validate-range [n]
            (when (neg? n)
              (agent-error!
               (str "Filter value " n " cannot be negative for temporal bucket '" (name bucket) "'. "
                    "Temporal buckets extract components from dates (e.g., month-of-year extracts 1-12). "
                    "If you need to filter relative to today (e.g., 'last 60 days'), don't use temporal "
                    "buckets — filter the date field directly with a date range instead.")))
            (when (and min max (not (<= min n max)))
              (agent-error! (str "Filter value " n " is out of range for bucket '" (name bucket) "'. " hint ".")))
            n)]
    (cond
      (number? v)
      (validate-range v)

      (string? v)
      (try
        (validate-range (Integer/parseInt v))
        (catch NumberFormatException _
          (agent-error!
           (str "Filter with temporal bucket '" (name bucket) "' requires an integer value, "
                "got: \"" v "\". For example, 'day-of-month' expects 15, not \"2024-01-15\". "
                "If you need to filter by a date range (e.g., 'last 30 days'), don't use a "
                "temporal bucket — filter the date field directly with operation "
                "'greater-than-or-equal' and value '2025-01-15' (no bucket)."))))

      :else v)))

(defn- validate-truncation-value
  "Reject numeric values for truncation buckets — they need date strings."
  [v bucket]
  (when (and (number? v) (or (neg? v) (< v 100)))
    (agent-error!
     (str "Filter value " v " is not valid for temporal bucket '" (name bucket) "'. "
          "Temporal buckets like '" (name bucket) "' require date/datetime string values "
          "(e.g., \"2024-01-15\"), not relative numbers. "
          "To filter for 'last 30 days', use a direct date comparison without a bucket, "
          "e.g., operation 'greater-than-or-equal' with value '2025-01-15' (the actual date)."))))

(defn coerce-and-validate-temporal-filter
  "Coerce and validate temporal filter values based on the bucket type.

  For extraction buckets (e.g., `:year-of-era`): coerce date-string values to
  integers and validate the range.
  For truncation buckets (e.g., `:day`): reject numeric values that indicate
  the LLM is trying to use relative date math.

  Works on normalized filters (keyword keys and keyword buckets).
  Called from [[add-filter]].

  See also [[decode-temporal-filter]] for the raw (pre-normalization) variant
  used in Malli schema decode transforms."
  [{:keys [value values lower-value upper-value bucket] :as llm-filter}]
  (if-let [spec (extraction-bucket-specs bucket)]
    ;; Extraction bucket — coerce and validate values
    (let [coerce-val #(coerce-extraction-value % spec bucket)]
      (cond-> llm-filter
        (contains? llm-filter :value)       (update :value coerce-val)
        (contains? llm-filter :values)      (update :values (partial mapv coerce-val))
        (contains? llm-filter :lower-value) (update :lower-value coerce-val)
        (contains? llm-filter :upper-value) (update :upper-value coerce-val)))
    ;; Truncation bucket — validate values aren't numeric nonsense
    (if (truncation-buckets bucket)
      (do (doseq [v (concat (or values [])
                            (remove nil? [value lower-value upper-value]))]
            (validate-truncation-value v bucket))
          llm-filter)
      ;; No bucket or unknown — pass through
      llm-filter)))

(defn decode-temporal-filter
  "Decode a raw (pre-normalization) filter map for Malli schema `:decode/tool` transforms.

  Operates on string keys (`\"bucket\"`, `\"value\"`, `\"values\"`) as they arrive from
  the LLM's JSON, coercing and validating temporal filter values.

  Example usage in a Malli schema:

      [:map {:decode/tool filters/decode-temporal-filter}
       [:bucket {:optional true} [:maybe :string]]
       [:value {:optional true} :any]]"
  [m]
  (let [bucket-str (or (get m "bucket") (get m :bucket))
        bucket-kw  (when bucket-str (keyword bucket-str))]
    (if-not bucket-kw
      m
      (let [v-key     (cond
                        (contains? m "value") "value"
                        (contains? m :value) :value)
            vs-key    (cond
                        (contains? m "values") "values"
                        (contains? m :values) :values)
            lower-key (cond
                        (contains? m "lower_value") "lower_value"
                        (contains? m :lower_value) :lower_value
                        (contains? m :lower-value) :lower-value)
            upper-key (cond
                        (contains? m "upper_value") "upper_value"
                        (contains? m :upper_value) :upper_value
                        (contains? m :upper-value) :upper-value)
            as-norm  {:bucket bucket-kw
                      :value  (when v-key (get m v-key))
                      :values (when vs-key (get m vs-key))
                      :lower-value (when lower-key (get m lower-key))
                      :upper-value (when upper-key (get m upper-key))}
            coerced  (coerce-and-validate-temporal-filter as-norm)]
        (cond-> m
          v-key     (assoc v-key (:value coerced))
          vs-key    (assoc vs-key (:values coerced))
          lower-key (assoc lower-key (:lower-value coerced))
          upper-key (assoc upper-key (:upper-value coerced)))))))

(def ^:private temporal-extraction-operations
  "Operations that extract an integer component from a date/datetime field (e.g. month 1-12).
  These operations inherently expect small integer values, so they must be exempt from the
  validation that rejects small integers on temporal columns."
  #{:year-equals      :year-not-equals
    :quarter-equals   :quarter-not-equals
    :month-equals     :month-not-equals
    :day-of-week-equals :day-of-week-not-equals
    :hour-equals      :hour-not-equals
    :minute-equals    :minute-not-equals
    :second-equals    :second-not-equals})

(defn- validate-temporal-column-values
  "Reject clearly-wrong numeric values on temporal columns when no bucket is specified.
  Negative numbers and small integers (< 100) on a datetime field are almost certainly the
  LLM trying to express relative dates (e.g., -30 for 'last 30 days').

  This validation requires the resolved `:column` metadata, so it runs in [[add-filter]]
  rather than in the Malli decode layer.

  Skips validation for temporal extraction operations (e.g. `month-equals`, `year-equals`)
  because those operations explicitly expect small integer values."
  [{:keys [value values lower-value upper-value bucket operation column] :as llm-filter}]
  (when (and (nil? bucket)
             column
             (lib.types.isa/temporal? column)
             (not (temporal-extraction-operations operation)))
    (doseq [v (concat (or values [])
                      (remove nil? [value lower-value upper-value]))]
      (when (and (number? v) (or (neg? v) (< v 100)))
        (agent-error!
         (str "Filter value " v " is not valid for a date/datetime field. "
              "Date fields require date/datetime string values (e.g., \"2024-01-15\"), "
              "not relative numbers. "
              "To filter for 'last 30 days', compute the actual date and use "
              "operation 'greater-than-or-equal' with value '2025-01-15' (the actual date).")))))
  llm-filter)

(declare build-filter-clause)
(declare resolve-filter-columns)

(defn- add-filter
  [query llm-filter]
  (lib/filter query (build-filter-clause query llm-filter)))

(defn- build-filter-clause
  "Build a filter clause from an LLM filter definition.
   Handles segment, compound, between, and standard field-based filters.
   Returns a filter expression (not a query with filter applied)."
  [query llm-filter]
  (cond
    ;; Segment-based filter
    (:segment-id llm-filter)
    (let [segment-id (:segment-id llm-filter)]
      (if-let [segment (lib.metadata/segment query segment-id)]
        segment
        (throw (ex-info (tru "Segment with id {0} not found" segment-id)
                        {:agent-error? true
                         :status-code 404
                         :segment-id segment-id}))))

    ;; Compound filter (AND/OR)
    (= :compound (:filter-kind llm-filter))
    (let [{:keys [operator filters]} llm-filter
          clauses (mapv #(build-filter-clause query %) filters)]
      (when (empty? clauses)
        (throw (ex-info "Compound filter requires at least one nested filter"
                        {:agent-error? true :status-code 400})))
      (case operator
        :and (apply lib/and clauses)
        :or  (apply lib/or clauses)
        (throw (ex-info (str "Unknown compound filter operator: " operator)
                        {:agent-error? true :status-code 400}))))

    ;; Between filter
    (= :between (:filter-kind llm-filter))
    (let [llm-filter (-> llm-filter
                         coerce-and-validate-temporal-filter
                         validate-temporal-column-values)
          expr (filter-bucketed-column llm-filter)
          {:keys [lower-value upper-value]} llm-filter]
      (lib/between expr lower-value upper-value))

    ;; Standard field-based filter logic
    :else
    (let [llm-filter (-> llm-filter
                         coerce-and-validate-temporal-filter
                         validate-temporal-column-values)
          {:keys [operation value values]} llm-filter
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
                             (lib.options/update-options assoc :case-sensitive false)))]
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
                        {:agent-error? true :status-code 400}))))))

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
        resolved-filters (map #(resolve-filter-columns % resolve-visible-column) filters)
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
  "Create a query based on a metric.
  Returns structured output with the query and a navigate_to data part."
  [{:keys [metric-id] :as arguments}]
  (try
    (if (int? metric-id)
      (let [result (query-metric* arguments)
            results-url (query->results-url (:query result))]
        {:structured-output (assoc result :result-type :query)
         :instructions (instructions/query-created-instructions-for (:query-id result))
         :data-parts [(streaming/navigate-to-part results-url)]})
      (throw (ex-info (str "Invalid metric_id " metric-id)
                      {:agent-error? true :status-code 400})))
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output (ex-message e) :status-code 404}
        (metabot-v3.tools.u/handle-agent-error e)))))

(defn- apply-aggregation-sort-order
  "If sort-order is specified, add an order-by clause for the last aggregation in the query."
  [query sort-order]
  (if sort-order
    (let [query-aggregations (lib/aggregations query)
          last-aggregation-idx (dec (count query-aggregations))]
      (lib/order-by query (lib/aggregation-ref query last-aggregation-idx) sort-order))
    query))

(defn- validate-percentile-value
  [percentile-value]
  (when-not (and (number? percentile-value)
                 (<= 0 percentile-value 1))
    (throw (ex-info (str "percentile_value must be a number between 0 and 1, got: " percentile-value)
                    {:agent-error? true :status-code 400})))
  percentile-value)

(defn- build-conditional-aggregation
  "Build a conditional aggregation (count-where, sum-where, distinct-where).
   The condition must already be resolved to a filter clause."
  [query aggregation]
  (let [condition-filter (:condition aggregation)
        condition-clause (build-filter-clause query condition-filter)
        func (:function aggregation)]
    (case func
      :count-where
      (lib/count-where condition-clause)

      :sum-where
      (let [expr (bucketed-column aggregation)]
        (lib/sum-where expr condition-clause))

      :distinct-where
      (let [expr (bucketed-column aggregation)]
        (lib/distinct-where expr condition-clause))

      (throw (ex-info (str "Unknown conditional aggregation function: " func)
                      {:agent-error? true :status-code 400})))))

(defn- add-aggregation
  [query aggregation]
  (let [sort-order (:sort-order aggregation)
        func (:function aggregation)
        query-with-aggregation
        (cond
          ;; Measure-based aggregation
          (:measure-id aggregation)
          (let [measure-id (:measure-id aggregation)]
            (if-let [measure (lib.metadata/measure query measure-id)]
              (lib/aggregate query measure)
              (throw (ex-info (tru "Measure with id {0} not found" measure-id)
                              {:agent-error? true
                               :status-code 404
                               :measure-id measure-id}))))

          ;; Conditional aggregation (count-where, sum-where, distinct-where)
          (:condition aggregation)
          (lib/aggregate query (build-conditional-aggregation query aggregation))

          ;; Expression-based aggregation (aggregate on a calculated column)
          (:expression-ref aggregation)
          (let [expr-ref (lib/expression-ref query (:expression-ref aggregation))
                agg-expr (case func
                           (:count-distinct :distinct) (lib/distinct expr-ref)
                           :sum            (lib/sum expr-ref)
                           :min            (lib/min expr-ref)
                           :max            (lib/max expr-ref)
                           :avg            (lib/avg expr-ref)
                           :median         (lib/median expr-ref)
                           :stddev         (lib/stddev expr-ref)
                           :var            (lib/var expr-ref)
                           :percentile     (lib/percentile expr-ref (validate-percentile-value (:percentile-value aggregation)))
                           :cum-sum        (lib/cum-sum expr-ref)
                           :share          (lib/share expr-ref)
                           (throw (ex-info (str "Unsupported aggregation function for expression: " func)
                                           {:agent-error? true :status-code 400})))]
            (lib/aggregate query agg-expr))

          ;; Field-based aggregation
          :else
          (let [agg-expr (if (= :count func)
                           (lib/count)
                           (let [expr (bucketed-column aggregation)]
                             (case func
                               (:count-distinct :distinct) (lib/distinct expr)
                               :sum            (lib/sum expr)
                               :min            (lib/min expr)
                               :max            (lib/max expr)
                               :avg            (lib/avg expr)
                               ;; Advanced aggregations
                               :median         (lib/median expr)
                               :stddev         (lib/stddev expr)
                               :var            (lib/var expr)
                               :percentile     (lib/percentile expr (validate-percentile-value (:percentile-value aggregation)))
                               :cum-sum        (lib/cum-sum expr)
                               :cum-count      (lib/cum-count)
                               :share          (lib/share expr)
                               (throw (ex-info (str "Unsupported aggregation function: " func
                                                    ". Supported: count, count-distinct, sum, min, max, avg, "
                                                    "median, stddev, var, percentile, cum-sum, cum-count, share")
                                               {:agent-error? true
                                                :status-code 400})))))]
            (lib/aggregate query agg-expr)))]
    (apply-aggregation-sort-order query-with-aggregation sort-order)))

(defn- resolve-aggregation-column
  "Resolve the column for an aggregation, skipping measures, expression-refs, and field-less counts.
   Also resolves columns within conditional aggregation conditions."
  [resolve-visible-column aggregation]
  (let [;; First, resolve the main column if needed
        resolved (if (or (:measure-id aggregation)
                         (:expression-ref aggregation)  ;; expression-ref doesn't need column resolution
                         (and (= :count (:function aggregation))
                              (not (:field-id aggregation)))
                         ;; count-where doesn't require a main field
                         (= :count-where (:function aggregation)))
                   aggregation
                   (resolve-visible-column aggregation))]
    ;; Then, resolve condition columns for conditional aggregations
    (if (:condition resolved)
      (update resolved :condition #(resolve-filter-columns % resolve-visible-column))
      resolved)))

(defn- expression?
  [expr-or-column]
  (vector? expr-or-column))

(def ^:private datetime-units
  #{:year :quarter :month :week :day :hour :minute :second})

(defn- expression-error!
  [op msg]
  (throw (ex-info (str "Invalid expression '" (name op) "': " msg)
                  {:agent-error? true :status-code 400})))

(defn- ensure-arg-count!
  [op args n]
  (when-not (= n (count args))
    (expression-error! op (str "expected " n " argument(s), got " (count args)))))

(defn- ensure-min-arg-count!
  [op args n]
  (when (< (count args) n)
    (expression-error! op (str "expected at least " n " argument(s), got " (count args)))))

(defn- validate-expression-definition!
  [op args {:keys [unit start exponent]}]
  (case op
    (:add :subtract :multiply :divide :concat :coalesce)
    (ensure-min-arg-count! op args 2)

    (:abs :round :ceil :floor :sqrt :log :exp :upper :lower :trim :length
          :get-year :get-month :get-day :get-hour :get-minute :get-second :get-quarter :get-day-of-week)
    (ensure-arg-count! op args 1)

    :substring
    (do
      (ensure-arg-count! op args 1)
      (when-not (some? start)
        (expression-error! op "requires 'start'")))

    :power
    (do
      (when-not (<= 1 (count args) 2)
        (expression-error! op (str "expected 1-2 arguments, got " (count args))))
      (when-not (or (some? exponent) (some? (second args)))
        (expression-error! op "requires either 'exponent' or a second argument")))

    (:datetime-add :datetime-subtract)
    (do
      (ensure-arg-count! op args 2)
      (let [unit-kw (some-> unit keyword)]
        (when-not (contains? datetime-units unit-kw)
          (expression-error! op (str "requires valid 'unit' (one of "
                                     (str/join ", " (sort (map name datetime-units)))
                                     ")")))))

    nil))

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
        _ (log/debug "query_model field-id expectations"
                     {:model-id model-id
                      :field-id-prefix field-id-prefix
                      :field-ids (vec (keep :field-id (concat fields filters group-by)))})
        resolve-order-by-column (fn [{:keys [field direction]}] {:field (resolve-visible-column field) :direction direction})
        projection (map (comp (juxt filter-bucketed-column (fn [{:keys [column bucket]}]
                                                             (let [column (cond-> column
                                                                            bucket (assoc :unit bucket))]
                                                               (lib/display-name base-query -1 column :long))))
                              resolve-visible-column)
                        fields)
        resolved-aggregations (map (partial resolve-aggregation-column resolve-visible-column) aggregations)
        resolved-filters (map #(resolve-filter-columns % resolve-visible-column) filters)
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
  "Create a query based on a model.
  Returns structured output with the query and a navigate_to data part."
  [{:keys [model-id] :as arguments}]
  (try
    (if (int? model-id)
      (let [result (query-model* arguments)
            results-url (query->results-url (:query result))]
        {:structured-output (assoc result :result-type :query)
         :instructions (instructions/query-created-instructions-for (:query-id result))
         :data-parts [(streaming/navigate-to-part results-url)]})
      (throw (ex-info (str "Invalid model_id " model-id)
                      {:agent-error? true :status-code 400})))
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output (ex-message e) :status-code 404}
        (metabot-v3.tools.u/handle-agent-error e)))))

;;; Expression Building

(declare build-expression)

(defn- resolve-expression-argument
  "Resolve an expression argument to a lib-compatible value.
   Arguments can be: field_id reference, literal value, expression_ref, or inline sub-expression."
  [query arg visible-cols field-id-prefix]
  (cond
    (:field-id arg)
    (let [resolved (metabot-v3.tools.u/resolve-column arg field-id-prefix visible-cols)]
      (:column resolved))

    (contains? arg :value)
    (:value arg)

    (:expression-ref arg)
    (lib/expression-ref query (:expression-ref arg))

    ;; Inline nested expression (has :operation but no :name)
    (:operation arg)
    (build-expression query arg visible-cols field-id-prefix)

    :else
    (throw (ex-info (str "Invalid expression argument: " arg)
                    {:agent-error? true :status-code 400}))))

(defn- build-expression
  "Build a lib expression from an LLM expression definition.
   Supports nested sub-expressions in arguments."
  [query expr-def visible-cols field-id-prefix]
  (let [resolve-arg #(resolve-expression-argument query % visible-cols field-id-prefix)
        args (mapv resolve-arg (:arguments expr-def))
        ;; Operation may be keyword (after normalize-ai-args) or string (direct call)
        op (keyword (:operation expr-def))]
    (validate-expression-definition! op args expr-def)
    (case op
      ;; Binary math operations
      :add      (apply lib/+ args)
      :subtract (apply lib/- args)
      :multiply (apply lib/* args)
      :divide   (apply lib// args)
      ;; Unary math operations
      :abs      (lib/abs (first args))
      :round    (lib/round (first args))
      :ceil     (lib/ceil (first args))
      :floor    (lib/floor (first args))
      :sqrt     (lib/sqrt (first args))
      :log      (lib/log (first args))
      :exp      (lib/exp (first args))
      :power    (lib/power (first args) (or (:exponent expr-def) (second args)))
      ;; String operations
      :concat   (apply lib/concat args)
      :upper    (lib/upper (first args))
      :lower    (lib/lower (first args))
      :trim     (lib/trim (first args))
      :length   (lib/length (first args))
      :substring (lib/substring (first args) (:start expr-def) (:end expr-def))
      ;; Date extraction
      :get-year        (lib/get-year (first args))
      :get-month       (lib/get-month (first args))
      :get-day         (lib/get-day (first args))
      :get-hour        (lib/get-hour (first args))
      :get-minute      (lib/get-minute (first args))
      :get-second      (lib/get-second (first args))
      :get-quarter     (lib/get-quarter (first args))
      :get-day-of-week (lib/get-day-of-week (first args) :iso)
      ;; Date arithmetic
      :datetime-add      (lib/datetime-add (first args) (second args) (keyword (:unit expr-def)))
      :datetime-subtract (lib/datetime-subtract (first args) (second args) (keyword (:unit expr-def)))
      ;; Coalesce
      :coalesce (apply lib/coalesce args)
      ;; Unknown operation
      (throw (ex-info (str "Unknown expression operation: " op)
                      {:agent-error? true :status-code 400})))))

(defn- add-expressions
  "Add expressions (calculated columns) to a query."
  [query expressions visible-cols field-id-prefix]
  (if (seq expressions)
    (reduce
     (fn [q expr-def]
       (let [expr-clause (build-expression q expr-def visible-cols field-id-prefix)]
         (lib/expression q (:name expr-def) expr-clause)))
     query
     expressions)
    query))

;;; Post-Aggregation Filtering (HAVING equivalent)

(defn- build-leaf-post-filter-clause
  "Build a filter clause for a single post-filter (aggregation comparison).
   `aggregation-cols` should be just the aggregation columns (not breakouts)."
  [aggregation-cols {:keys [aggregation-index operation value]}]
  (let [col (nth aggregation-cols aggregation-index nil)]
    (when-not col
      (throw (ex-info (str "Invalid aggregation_index: " aggregation-index
                           ". Query has " (count aggregation-cols) " aggregations.")
                      {:agent-error? true :status-code 400})))
    (case operation
      :greater-than           (lib/> col value)
      :less-than              (lib/< col value)
      :equals                 (lib/= col value)
      :not-equals             (lib/!= col value)
      :greater-than-or-equal  (lib/>= col value)
      :less-than-or-equal     (lib/<= col value)
      (throw (ex-info (str "Unknown post-filter operation: " operation)
                      {:agent-error? true :status-code 400})))))

(defn- build-post-filter-clause
  "Build a filter clause for a post-filter, handling both leaf and compound filters.
   `aggregation-cols` should be just the aggregation columns (not breakouts)."
  [aggregation-cols post-filter]
  (if (= :compound (:filter-kind post-filter))
    ;; Compound post-filter with AND/OR
    (let [clauses (mapv #(build-post-filter-clause aggregation-cols %) (:filters post-filter))]
      (when (empty? clauses)
        (throw (ex-info "Compound post-filter requires at least one nested filter"
                        {:agent-error? true :status-code 400})))
      (case (:operator post-filter)
        :and (apply lib/and clauses)
        :or  (apply lib/or clauses)
        (throw (ex-info (str "Unknown compound operator: " (:operator post-filter))
                        {:agent-error? true :status-code 400}))))
    ;; Leaf post-filter
    (build-leaf-post-filter-clause aggregation-cols post-filter)))

(defn- add-post-filters
  "Add post-aggregation filters by appending a new stage.
   Post-filters reference aggregations by their 0-based index into the aggregations array
   (not the overall column list which includes breakouts first).
   Supports both simple filters and compound (AND/OR) filters."
  [query post-filters num-breakouts]
  (if (seq post-filters)
    (let [;; First, append a new stage to filter on aggregated results
          query-with-stage (lib/append-stage query)
          ;; Get the columns from the previous stage (breakouts + aggregations)
          returned-cols (vec (lib/returned-columns query-with-stage))
          ;; Extract just the aggregation columns (skip the breakout columns)
          ;; returned-cols order is: breakouts first, then aggregations
          aggregation-cols (vec (drop num-breakouts returned-cols))]
      (reduce
       (fn [q post-filter]
         (lib/filter q (build-post-filter-clause aggregation-cols post-filter)))
       query-with-stage
       post-filters))
    query))

(defn- resolve-datasource
  "Resolve datasource parameters to [field-id-prefix base-query] tuple.
   Accepts either {:table-id id} or {:model-id id}."
  [{:keys [table-id model-id]}]
  (cond
    model-id
    (try
      [(metabot-v3.tools.u/card-field-id-prefix model-id) (metabot-v3.tools.u/card-query model-id)]
      (catch clojure.lang.ExceptionInfo e
        (throw (if (= (:status-code (ex-data e)) 404)
                 (ex-info (str "No model found with model_id " model-id)
                          {:agent-error? true :status-code 404} e)
                 e))))

    table-id
    (try
      [(metabot-v3.tools.u/table-field-id-prefix table-id) (metabot-v3.tools.u/table-query table-id)]
      (catch clojure.lang.ExceptionInfo e
        (throw (if (= (:status-code (ex-data e)) 404)
                 (ex-info (str "No table found with table_id " table-id)
                          {:agent-error? true :status-code 404} e)
                 e))))

    :else
    (throw (ex-info "Either table-id or model-id must be provided" {:agent-error? true :status-code 400}))))

(defn- resolve-filter-columns
  "Recursively resolve columns in filters, including nested compound filters."
  [llm-filter resolve-visible-column]
  (cond
    ;; Segment filter - no column resolution needed
    (:segment-id llm-filter)
    llm-filter

    ;; Compound filter - recursively resolve nested filters
    (= :compound (:filter-kind llm-filter))
    (update llm-filter :filters
            (fn [filters]
              (mapv #(resolve-filter-columns % resolve-visible-column) filters)))

    ;; Between filter - resolve the column (has field-id like standard filters)
    (= :between (:filter-kind llm-filter))
    (resolve-visible-column llm-filter)

    ;; Standard filter with field-id - resolve the column
    :else
    (resolve-visible-column llm-filter)))

(defn- query-datasource*
  [{:keys [expressions fields filters aggregations group-by order-by limit post-filters] :as arguments}]
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
        all-aggregations (map (partial resolve-aggregation-column resolve-visible-column) aggregations)
        all-filters (map #(resolve-filter-columns % resolve-visible-column) filters)
        reduce-query (fn [query f coll] (reduce f query coll))
        query (-> base-query
                  ;; Add expressions first so they're available for other clauses
                  (add-expressions expressions visible-cols filter-field-id-prefix)
                  (reduce-query (fn [query [expr-or-column expr-name]]
                                  (lib/expression query expr-name expr-or-column))
                                (filter (comp expression? first) projection))
                  (add-fields projection)
                  (reduce-query add-filter all-filters)
                  (reduce-query add-aggregation all-aggregations)
                  (reduce-query add-breakout (map resolve-visible-column group-by))
                  (reduce-query add-order-by (map resolve-order-by-column order-by))
                  ;; Add post-aggregation filters (creates new stage if needed)
                  ;; Pass number of breakouts so we can offset aggregation_index correctly
                  (add-post-filters post-filters (count group-by))
                  ;; Limit must apply after post-filters to preserve HAVING semantics.
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
      (and table-id model-id) (throw (ex-info "Cannot provide both table_id and model_id"
                                              {:agent-error? true :status-code 400}))
      (int? model-id)         {:structured-output (-> (query-datasource* arguments)
                                                      (assoc :result-type :query))}
      (int? table-id)         {:structured-output (-> (query-datasource* arguments)
                                                      (assoc :result-type :query))}
      model-id                (throw (ex-info (str "Invalid model_id " model-id)
                                              {:agent-error? true :status-code 400}))
      table-id                (throw (ex-info (str "Invalid table_id " table-id)
                                              {:agent-error? true :status-code 400}))
      :else                   (throw (ex-info "Either table_id or model_id must be provided"
                                              {:agent-error? true :status-code 400})))
    (catch Exception e
      (if (= (:status-code (ex-data e)) 404)
        {:output (ex-message e) :status-code 404}
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
          resolve-column #(metabot-v3.tools.u/resolve-column % filter-field-id-prefix returned-cols)
          query (reduce add-filter base (map #(resolve-filter-columns % resolve-column) filters))
          query-id (u/generate-nano-id)
          query-field-id-prefix (metabot-v3.tools.u/query-field-id-prefix query-id)]
      {:structured-output
       {:result-type :query
        :type :query
        :query-id query-id
        :query query
        :result-columns (into []
                              (map-indexed #(metabot-v3.tools.u/->result-column query %2 %1 query-field-id-prefix))
                              (lib/returned-columns query))}})
    (catch Exception ex
      (metabot-v3.tools.u/handle-agent-error ex))))
