(ns metabase.mcp.derive
  "Derive a new MBQL query from a stored one by a closed set of operations: the changes the MCP Apps iframe can make
   to what it shows. The iframe names an operation; the server builds the query. No operation carries a query."
  (:require
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.time :as u.time]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Schema ----------------------------------------------------

(def ^:private date-truncation-units
  ["minute" "hour" "day" "week" "month" "quarter" "year"])

(mr/def ::scalar
  [:or :string number? :boolean :nil])

(mr/def ::cell
  [:map {:closed true}
   [:column [:string {:min 1}]]
   [:value  ::scalar]])

(mr/def ::click-context
  "What the user clicked, with each column named by the name it has in the stored query's results. `:value` is absent
   for a click on a column header and nil for a SQL NULL."
  [:map {:closed true}
   [:column     {:optional true} [:maybe [:string {:min 1}]]]
   [:value      {:optional true} ::scalar]
   [:row        {:optional true} [:sequential ::cell]]
   [:dimensions {:optional true} [:sequential ::cell]]])

(mr/def ::date-value
  "The frontend's `DatePickerValue`. Specific dates are ISO-8601 strings without a zone."
  [:multi {:dispatch :type}
   ["specific" [:map {:closed true}
                [:type     [:= "specific"]]
                [:operator [:enum "=" "<" ">" "between"]]
                [:values   [:sequential {:min 1 :max 2} [:string {:min 1}]]]
                [:hasTime  :boolean]]]
   ["relative" [:map {:closed true}
                [:type        [:= "relative"]]
                [:unit        (into [:enum] date-truncation-units)]
                [:value       :int]
                [:offsetUnit  {:optional true} [:maybe (into [:enum] date-truncation-units)]]
                [:offsetValue {:optional true} [:maybe :int]]
                [:options     {:optional true} [:map {:closed true}
                                                [:includeCurrent {:optional true} :boolean]]]]]
   ["exclude" [:map {:closed true}
               [:type     [:= "exclude"]]
               [:operator [:enum "!=" "is-null" "not-null"]]
               [:unit     {:optional true} [:maybe [:enum "hour-of-day" "day-of-week" "month-of-year"
                                                    "quarter-of-year"]]]
               [:values   [:sequential :int]]]]])

(def ^:private plain-drills
  "Drills that take no argument beyond the click."
  ["zoom" "zoom-in.binning" "zoom-in.timeseries" "zoom-in.geographic" "pk" "fk-details" "fk-filter"
   "distribution" "underlying-records" "summarize-column-by-time"])

(defn- drill-op [drill & args]
  (into [:map {:closed true}
         [:type    [:= "drill-thru"]]
         [:drill   [:= drill]]
         [:context ::click-context]]
        args))

(defn- operation-dispatch [{:keys [type drill]}]
  (if (= type "drill-thru")
    [type drill]
    type))

(mr/def ::drill-operation
  (into [:multi {:dispatch operation-dispatch}
         [["drill-thru" "sort"] (drill-op "sort" [:direction [:enum "asc" "desc"]])]
         [["drill-thru" "quick-filter"] (drill-op "quick-filter" [:operator [:string {:min 1}]])]
         [["drill-thru" "summarize-column"] (drill-op "summarize-column"
                                                      [:aggregation [:enum "sum" "avg" "distinct"]])]]
        (for [drill plain-drills]
          [["drill-thru" drill] (drill-op drill)])))

(mr/def ::operation
  "One change to a stored query. Date and bucket operations act on the query's first temporal breakout."
  [:multi {:dispatch operation-dispatch}
   ["date-filter/set"     [:map {:closed true}
                           [:type  [:= "date-filter/set"]]
                           [:value ::date-value]]]
   ["date-filter/clear"   [:map {:closed true}
                           [:type [:= "date-filter/clear"]]]]
   ["temporal-bucket/set" [:map {:closed true}
                           [:type [:= "temporal-bucket/set"]]
                           ;; nil removes the bucket
                           [:unit [:maybe [:string {:min 1}]]]]]
   [:malli.core/default  ::drill-operation]])

;;; ------------------------------------------------ Operations --------------------------------------------------

(defn- bad-request [message]
  (ex-info message {:status-code 400}))

(defn- temporal-breakout
  "`[breakout column]` for the first breakout of `query`'s last stage that can take a temporal bucket. Throws a 400
   when there is none."
  [query]
  (or (some (fn [breakout]
              (let [column (lib/breakout-column query -1 breakout)]
                (when (and column (seq (lib/available-temporal-buckets query -1 column)))
                  [breakout column])))
            (lib/breakouts query -1))
      (throw (bad-request (tru "This query has no breakout that can be bucketed by time.")))))

(defn- date-filter?
  "Whether `filter-clause` is a date filter the date picker can show."
  [query filter-clause]
  (some #(% query -1 filter-clause)
        [lib/specific-date-filter-parts
         lib/relative-date-filter-parts
         lib/exclude-date-filter-parts]))

(defn- existing-date-filter [query]
  (some #(when (date-filter? query %) %) (lib/filters query -1)))

(defn- parse-date [s]
  (let [t (u.time/coerce-to-timestamp s)]
    (when-not (u.time/valid? t)
      (throw (bad-request (tru "Invalid date: {0}" (pr-str s)))))
    t))

(defn- date-filter-clause
  "The filter clause for the date picker `value` on `column`."
  [column {:keys [type operator values hasTime unit value offsetUnit offsetValue options]}]
  (case type
    "specific" (lib/specific-date-filter-clause (keyword operator) column (mapv parse-date values) hasTime)
    "relative" (lib/relative-date-filter-clause column value (keyword unit) offsetValue
                                                (some-> offsetUnit keyword)
                                                {:include-current (boolean (:includeCurrent options))})
    "exclude"  (lib/exclude-date-filter-clause (keyword operator) column (some-> unit keyword) values)))

(defn- set-date-filter [query {:keys [value]}]
  (let [[_ column] (temporal-breakout query)
        clause     (date-filter-clause (lib/with-temporal-bucket column nil) value)]
    (if-let [existing (existing-date-filter query)]
      (lib/replace-clause query -1 existing clause)
      (lib/filter query -1 clause))))

(defn- clear-date-filter [query _operation]
  (if-let [existing (existing-date-filter query)]
    (lib/remove-clause query -1 existing)
    query))

(defn- set-temporal-bucket [query {:keys [unit]}]
  (let [[breakout column] (temporal-breakout query)
        bucket            (when unit
                            (or (some #(when (= (keyword unit) (:unit %)) %)
                                      (lib/available-temporal-buckets query -1 column))
                                (throw (bad-request (tru "This breakout cannot be bucketed by {0}." unit)))))]
    (lib/replace-clause query -1 breakout (lib/with-temporal-bucket column bucket))))

(defn- click-context
  "The drill context for the click `context`. Each column is named by the name it has in `query`'s results, and
   resolves to the returned column of that name."
  [query {:keys [column row dimensions] :as context}]
  (let [columns (into {} (map (juxt :lib/deduplicated-name identity)) (lib/returned-columns query))
        resolve (fn [column-name]
                  (or (get columns column-name)
                      (throw (bad-request (tru "The query returns no column named {0}." (pr-str column-name))))))
        ;; A SQL NULL is `:null` only as the clicked value; in row and dimension cells it stays nil.
        cell    (fn [{column-name :column v :value}]
                  (let [col (resolve column-name)]
                    {:column col :column-ref (lib/ref col) :value v}))]
    (cond-> {:value (when (contains? context :value)
                      (if (nil? (:value context)) :null (:value context)))}
      column           (merge (let [col (resolve column)] {:column col :column-ref (lib/ref col)}))
      ;; Row cells are context only, and a row carries display columns the query does not return, such as an FK
      ;; remapping's, so cells naming no returned column are dropped.
      (seq row)        (assoc :row (into [] (keep #(when (contains? columns (:column %)) (cell %))) row))
      (seq dimensions) (assoc :dimensions (mapv cell dimensions)))))

(defn- drill-args
  "The extra arguments `lib/drill-thru` takes for the drill `operation` applied as `drill`."
  [drill {:keys [direction operator aggregation]}]
  (case (:type drill)
    :drill-thru/sort             [(keyword direction)]
    :drill-thru/quick-filter     (if (some #(= operator (:name %)) (:operators drill))
                                   [operator]
                                   (throw (bad-request (tru "This click offers no {0} filter." (pr-str operator)))))
    :drill-thru/summarize-column [(keyword aggregation)]
    []))

(defn- apply-drill [query {drill-name :drill :keys [context] :as operation}]
  (let [drill-type (keyword "drill-thru" drill-name)
        drill      (or (some #(when (= drill-type (:type %)) %)
                             (lib/available-drill-thrus query -1 (click-context query context)))
                       (throw (bad-request (tru "This click offers no {0} drill." drill-name))))]
    (apply lib/drill-thru query -1 nil drill (drill-args drill operation))))

(defn- apply-operation [query {:keys [type] :as operation}]
  (case type
    "date-filter/set"     (set-date-filter query operation)
    "date-filter/clear"   (clear-date-filter query operation)
    "temporal-bucket/set" (set-temporal-bucket query operation)
    "drill-thru"          (apply-drill query operation)))

(defn derive-query
  "Apply `operations`, each a [[::operation]], in order to the MBQL lib `query`, and return the new query. Throws a
   400 with a short message when `query` has a native stage or an operation does not apply to the query."
  [query operations]
  (when (lib/any-native-stage? query)
    (throw (bad-request (tru "A native query cannot be changed here; only MBQL queries can."))))
  (try
    (reduce apply-operation query operations)
    (catch Exception e
      (if (:status-code (ex-data e))
        (throw e)
        ;; Lib refusing the click's values or the operation: the caller's input, so a 400 that names no internals.
        (do (log/debug e "Lib refused an MCP derive operation")
            (throw (bad-request (tru "This change does not apply to this query."))))))))
