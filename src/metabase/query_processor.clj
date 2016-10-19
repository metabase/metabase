(ns metabase.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.walk :as walk]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            (schema [core :as s]
                    utils)
            [swiss.arrows :refer [<<-]]
            [metabase.api.common :refer [*current-user-id*]]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver])
            [metabase.models.database :as database]
            (metabase.models [field :refer [Field]]
                             [query-execution :refer [QueryExecution]])
            (metabase.query-processor [annotate :as annotate]
                                      [expand :as expand]
                                      [interface :refer :all]
                                      [macros :as macros]
                                      [parameters :as params]
                                      [permissions :as perms]
                                      [resolve :as resolve])
            [metabase.util :as u])
  (:import (schema.utils NamedError ValidationError)))

;;; CONSTANTS

(def ^:const absolute-max-results
  "Maximum number of rows the QP should ever return.

   This is coming directly from the max rows allowed by Excel for now ...
   https://support.office.com/en-nz/article/Excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3"
  1048576)


;;;  DYNAMIC VARS

(def ^:dynamic ^Boolean *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)


;;; SCHEMA VALIDATION

(def qp-results-format
  "Schema for the expected format of results returned by a query processor."
  {:columns               [(s/cond-pre s/Keyword s/Str)]
   (s/optional-key :cols) [{s/Keyword s/Any}]            ; This is optional because QPs don't neccesarily have to add it themselves; annotate will take care of that
   :rows                  [[s/Any]]
   s/Keyword              s/Any})

(def ^{:arglists '([results])} validate-results
  "Validate that the RESULTS of executing a query match the `qp-results-format` schema.
   Throws an `Exception` if they are not; returns RESULTS as-is if they are."
  (s/validator qp-results-format))


;;; +----------------------------------------------------------------------------------------------------+
;;; |                                     QP INTERNAL IMPLEMENTATION                                     |
;;; +----------------------------------------------------------------------------------------------------+


(defn mbql-query?
  "Is the given query an MBQL query?"
  [query]
  (= :query (keyword (:type query))))

(defn- query-without-aggregations-or-limits?
  "Is the given query an MBQL query without a `:limit`, `:aggregation`, or `:page` clause?"
  [{{{ag-type :aggregation-type} :aggregation, :keys [limit page]} :query}]
  (and (not limit)
       (not page)
       (or (not ag-type)
           (= ag-type :rows))))

(defn- fail [query, ^Throwable e, & [additional-info]]
  (merge {:status         :failed
          :class          (class e)
          :error          (or (.getMessage e) (str e))
          :stacktrace     (u/filtered-stacktrace e)
          :query          (dissoc query :database :driver)
          :expanded-query (when (mbql-query? query)
                            (u/ignore-exceptions
                              (dissoc (resolve/resolve (expand/expand query)) :database :driver)))}
         (when-let [data (ex-data e)]
           {:ex-data data})
         additional-info))

(defn- explain-schema-validation-error
  "Return a nice error message to explain the schema validation error."
  [error]
  (cond
    (instance? NamedError error)      (let [nested-error (.error ^NamedError error)] ; recurse until we find the innermost nested named error, which is the reason we actually failed
                                        (if (instance? NamedError nested-error)
                                          (recur nested-error)
                                          (or (when (map? nested-error)
                                                (explain-schema-validation-error nested-error))
                                              (.name ^NamedError error))))
    (map? error)                      (first (for [e     (vals error)
                                                   :when (or (instance? NamedError e)
                                                             (instance? ValidationError e))
                                                   :let  [explanation (explain-schema-validation-error e)]
                                                   :when explanation]
                                               explanation))
    ;; When an exception is thrown, a ValidationError comes back like (throws? ("foreign-keys is not supported by this driver." 10))
    ;; Extract the message if applicable
    (instance? ValidationError error) (let [explanation (schema.utils/validation-error-explain error)]
                                        (or (when (list? explanation)
                                              (let [[reason [msg]] explanation]
                                                (when (= reason 'throws?)
                                                  msg)))
                                            explanation))))


;;; +-----------------------------------------------------------------------------------------------------------------+
;;; |                                           MIDDLEWARE FUNCTIONS                                                  |
;;; +-----------------------------------------------------------------------------------------------------------------+


(defn- wrap-catch-exceptions [qp]
  (fn [query]
    (try (qp query)
         (catch clojure.lang.ExceptionInfo e
           (fail query e (when-let [data (ex-data e)]
                           (when (= (:type data) :schema.core/error)
                             (when-let [error (explain-schema-validation-error (:error data))]
                               {:error error})))))
         (catch Throwable e
           (fail query e)))))


(defn- add-settings
  "Adds the `:settings` map to the query which can contain any fixed properties that would be useful at execution time.
   Currently supports a settings object like:

       {:report-timezone \"US/Pacific\"}"
  [{:keys [driver] :as query}]
  (let [settings {:report-timezone (when (driver/driver-supports? driver :set-timezone)
                                     (let [report-tz (driver/report-timezone)]
                                       (when-not (empty? report-tz)
                                         report-tz)))}]
    (assoc query :settings (m/filter-vals (complement nil?) settings))))

(defn- pre-add-settings [qp] (comp qp add-settings))


(defn- expand-macros
  "Looks for macros in a structured (unexpanded) query and substitutes the macros for their contents."
  [query]
  (if-not (mbql-query? query)
    query
    (u/prog1 (macros/expand-macros query)
      (when (and (not *disable-qp-logging*)
                 (not= <> query))
        (log/debug (u/format-color 'cyan "\n\nMACRO/SUBSTITUTED: 😻\n%s" (u/pprint-to-str <>)))))))

(defn- pre-expand-macros [qp] (comp qp expand-macros))


(defn- substitute-parameters
  "If any parameters were supplied then substitute them into the query."
  [query]
  (u/prog1 (params/expand-parameters query)
    (when (and (not *disable-qp-logging*)
               (not= <> query))
      (log/debug (u/format-color 'cyan "\n\nPARAMS/SUBSTITUTED: 😻\n%s" (u/pprint-to-str <>))))))

(defn- pre-substitute-parameters [qp] (comp qp substitute-parameters))


(defn- expand-resolve
  "Transforms an MBQL into an expanded form with more information and structure. Also resolves references to fields, tables,
   etc, into their concrete details which are necessary for query formation by the executing driver."
  [{database-id :database, :as query}]
  (let [resolved-db (db/select-one [database/Database :name :id :engine :details], :id database-id)
        query       (if-not (mbql-query? query)
                      query
                      (resolve/resolve (expand/expand query)))]
    (assoc query :database resolved-db)))

(defn- pre-expand-resolve [qp] (comp qp expand-resolve))


(defn- post-add-row-count-and-status
  "Wrap the results of a successfully processed query in the format expected by the frontend (add `row_count` and `status`)."
  [qp]
  (fn [{{:keys [max-results max-results-bare-rows]} :constraints, :as query}]
    (let [results-limit (or (when (query-without-aggregations-or-limits? query)
                              max-results-bare-rows)
                            max-results
                            absolute-max-results)
          results       (qp query)
          num-results   (count (:rows results))]
      (cond-> {:row_count num-results
               :status    :completed
               :data      results}
        ;; Add :rows_truncated if we've hit the limit so the UI can let the user know
        (= num-results results-limit) (assoc-in [:data :rows_truncated] results-limit)))))


(defn- format-rows [{:keys [report-timezone]} rows]
  (let [timezone (or report-timezone (System/getProperty "user.timezone"))]
    (for [row rows]
      (for [v row]
        (if (u/is-temporal? v)
          ;; NOTE: if we don't have an explicit report-timezone then use the JVM timezone
          ;;       this ensures alignment between the way dates are processed by JDBC and our returned data
          ;;       GH issues: #2282, #2035
          (u/->iso-8601-datetime v timezone)
          v)))))

(defn- post-format-rows
  "Format individual query result values as needed.  Ex: format temporal values as iso8601 strings w/ timezone."
  [qp]
  (fn [{:keys [settings] :as query}]
    (let [results (qp query)]
      (if-not (:rows results)
        results
        (update results :rows (partial format-rows settings))))))


(defn- should-add-implicit-fields? [{{:keys [fields breakout], {ag-type :aggregation-type} :aggregation} :query, :as query}]
  (and (mbql-query? query)
       (not (or ag-type
                (seq breakout)
                (seq fields)))))

(defn- datetime-field? [{:keys [base-type special-type]}]
  (or (isa? base-type :type/DateTime)
      (isa? special-type :type/DateTime)))

(defn- fields-for-source-table
  "Return the all fields for SOURCE-TABLE, for use as an implicit `:fields` clause."
  [{source-table-id :id, :as source-table}]
  (for [field (db/select [Field :name :display_name :base_type :special_type :visibility_type :table_id :id :position :description]
                :table_id        source-table-id
                :visibility_type [:not-in ["sensitive" "retired"]]
                :parent_id       nil
                {:order-by [[:position :asc]
                            [:id :desc]]})]
    (let [field (resolve/resolve-table (map->Field (resolve/rename-mb-field-keys field))
                                       {[nil source-table-id] source-table})]
      (if (datetime-field? field)
        (map->DateTimeField {:field field, :unit :default})
        field))))

(defn- add-implicit-fields
  "Add an implicit `fields` clause to queries with `rows` aggregations."
  [{{:keys [source-table]} :query, :as query}]
  (if-not (should-add-implicit-fields? query)
    query
    ;; this is a structured `:rows` query, so lets add a `:fields` clause with all fields from the source table + expressions
    (let [fields      (fields-for-source-table source-table)
          expressions (for [[expression-name] (get-in query [:query :expressions])]
                        (strict-map->ExpressionRef {:expression-name (name expression-name)}))]
      (when-not (seq fields)
        (log/warn (format "Table '%s' has no Fields associated with it." (:name source-table))))
      (-> query
          (assoc-in [:query :fields-is-implicit] true)
          (assoc-in [:query :fields] (concat fields expressions))))))

(defn- pre-add-implicit-fields [qp] (comp qp add-implicit-fields))


(defn- add-implicit-breakout-order-by
  "`Fields` specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that field is *explicitly* referenced in `order-by`."
  [{{breakout-fields :breakout, order-by :order-by} :query, :as query}]
  (if-not (mbql-query? query)
    query
    (let [order-by-fields                   (set (map :field order-by))
          implicit-breakout-order-by-fields (filter (partial (complement contains?) order-by-fields)
                                                    breakout-fields)]
      (cond-> query
        (seq implicit-breakout-order-by-fields) (update-in [:query :order-by] concat (for [field implicit-breakout-order-by-fields]
                                                                                       {:field field, :direction :ascending}))))))

(defn- pre-add-implicit-breakout-order-by [qp] (comp qp add-implicit-breakout-order-by))


(defn- pre-cumulative-sum
  "Rewrite queries containing a cumulative sum (`cum_sum`) aggregation to simply fetch the values of the aggregate field instead.
   (Cumulative sum is a special case; it is implemented in post-processing).
   Return a pair of [`cumulative-sum-field?` `query`]."
  [{{{ag-type :aggregation-type, ag-field :field} :aggregation, breakout-fields :breakout} :query, :as query}]
  (let [cum-sum?                    (= ag-type :cumulative-sum)
        cum-sum-with-breakout?      (and cum-sum?
                                         (seq breakout-fields))
        cum-sum-with-same-breakout? (and cum-sum-with-breakout?
                                         (= (count breakout-fields) 1)
                                         (= (first breakout-fields) ag-field))]

    ;; Cumulative sum is only applicable if it has breakout fields
    ;; For these, store the cumulative sum field under the key :cumulative-sum so we know which one to sum later
    ;; Cumulative summing happens in post-processing
    (cond
      ;; If there's only one breakout field that is the same as the cum_sum field, re-write this as a "rows" aggregation
      ;; to just fetch all the values of the field in question.
      cum-sum-with-same-breakout? [ag-field (update query :query (fn [query]
                                                                   (-> query
                                                                       (dissoc :breakout :aggregation)
                                                                       (assoc :fields [ag-field]))))]

      ;; Otherwise if we're breaking out on different fields, rewrite the query as a "sum" aggregation
      cum-sum-with-breakout? [ag-field (assoc-in query [:query :aggregation] {:aggregation-type :sum, :field ag-field})]

      ;; Cumulative sum without any breakout fields should just be treated the same way as "sum". Rewrite query as such
      cum-sum? [false (assoc-in query [:query :aggregation] {:aggregation-type :sum, :field ag-field})]

      ;; Otherwise if this isn't a cumulative sum query return it as-is
      :else [false query])))


(defn- post-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  [cum-sum-field {rows :rows, cols :cols, :as results}]
  (let [ ;; Determine the index of the field we need to cumulative sum
        cum-sum-field-index (u/prog1 (u/first-index-satisfying (fn [{:keys [name id]}]
                                                                 (or (= name "sum")
                                                                     (= id   (:field-id cum-sum-field))))
                                                               cols)
                              (assert (integer? <>)))
        ;; Now make a sequence of cumulative sum values for each row
        values              (reductions + (for [row rows]
                                            (nth row cum-sum-field-index)))
        ;; Update the values in each row
        rows                (map (fn [row value]
                                   (assoc (vec row) cum-sum-field-index value))
                                 rows values)]
    (assoc results :rows rows)))


(defn- cumulative-sum [qp]
  (fn [query]
    (if (mbql-query? query)
      (let [[cumulative-sum-field query] (pre-cumulative-sum query)]
        (cond->> (qp query)
                 cumulative-sum-field (post-cumulative-sum cumulative-sum-field)))
      ;; for non-MBQL queries we do nothing
      (qp query))))


(defn- pre-cumulative-count
  "Rewrite queries containing a cumulative count (`cum_count`) aggregation as `count` aggregation queries instead.
   (Cumulative count is a special case; it is implemented in post-processing).

   Returns a pair like `[is-cumulative-count-query? query]`."
  [{{{ag-type :aggregation-type} :aggregation, breakout-fields :breakout} :query, :as query}]
  (let [cum-count?               (= ag-type :cumulative-count)
        cum-count-with-breakout? (and cum-count?
                                    (seq breakout-fields))]

    ;; Cumulative count is only applicable if it has breakout field(s)
    ;; Cumulative counting happens in post-processing
    (cond
      ;; If we have breakout field(s), rewrite the query as a "count" aggregation
      cum-count-with-breakout? [true (assoc-in query [:query :aggregation] {:aggregation-type :count})]

      ;; Cumulative count without any breakout fields should just be treated the same way as "count". Rewrite query as such
      cum-count? [false (assoc-in query [:query :aggregation] {:aggregation-type :count})]

      ;; Otherwise if this isn't a cumulative count query return it as-is
      :else [false query])))


(defn- post-cumulative-count
  "Cumulative count the values of the aggregate `Field` in RESULTS."
  [{rows :rows, cols :cols, :as results}]
  (let [ ;; Determine the index of the count field; this is what we need to cumulative count
        cum-count-field-index (u/prog1 (u/first-index-satisfying (comp (partial = "count") :name)
                                                                 cols)
                                (assert (integer? <>)))
        ;; Now make a sequence of cumulative count values for each row
        values                 (reductions + (for [row rows]
                                               (nth row cum-count-field-index)))
        ;; Update the values in each row
        rows                   (map (fn [row value]
                                      (assoc (vec row) cum-count-field-index value))
                                    rows values)]
    (assoc results :rows rows)))


(defn- cumulative-count [qp]
  (fn [query]
    (if (mbql-query? query)
      (let [[is-cumulative-count? query] (pre-cumulative-count query)
            results                      (qp query)]
        (if is-cumulative-count?
          (post-cumulative-count results)
          results))
      ;; for non-MBQL queries we do nothing
      (qp query))))


(defn- limit
  "Add an implicit `limit` clause to MBQL queries without any aggregations, and limit the maximum number of rows that can be returned in post-processing."
  [qp]
  (fn [{{:keys [max-results max-results-bare-rows]} :constraints, :as query}]
    (let [query   (cond-> query
                    (query-without-aggregations-or-limits? query) (assoc-in [:query :limit] (or max-results-bare-rows
                                                                                                max-results
                                                                                                absolute-max-results)))
          results (qp query)]
      (update results :rows (partial take (or max-results
                                              absolute-max-results))))))

(defn- log-query [query]
  (u/prog1 query
    (when (and (mbql-query? query)
               (not *disable-qp-logging*))
      (log/debug (u/format-color 'magenta "\nPREPROCESSED/EXPANDED: 😻\n%s"
                   (u/pprint-to-str
                    ;; Remove empty kv pairs because otherwise expanded query is HUGE
                    (walk/prewalk
                     (fn [f]
                       (if-not (map? f) f
                               (m/filter-vals identity (into {} f))))
                     ;; obscure DB details when logging. Just log the name of driver because we don't care about its properties
                     (-> query
                         (assoc-in [:database :details] "😋 ") ; :yum:
                         (update :driver name)))))))))

(defn- pre-log-query [qp] (comp qp log-query))

(defn- pre-check-query-permissions [qp]
  (fn [query]
    (when *current-user-id*
      (perms/check-query-permissions *current-user-id* query))
    ;; TODO - what should we do if there is no *current-user-id* (for something like a pulse?)
    (qp query)))

;; The following are just assertions that check the behavior of the QP. It doesn't make sense to run them on prod because at best they
;; just waste CPU cycles and at worst cause a query to fail when it would otherwise succeed.
;; TODO - Should we make these test only (as opposed to test / dev)? If so, it would be nice if they could be moved into test namespaces
;; and somehow injected into the middleware stack.

(def ^:private guard-multiple-calls
  "Throw an exception if a QP function accidentally calls (QP QUERY) more than once.
   This test is skipped in prod to avoid wasting CPU cycles."
  (if config/is-prod?
    identity
    (fn [qp]
      (comp qp (let [called? (atom false)]
                 (fn [query]
                   (u/prog1 query
                     (assert (not @called?) "(QP QUERY) IS BEING CALLED MORE THAN ONCE!")
                     (reset! called? true))))))))


(def ^:private post-check-results-format
  "Make sure the results of a QP execution are in the expected format.
   This takes place *after* the 'annotation' stage of post-processing.
   This check is skipped in prod to avoid wasting CPU cycles."
  (if config/is-prod?
    identity
    (fn [qp]
      (comp validate-results qp))))

(defn query->remark
  "Genarate an approparite REMARK to be prepended to a query to give DBAs additional information about the query being executed.
   See documentation for `mbql->native` and [issue #2386](https://github.com/metabase/metabase/issues/2386) for more information."
  ^String [{{:keys [executed-by uuid query-hash query-type], :as info} :info}]
  (format "Metabase:: userID: %s executionID: %s queryType: %s queryHash: %s" executed-by uuid query-type query-hash))

(defn- infer-column-types
  "Infer the types of columns by looking at the first value for each in the results, and add the relevant information in `:cols`.
   This is used for native queries, which don't have the type information from the original `Field` objects used in the query, which is added to the results by `annotate`."
  [results]
  (assoc results
    :columns (mapv name (:columns results))
    :cols    (vec (for [[column first-value] (partition 2 (interleave (:columns results) (first (:rows results))))]
                    {:name      (name column)
                     :base_type (driver/class->base-type (type first-value))}))))

(defn- run-query
  "The end of the QP middleware which actually executes the query on the driver.

   If this is an MBQL query then we first call `mbql->native` which builds a database dependent form for execution and
   then we pass that form into the `execute-query` function for final execution.

   If the query is already a *native* query then we simply pass it through to `execute-query` unmodified."
  [query]
  (let [native-form  (u/prog1 (if-not (mbql-query? query)
                                (:native query)
                                (driver/mbql->native (:driver query) query))
                       (when-not *disable-qp-logging*
                         (log/debug (u/format-color 'green "NATIVE FORM: 😳\n%s\n" (u/pprint-to-str <>)))))
        native-query (if-not (mbql-query? query)
                       query
                       (assoc query :native native-form))
        raw-result   (driver/execute-query (:driver query) native-query)
        query-result (if-not (or (mbql-query? query)
                                 (:annotate? raw-result))
                       (infer-column-types raw-result)
                       (annotate/annotate query raw-result))]
    (assoc query-result :native_form native-form)))


;;; +-------------------------------------------------------------------------------------------------------+
;;; |                                           QUERY PROCESSOR                                             |
;;; +-------------------------------------------------------------------------------------------------------+


;; The way these functions are applied is actually straight-forward; it matches the middleware pattern used by Compojure.
;;
;; (defn- qp-middleware-fn [qp]
;;   (fn [query]
;;     (do-some-postprocessing (qp (do-some-preprocessing query)))))
;;
;; Each query processor function is passed a single arg, QP, and returns a function that accepts a single arg, QUERY.
;;
;; This returned function *pre-processes* QUERY as needed, and then passes it to QP.
;; The function may then *post-process* the results of (QP QUERY) as neeeded, and returns the results.
;;
;; Many functions do both pre and post-processing; this middleware pattern allows them to return closures that maintain some sort of
;; internal state. For example, cumulative-sum can determine if it needs to perform cumulative summing, and, if so, modify the query
;; before passing it to QP; once the query is processed, it can use modify the results as needed.
;;
;; For the sake of clarity, functions are named with the following convention:
;; *  Ones that only do pre-processing are prefixed with pre-
;; *  Ones that only do post-processing are prefixed with post-
;; *  Ones that do both aren't prefixed
;;
;; The <<- (reverse-threading macro) is used below for clarity.
;; Pre-processing happens from top-to-bottom, i.e. the QUERY passed to the function returned by PRE-ADD-IMPLICIT-BREAKOUT-ORDER-BY is the
;; query as modified by PRE-ADD-IMPLICIT-FIELDS.
;;
;; Post-processing then happens in order from bottom-to-top; i.e. POST-ANNOTATE gets to modify the results, then LIMIT, then CUMULATIVE-SUM, etc.

(defn process-query
  "Process an MBQL structured or native query, and return the result."
  {:style/indent 0}
  [query]
  (when-not *disable-qp-logging*
    (log/debug (u/format-color 'blue "\nQUERY: 😎\n%s"  (u/pprint-to-str query))))
  ;; TODO: it probably makes sense to throw an error or return a failure response here if we can't get a driver
  (let [driver (driver/database-id->driver (:database query))]
    (binding [*driver* driver]
      ((<<- wrap-catch-exceptions
            pre-add-settings
            pre-expand-macros
            pre-substitute-parameters
            pre-expand-resolve
            (driver/process-query-in-context driver)
            post-add-row-count-and-status
            post-format-rows
            pre-add-implicit-fields
            pre-add-implicit-breakout-order-by
            cumulative-sum
            cumulative-count
            limit
            post-check-results-format
            pre-log-query
            pre-check-query-permissions
            guard-multiple-calls
            run-query) (assoc query :driver driver)))))


(def ^{:arglists '([query])} expand
  "Expand a QUERY the same way it would normally be done as part of query processing.
   This is useful for things that need to look at an expanded query, such as permissions checking for Cards."
  (comp expand-resolve
        substitute-parameters
        expand-macros))


;;; +----------------------------------------------------------------------------------------------------+
;;; |                                     DATASET-QUERY PUBLIC API                                       |
;;; +----------------------------------------------------------------------------------------------------+

(declare query-fail query-complete save-query-execution!)

(defn- assert-valid-query-result [query-result]
  (when-not (contains? query-result :status)
    (throw (Exception. "invalid response from database driver. no :status provided")))
  (when (= :failed (:status query-result))
    (log/error (u/pprint-to-str 'red query-result))
    (throw (Exception. (str (get query-result :error "general error"))))))

(defn dataset-query
  "Process and run a json based dataset query and return results.

  Takes 2 arguments:

  1.  the json query as a dictionary
  2.  query execution options specified in a dictionary

  Depending on the database specified in the query this function will delegate to a driver specific implementation.
  For the purposes of tracking we record each call to this function as a QueryExecution in the database.

  Possible caller-options include:

    :executed-by [int]  (User ID of caller)
    :card-id     [int]  (ID of Card associated with this execution)"
  {:arglists '([query options])}
  [query {:keys [executed-by card-id]}]
  {:pre [(integer? executed-by) (u/maybe? integer? card-id)]}
  (let [query-uuid      (str (java.util.UUID/randomUUID))
        query-hash      (hash query)
        query-execution {:uuid              query-uuid
                         :executor_id       executed-by
                         :json_query        query
                         :query_hash        query-hash
                         :version           0
                         :status            :starting
                         :error             ""
                         :started_at        (u/new-sql-timestamp)
                         :finished_at       (u/new-sql-timestamp)
                         :running_time      0
                         :result_rows       0
                         :result_file       ""
                         :result_data       "{}"
                         :raw_query         ""
                         :additional_info   ""
                         :start_time_millis (System/currentTimeMillis)}
        query           (assoc query :info {:executed-by executed-by
                                            :card-id     card-id
                                            :uuid        query-uuid
                                            :query-hash  query-hash
                                            :query-type  (if (mbql-query? query) "MBQL" "native")})]
    (try
      (let [result (process-query query)]
        (assert-valid-query-result result)
        (query-complete query-execution result))
      (catch Throwable e
        (log/error (u/format-color 'red "Query failure: %s\n%s" (.getMessage e) (u/pprint-to-str (u/filtered-stacktrace e))))
        (query-fail query-execution (.getMessage e))))))

(defn- query-fail
  "Save QueryExecution state and construct a failed query response"
  [query-execution error-message]
  (let [updates {:status       :failed
                 :error        error-message
                 :finished_at  (u/new-sql-timestamp)
                 :running_time (- (System/currentTimeMillis) (:start_time_millis query-execution))}]
    ;; record our query execution and format response
    (-> query-execution
        (dissoc :start_time_millis)
        (merge updates)
        save-query-execution!
        (dissoc :raw_query :result_rows :version)
        ;; this is just for the response for clien
        (assoc :error     error-message
               :row_count 0
               :data      {:rows    []
                           :cols    []
                           :columns []}))))

(defn- query-complete
  "Save QueryExecution state and construct a completed (successful) query response"
  [query-execution query-result]
  ;; record our query execution and format response
  (-> (assoc query-execution
        :status       :completed
        :finished_at  (u/new-sql-timestamp)
        :running_time (- (System/currentTimeMillis)
                         (:start_time_millis query-execution))
        :result_rows  (get query-result :row_count 0))
      (dissoc :start_time_millis)
      save-query-execution!
      ;; at this point we've saved and we just need to massage things into our final response format
      (dissoc :error :raw_query :result_rows :version)
      (merge query-result)))

(defn- save-query-execution!
  "Save (or update) a `QueryExecution`."
  [{:keys [id], :as query-execution}]
  (if id
    ;; execution has already been saved, so update it
    (u/prog1 query-execution
      (db/update! QueryExecution id query-execution))
    ;; first time saving execution, so insert it
    (db/insert! QueryExecution query-execution)))
