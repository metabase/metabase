(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require [clojure.core.async :as a]
            [metabase.query-processor
             [error-type :as qp.error-type]
             [interface :as qp.i]]
            [metabase.util :as u]
            schema.utils)
  (:import clojure.lang.ExceptionInfo
           [schema.utils NamedError ValidationError]))

(def ^:dynamic ^:private *add-preprocessed-queries?* true)

(defmulti ^:private format-exception
  "Format an Exception thrown by the Query Processor."
  {:arglists '([query e])}
  (fn [_ e]
    (class e)))

(defmethod format-exception Throwable
  [{query-type :type, :as query}, ^Throwable e]
  (merge
   {:status     :failed
    :class      (class e)
    :error      (or (.getMessage e) (str e))
    :stacktrace (u/filtered-stacktrace e)
    ;; TODO - removing this stuff is not really needed anymore since `:database` is just the ID and not the
    ;; entire map including `:details`
    :query      (dissoc query :database :driver)}
   ;; add the fully-preprocessed and native forms to the error message for MBQL queries, since they're extremely
   ;; useful for debugging purposes. Since generating them requires us to recursively run the query processor,
   ;; make sure we can skip adding them if we end up back here so we don't recurse forever
   (when (and (= (keyword query-type) :query)
              *add-preprocessed-queries?*)
     ;; obviously we do not want to get core.async channels back for preprocessed & native, so run the preprocessing
     ;; steps synchronously
     (let [query (dissoc query :async?)]
       (binding [*add-preprocessed-queries?* false
                 qp.i/*disable-qp-logging*   true]
         {:preprocessed (u/ignore-exceptions
                          ((resolve 'metabase.query-processor/query->preprocessed) query))
          :native       (u/ignore-exceptions
                          ((resolve 'metabase.query-processor/query->native) query))})))
   ;; if the Exception has a cause, add that in as well, because a lot of times we add relevant context to Exceptions
   ;; and rethrow
   (when-let [cause (.getCause e)]
     {:cause (dissoc (format-exception nil cause) :status :query :stacktrace)})))

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
  [query e]
  (let [{error :error, :as data} (ex-data e)
        {error-type :type}       (u/all-ex-data e)]
    (merge
     ((get-method format-exception Throwable) query e)
     (when-let [error-msg (and (= error-type :schema.core/error)
                               (explain-schema-validation-error error))]
       {:error error-msg})
     (when (qp.error-type/known-error-type? error-type)
       {:error_type error-type})
     {:ex-data (dissoc data :schema)})))

(defn- format-exception* [query e]
  (try
    (format-exception query e)
    (catch Throwable e
      e)))

(defn catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a 'normal' format. Forwards
  exceptions to the `result-chan`."
  [qp]
  (fn [query xform-fn {:keys [raise-chan finished-chan], :as chans}]
    (let [raise-chan' (a/promise-chan)]
      ;; forward exceptions to `finished-chan`
      (a/go
        (when-let [e (a/<! raise-chan')]
          (a/>! finished-chan (format-exception* query e)))
        (a/close! raise-chan))
      ;; if the original `raise-chan` gets closed then close this one too
      (a/go
        (a/<! raise-chan)
        (a/close! raise-chan'))
      (try
        (qp query xform-fn (assoc chans :raise-chan raise-chan'))
        (catch Throwable e
          (a/>!! raise-chan' e))))))


;; TODO NOCOMMIT

;; The following is a better way to return Exceptions I've been working on, returns the root Exception at the
;; top-level and ones that wrap it in a `:via` sequence, similar to how they are displayed in the CIDER REPL
;;
;; Currently we nest causes inside `:cause` keys, meaning the root Exception is at the deepest level, and we see
;; messages like "Query failed" as the top-level and "Cannot parse SQL" as the most-nested `:cause`. It is more useful
;; to see the root Exception at the top-level IMO, and this would open us up to catching Exceptions and adding useful
;; info more often.

#_(defn- exception-chain [^Throwable e]
    (->> (iterate
          (fn [^Throwable e]
            (when-let [cause (or (when (instance? java.sql.SQLException e)
                                   (.getNextException ^java.sql.SQLException e))
                                 (.getCause e))]
              (when-not (= e cause)
                cause)))
          e)
         (take-while some?)
         reverse))

#_(defn- format-exception [^Throwable e]
  (merge
   {:type (.getCanonicalName (class e))
    :message    (.getMessage e)
    :stacktrace (u/filtered-stacktrace e)}
   (when-let [data (ex-data e)]
     {:data data})
   (when (instance? java.sql.SQLException e)
     {:state (.getSQLState ^java.sql.SQLException e)})))

#_(defn- exception-response [^Throwable e]
  (let [[e-info & more] (for [e (exception-chain e)]
                          (format-exception e))]
    (merge
     {:status :failed}
     e-info
     (when (seq more)
       {:via (vec more)}))))
