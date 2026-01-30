(ns metabase.query-processor.execute
  (:require
   [metabase.lib.core :as lib]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.update-used-cards :as update-used-cards]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- add-native-form-to-result-metadata :- ::qp.schema/qp
  [qp :- ::qp.schema/qp]
  (fn [query rff]
    (letfn [(rff* [metadata]
              {:pre [(map? metadata)]}
              (rff (cond-> metadata
                     (not (:native_form metadata))
                     (assoc :native_form ((some-fn :qp/compiled-inline :qp/compiled) query)))))]
      (qp query rff*))))

(mu/defn- add-preprocessed-query-to-result-metadata-for-userland-query :- ::qp.schema/qp
  [qp :- ::qp.schema/qp]
  (fn [query rff]
    (letfn [(rff* [metadata]
              {:pre [(map? metadata)]}
              (rff (cond-> metadata
                     ;; process-userland-query needs the preprocessed-query to find field usages
                     ;; it'll then be removed from the result
                     (qp.util/userland-query? query)
                     (assoc :preprocessed_query query))))]
      (qp query rff*))))

(def ^:private middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f qp) -> qp

  e.g.

    (f (f query rff)) -> (f query rff)

  All of these middlewares assume MBQL 5."
  [#'qp.middleware.enterprise/swap-destination-db-middleware
   #'qp.middleware.enterprise/apply-impersonation-postprocessing-middleware
   #'update-used-cards/update-used-cards!
   #'add-native-form-to-result-metadata
   #'add-preprocessed-query-to-result-metadata-for-userland-query
   #'cache/maybe-return-cached-results
   #'qp.perms/check-query-permissions
   #'qp.middleware.enterprise/check-download-permissions-middleware])

(def ^:private execute* nil)

(mu/defn- run [query :- ::qp.schema/any-query
               rff   :- ::qp.schema/rff]
  ;; if the query has a `:qp/compiled` key (i.e., this query was compiled from MBQL), rename it to `:native`, so the
  ;; driver implementations only need to look for one key. Can't really do this any sooner because it will break schema
  ;; checks in the middleware
  (let [query (cond-> query
                ;; TODO (Cam 9/15/25) -- update this and downstream code (drivers) to handle MBQL 5
                (:lib/type query) lib/->legacy-MBQL)
        query (cond-> query
                (not (:native query)) (assoc :native (:qp/compiled query)))]
    (qp.pipeline/*run* query rff)))

(mu/defn- execute-fn :- ::qp.schema/qp
  []
  (reduce
   (fn [qp middleware-fn]
     (u/prog1 (middleware-fn qp)
       (assert (ifn? <>) (format "%s did not return a valid function" middleware-fn))))
   run
   middleware))

(defn- rebuild-execute-fn! []
  (alter-var-root #'execute* (constantly (execute-fn))))

(rebuild-execute-fn!)

(doseq [varr middleware]
  (add-watch varr ::reload (fn [_key _ref _old-state _new-state]
                             (log/infof "%s changed, rebuilding %s" varr `execute*)
                             (rebuild-execute-fn!))))

;;; TODO -- consider whether this should return an `IReduceInit` that we can reduce as a separate step.
(mu/defn execute :- some?
  "Execute a compiled query, then reduce the results."
  [compiled-query :- ::qp.compile/query-with-compiled-query
   rff            :- ::qp.schema/rff]
  (qp.setup/with-qp-setup [compiled-query compiled-query]
    (execute* compiled-query rff)))

;; Test change for cloud driver trigger
