(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.permissions :as perms]
            [metabase.util :as u]
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
   :error      (or (.getMessage e) (str e))
   :stacktrace (u/filtered-stacktrace e)})

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
     (when-let [error-msg (and (= error-type :schema.core/error)
                               (explain-schema-validation-error error))]
       {:error error-msg})
     (when (qp.error-type/known-error-type? error-type)
       {:error_type error-type})
     ;; TODO - we should probably change this key to `:data` so we're not mixing lisp-case and snake_case keys
     {:ex-data (dissoc data :schema)})))

(defmethod format-exception SQLException
  [^SQLException e]
  (assoc ((get-method format-exception Throwable) e)
         :state (.getSQLState e)))

(defn- cause [^Throwable e]
  (let [cause (or (when (instance? java.sql.SQLException e)
                    (.getNextException ^java.sql.SQLException e))
                  (.getCause e))]
    (when-not (= cause e)
      cause)))

(defn- exception-chain [^Throwable e]
  (->> (iterate cause e)
       (take-while some?)
       reverse))

(defn- exception-response [^Throwable e]
  (let [[m & more :as ms] (for [e (exception-chain e)]
                            (format-exception e))]
    (merge
     m
     ;; merge in the first error_type we see
     (when-let [error-type (some :error_type ms)]
       {:error_type error-type})
     (when (seq more)
       {:via (vec more)}))))

(defn- query-info
  "Map of about `query` to add to the exception response."
  [{query-type :type, :as query} {:keys [preprocessed-chan native-query-chan]}]
  (merge
   {:query (dissoc query :database :driver)}
   ;; add the fully-preprocessed and native forms to the error message for MBQL queries, since they're extremely
   ;; useful for debugging purposes.
   (when (= (keyword query-type) :query)
     {:preprocessed (a/poll! preprocessed-chan)
      :native       (when (perms/current-user-has-adhoc-native-query-perms? query)
                      (a/poll! native-query-chan))})))

(defn- format-exception* [query e chans]
  (try
    (merge
     (exception-response e)
     (query-info query chans))
    (catch Throwable e
      e)))

(defn catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a 'normal' format. Forwards
  exceptions to the `result-chan`."
  [qp]
  (fn [query xformf {:keys [raise-chan finished-chan], :as chans}]
    (let [raise-chan' (a/promise-chan)]
      ;; forward exceptions to `finished-chan`
      (a/go
        (when-let [e (a/<! raise-chan')]
          (log/tracef "raise-chan' got %s, forwarding formatted exception to finished-chan" (class e))
          (a/>! finished-chan (format-exception* query e chans))))
      ;; when the original `raise-chan` gets closed, close this one too
      (a/go
        (a/<! raise-chan)
        (log/trace "raise-chan done; closing raise-chan'")
        (a/close! raise-chan'))
      (try
        (qp query xformf (assoc chans :raise-chan raise-chan'))
        (catch Throwable e
          (a/>!! raise-chan' e))))))
