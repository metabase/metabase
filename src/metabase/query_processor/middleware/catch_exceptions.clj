(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(defmulti ^:private format-exception
  "Format an Exception thrown by the Query Processor into a userland error response map."
  {:arglists '([^Throwable e])}
  class)

(defmethod format-exception Throwable
  [^Throwable e]
  {:status     :failed
   :class      (class e)
   :error      (.getMessage e)
   :stacktrace (u/filtered-stacktrace e)})

(defmethod format-exception InterruptedException
  [^InterruptedException _e]
  {:status :interrupted})

(defmethod format-exception ExceptionInfo
  [e]
  (let [{error-type :type, :as data} (ex-data e)]
    (merge
     ((get-method format-exception Throwable) e)
     (when (qp.error-type/known-error-type? error-type)
       {:error_type error-type})
     ;; TODO - we should probably change this key to `:data` so we're not mixing lisp-case and snake_case keys
     {:ex-data data})))

(defmethod format-exception SQLException
  [^SQLException e]
  (assoc ((get-method format-exception Throwable) e)
         :state (.getSQLState e)))

;; TODO -- some of this logic duplicates the functionality of `clojure.core/Throwable->map`, we should consider
;; whether we can use that more extensively and remove some of this logic
(defn- exception-chain
  "Exception chain in reverse order, e.g. inner-most cause first."
  [e]
  (reverse (u/full-exception-chain e)))

(mu/defn ^:private best-top-level-error
  "In cases where the top-level Exception doesn't have the best error message, return a better one to use instead. We
  usually want to show SQLExceptions at the top level since they contain more useful information."
  [maps :- [:sequential {:min 1} :map]]
  (some (fn [m]
          (when (isa? (:class m) SQLException)
            (select-keys m [:error])))
        maps))

(mu/defn exception-response :- [:map [:status :keyword]]
  "Convert an Exception to a nicely-formatted Clojure map suitable for returning in userland QP responses."
  [^Throwable e :- (lib.schema.common/instance-of-class Throwable)]
  (let [[m & more :as maps] (for [e (exception-chain e)]
                              (format-exception e))]
    (merge
     m
     (best-top-level-error maps)
     ;; merge in the first error_type we see
     (when-let [error-type (some :error_type maps)]
       {:error_type error-type})
     (when (seq more)
       {:via (vec more)}))))

(defn- query-info
  "Map of about `query` to add to the exception response."
  [{query-type :type, :as query} {:keys [preprocessed native]}]
  (merge
   {:json_query (dissoc query :info :driver)}
   ;; add the fully-preprocessed and native forms to the error message for MBQL queries, since they're extremely
   ;; useful for debugging purposes.
   (when (= (keyword query-type) :query)
     {:preprocessed preprocessed
      :native       (when (qp.perms/current-user-has-adhoc-native-query-perms? query)
                      native)})))

(mu/defn ^:private query-execution-info :- :map
  [query-execution :- :map]
  (dissoc query-execution :result_rows :hash :executor_id :dashboard_id :pulse_id :native :start_time_millis))

(mu/defn ^:private format-exception* :- [:map [:status :keyword]]
  "Format a `Throwable` into the usual userland error-response format."
  [query        :- :map
   ^Throwable e :- (lib.schema.common/instance-of-class Throwable)
   extra-info   :- [:maybe :map]]
  (try
    ;; [[metabase.query-processor.middleware.process-userland-query/process-userland-query-middleware]] wraps exceptions
    ;; to add query execution info, unwrap them and format the wrapped one
    (if-let [query-execution (:query-execution (ex-data e))]
      (merge (query-execution-info query-execution)
             (format-exception* query (ex-cause e) extra-info))
      (merge
       {:data {:rows [], :cols []}, :row_count 0}
       (exception-response e)
       (query-info query extra-info)))
    (catch Throwable e
      (assoc (Throwable->map e) :status :failed))))

(mu/defn catch-exceptions :- ::qp.schema/qp
  "Middleware for catching exceptions thrown by the query processor and returning them in a 'normal' format. Forwards
  exceptions to the `result-chan`."
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/query
          rff   :- ::qp.schema/rff]
    (if-not (get-in query [:middleware :userland-query?])
      (qp query rff)
      (let [extra-info (delay
                         {:native       (u/ignore-exceptions
                                          ((requiring-resolve 'metabase.query-processor.compile/compile) query))
                          :preprocessed (u/ignore-exceptions
                                          ((requiring-resolve 'metabase.query-processor.preprocess/preprocess) query))})]
        (try
          (qp query rff)
          (catch Throwable e
            ;; format the Exception and return it
            (let [formatted-exception (format-exception* query e @extra-info)]
              (log/errorf "Error processing query: %s\n%s"
                          (or (:error formatted-exception) "Error running query")
                          (u/pprint-to-str formatted-exception))
              ;; ensure always a message on the error otherwise FE thinks query was successful. (#23258, #23281)
              (let [result (update formatted-exception
                                   :error (fnil identity (trs "Error running query")))]
                (assert (:status result))
                (qp.pipeline/*result* result)))))))))
