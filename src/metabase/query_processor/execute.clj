(ns metabase.query-processor.execute
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.enterprise
    :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- add-native-form-to-result-metadata [qp]
  (fn [query rff context]
    (letfn [(rff* [metadata]
              (rff (assoc metadata :native_form (:native query))))]
      (qp query rff* context))))

(def ^:private middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f qp) -> qp

  e.g.

    (f (f query rff context)) -> (f query rff context)"
  [#'add-native-form-to-result-metadata
   #'cache/maybe-return-cached-results
   #'qp.perms/check-query-permissions
   #'qp.middleware.enterprise/check-download-permissions-middleware
   #'qp.middleware.enterprise/maybe-apply-column-level-perms-check-middleware])

(def ^:private execute* nil)

(defn- rebuild-execute-fn! []
  (alter-var-root #'execute* (constantly
                              (reduce
                               (fn [qp middleware-fn]
                                 (middleware-fn qp))
                               (fn qp [query rff context]
                                 (qp.context/runf context query rff))
                               middleware))))

(rebuild-execute-fn!)

(doseq [varr middleware]
  (add-watch varr ::reload (fn [_key _ref _old-state _new-state]
                             (log/infof "%s changed, rebuilding %s" varr `execute*)
                             (rebuild-execute-fn!))))

(mu/defn execute :- :some
  "Execute a compiled query, then reduce the results. Return value of this depends on `context`; a synchronous context
  will block and return reduced results, while an async context will return a core.async promise channel immediately
  that can be polled for the reduced results."
  [compiled-query :- [:map
                      [:database ::lib.schema.id/database]
                      [:native :map]]
   rff            :- ::qp.schema/rff
   context        :- ::qp.context/context]
  (qp.setup/with-qp-setup [compiled-query compiled-query]
    (try
      (execute* compiled-query rff context)
      (catch Throwable e
        (throw (ex-info (i18n/tru "Error executing query: {0}" (ex-message e))
                        {:query compiled-query, :type qp.error-type/db}
                        e))))))
