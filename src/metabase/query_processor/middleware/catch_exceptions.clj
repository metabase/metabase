(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require [clojure.tools.logging :as log]
            [metabase.query-processor
             [context :as context]
             [error-type :as error-type]
             [reducible :as qp.reducible]]
            [metabase.query-processor.middleware.permissions :as perms]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            schema.utils)
  (:import clojure.lang.ExceptionInfo
           java.sql.SQLException
           [schema.utils NamedError ValidationError]))

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
  [^InterruptedException e]
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
        {:error_type error-type/invalid-query}
        (when-let [error-msg (explain-schema-validation-error error)]
          {:error error-msg})))
     (when (error-type/known-error-type? error-type)
       {:error_type error-type})
     ;; TODO - we should probably change this key to `:data` so we're not mixing lisp-case and snake_case keys
     {:ex-data (dissoc data :schema)})))

(defmethod format-exception SQLException
  [^SQLException e]
  (assoc ((get-method format-exception Throwable) e)
         :state (.getSQLState e)))

;; TODO -- some of this logic duplicates the functionality of `clojure.core/Throwable->map`, we should consider
;; whether we can use that more extensively and remove some of this logic
(defn- cause [^Throwable e]
  (let [cause (.getCause e)]
    (when-not (= cause e)
      cause)))

(defn- exception-chain [^Throwable e]
  (->> (iterate cause e)
       (take-while some?)
       reverse))

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

(defn- query-info
  "Map of about `query` to add to the exception response."
  [{query-type :type, :as query} {:keys [preprocessed native]}]
  (merge
   {:json_query (dissoc query :info :driver)}
   ;; add the fully-preprocessed and native forms to the error message for MBQL queries, since they're extremely
   ;; useful for debugging purposes.
   (when (= (keyword query-type) :query)
     {:preprocessed preprocessed
      :native       (when (perms/current-user-has-adhoc-native-query-perms? query)
                      native)})))

(defn- query-execution-info [query-execution]
  (dissoc query-execution :result_rows :hash :executor_id :card_id :dashboard_id :pulse_id :native :start_time_millis))

(defn- format-exception*
  "Format a `Throwable` into the usual userland error-response format."
  [query ^Throwable e extra-info]
  (try
    (if-let [query-execution (:query-execution (ex-data e))]
      (merge (query-execution-info query-execution)
             (format-exception* query (.getCause e) extra-info))
      (merge
       {:data {:rows [], :cols []}, :row_count 0}
       (exception-response e)
       (query-info query extra-info)))
    (catch Throwable e
      e)))

(defn catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a 'normal' format. Forwards
  exceptions to the `result-chan`."
  [qp]
  (fn [query rff {:keys [preprocessedf nativef raisef], :as context}]
    (let [extra-info (atom nil)]
      (letfn [(preprocessedf* [query context]
                (swap! extra-info assoc :preprocessed query)
                (preprocessedf query context))
              (nativef* [query context]
                (swap! extra-info assoc :native query)
                (nativef query context))
              (raisef* [e context]
               ;; if the exception is the special quit-early exception, forward this to our parent `raisef` exception
               ;; handler, which has logic for handling that case
                (if (qp.reducible/quit-result e)
                  (raisef e context)
                  ;; otherwise format the Exception and return it
                  (let [formatted-exception (format-exception* query e @extra-info)]
                    (log/error (str (trs "Error processing query: {0}" (:error format-exception))
                                    "\n" (u/pprint-to-str formatted-exception)))
                    (context/resultf formatted-exception context))))]
        (try
          (qp query rff (assoc context
                                  :preprocessedf preprocessedf*
                                  :nativef nativef*
                                  :raisef raisef*))
          (catch Throwable e
            (raisef* e context)))))))
