(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require
   [metabase.query-processor.context-2 :as qp.context]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [pretty.core :as pretty]
   [schema.utils])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql SQLException)
   (schema.utils NamedError ValidationError)))

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

;; TODO - consider moving this into separate middleware as part of a try-catch setup so queries running in a
;; non-userland context can still have sane Exceptions
(defn- explain-schema-validation-error
  "Return a nice error message to explain the Schema validation error."
  [error]
  (cond
    (instance? NamedError error)
    (let [nested-error (.error ^NamedError error)]
      ;; recurse until we find the innermost nested named error, which is the reason
      ;; we actually failed
      (if (instance? NamedError nested-error)
        (recur nested-error)
        (or (when (map? nested-error)
              (explain-schema-validation-error nested-error))
            (.name ^NamedError error))))

    (map? error)
    (first (for [e     (vals error)
                 :when (or (instance? NamedError e)
                           (instance? ValidationError e))
                 :let  [explanation (explain-schema-validation-error e)]
                 :when explanation]
             explanation))

    ;; When an exception is thrown, a ValidationError comes back like
    ;;    (throws? ("foreign-keys is not supported by this driver." 10))
    ;; Extract the message if applicable
    (instance? ValidationError error)
    (let [explanation (schema.utils/validation-error-explain error)]
      (or (when (list? explanation)
            (let [[reason [msg]] explanation]
              (when (= reason 'throws?)
                msg)))
          explanation))))

(defmethod format-exception ExceptionInfo
  [e]
  (let [{error :error, error-type :type, :as data} (ex-data e)]
    (merge
     ((get-method format-exception Throwable) e)
     (when (= error-type :schema.core/error)
       (merge
        {:error_type qp.error-type/invalid-query}
        (when-let [error-msg (explain-schema-validation-error error)]
          {:error error-msg})))
     (when (qp.error-type/known-error-type? error-type)
       {:error_type error-type})
     ;; TODO - we should probably change this key to `:data` so we're not mixing lisp-case and snake_case keys
     {:ex-data (dissoc data :schema)})))

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

(defn- best-top-level-error
  "In cases where the top-level Exception doesn't have the best error message, return a better one to use instead. We
  usually want to show SQLExceptions at the top level since they contain more useful information."
  [maps]
  (some (fn [m]
          (when (isa? (:class m) SQLException)
            (select-keys m [:error])))
        maps))

(defn exception-response
  "Convert an Exception to a nicely-formatted Clojure map suitable for returning in userland QP responses."
  [^Throwable e]
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

(defn- query-execution-info [query-execution]
  (dissoc query-execution :result_rows :hash :executor_id :dashboard_id :pulse_id :native :start_time_millis))

(defn- format-exception*
  "Format a `Throwable` into the usual userland error-response format."
  [^Throwable e]
  (try
    (if-let [query-execution (:query-execution (ex-data e))]
      (merge (query-execution-info query-execution)
             (format-exception (ex-cause e)))
      (merge
       {:data {:rows [], :cols []}, :row_count 0}
       (exception-response e)))
    (catch Throwable e
      e)))

(defn- catch-exceptions-context-raise [context e]
  ;; format the Exception and return it
  (let [formatted-exception (format-exception* e)]
    (log/error (str (trs "Error processing query: {0}"
                         (or (:error formatted-exception)
                             ;; log in server locale, respond in user locale
                             (trs "Error running query")))
                    "\n" (u/pprint-to-str formatted-exception)))
    ;; ensure always a message on the error otherwise FE thinks query was successful.  (#23258, #23281)
    (qp.context/respond context (update formatted-exception
                                        :error (fnil identity (trs "Error running query"))))))

(mu/defn catch-exceptions-context :- qp.context/ContextInstance
  "Middleware for catching exceptions thrown by the query processor and returning them in a 'normal' format. Forwards
  exceptions to the `result-chan`."
  [parent-context :- qp.context/ContextInstance]
  (reify
    qp.context/Context
    (cancel [_this]
      (qp.context/cancel parent-context))
    (execute [_this thunk]
      (qp.context/execute parent-context thunk))
    (respond [_this result]
      (qp.context/respond parent-context result))
    (raise [this e]
      (catch-exceptions-context-raise this e))

    pretty/PrettyPrintable
    (pretty [_this]
      (list `catch-exceptions-context parent-context))))
