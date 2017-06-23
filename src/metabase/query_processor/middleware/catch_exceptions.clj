(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require [metabase.query-processor.middleware.expand-resolve :as expand-resolve]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            schema.utils)
  (:import [schema.utils NamedError ValidationError]))

(defn- fail [query, ^Throwable e, & [additional-info]]
  (merge {:status         :failed
          :class          (class e)
          :error          (or (.getMessage e) (str e))
          :stacktrace     (u/filtered-stacktrace e)
          :query          (dissoc query :database :driver)
          :expanded-query (when (qputil/mbql-query? query)
                            (u/ignore-exceptions
                              (dissoc (expand-resolve/expand-and-resolve query) :database :driver)))}
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

(defn catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a normal format."
  [qp]
  (fn [query]
    (try (qp query)
         (catch clojure.lang.ExceptionInfo e
           (fail query e (when-let [data (ex-data e)]
                           (when (= (:type data) :schema.core/error)
                             (when-let [error (explain-schema-validation-error (:error data))]
                               {:error error})))))
         (catch Throwable e
           (fail query e)))))
