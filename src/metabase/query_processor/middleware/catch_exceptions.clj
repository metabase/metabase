(ns metabase.query-processor.middleware.catch-exceptions
  "Middleware for catching exceptions thrown by the query processor and returning them in a friendlier format."
  (:require [metabase.query-processor.middleware.add-query-throttle :as query-throttle]
            [metabase.util :as u]
            schema.utils)
  (:import [schema.utils NamedError ValidationError]))

(def ^:dynamic ^:private *add-preprocessed-queries?* true)

(defn- fail [{query-type :type, :as query}, ^Throwable e, & [additional-info]]
  (merge {:status     :failed
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
           (binding [*add-preprocessed-queries?* false]
             {:preprocessed (u/ignore-exceptions
                              ((resolve 'metabase.query-processor/query->preprocessed) query))
              :native       (u/ignore-exceptions
                              ((resolve 'metabase.query-processor/query->native) query))}))
         (when-let [data (ex-data e)]
           {:ex-data (dissoc data :schema)})
         additional-info))

(defn- explain-schema-validation-error
  "Return a nice error message to explain the schema validation error."
  [error]
  (cond
    (instance? NamedError error)      (let [nested-error (.error ^NamedError error)]
                                        ;; recurse until we find the innermost nested named error, which is the reason
                                        ;; we actually failed
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
    ;; When an exception is thrown, a ValidationError comes back like
    ;;    (throws? ("foreign-keys is not supported by this driver." 10))
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
           (let [{error :error, error-type :type, :as data} (ex-data e)]
             ;; When we've hit our concurrent query limit, let that exception bubble up, otherwise repackage it as a failure
             (if (=  error-type ::query-throttle/concurrent-query-limit-reached)
               (throw e)
               (fail query e (when-let [error-msg (and (= error-type :schema.core/error)
                                                       (explain-schema-validation-error error))]
                               {:error error-msg})))))
         (catch Throwable e
           (fail query e)))))
