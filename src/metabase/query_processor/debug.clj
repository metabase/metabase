(ns metabase.query-processor.debug
  "Functions for debugging QP code. Enable QP debugging by binding `qp/*debug*`; the `debug-middlewaer` function below
  wraps each middleware function for debugging purposes."
  (:require [clojure.data :as data]
            [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor.middleware.mbql-to-native :as mbql-to-native]
            [metabase.util :as u]
            [schema.core :as s]))

(defn debug-middleware
  "Reducing function used to build the debugging QP pipeline. Bind `qp/*debug*` to use this.

  This does a few things to make QP debugging easier:

  *  Logs any changes in the query during preprocessing, along with the middleware that changed it
  *  Validates the results of the query after each step against the MBQL schema."
  [qp middleware-var]
  (let [middleware      (var-get middleware-var)
        middleware-name (:name (meta middleware-var))]
    (fn
      ([before-query & args]
       (let [qp (^:once fn* [after-query & args]
                 (when-not (= before-query after-query)
                   (let [[only-in-before only-in-after] (data/diff before-query after-query)]
                     (println "Middleware" (u/format-color 'yellow middleware-name) "modified query:\n"
                              "before" (u/pprint-to-str 'blue before-query)
                              "after " (u/pprint-to-str 'green after-query)
                              (if only-in-before
                                (str "only in before: " (u/pprint-to-str 'cyan only-in-before))
                                "")
                              (if only-in-after
                                (str "only in after: " (u/pprint-to-str 'magenta only-in-after))
                                "")))
                   ;; mbql->native is allowed to have both a `:query` and a `:native` key for whatever reason
                   (when-not (= middleware-var #'mbql-to-native/mbql->native)
                     (s/validate mbql.s/Query after-query)))
                 (apply qp after-query args))]
         (apply (middleware qp) before-query args))))))
