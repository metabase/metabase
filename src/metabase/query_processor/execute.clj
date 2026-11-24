(ns metabase.query-processor.execute
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.process-userland-query :as qp.process-userland-query]
   [metabase.query-processor.middleware.update-used-cards :as update-used-cards]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
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

(defn- dissoc-native-form [result]
  (cond-> result
    (map? result) (m/dissoc-in [:data :native_form])))

(mu/defn- remove-native-form-without-native-perms :- ::qp.schema/qp
  "Remove `:native_form` from the results unless the current user has ad-hoc native query perms for the query's
  database. Without them, the compiled query could leak things the user can't otherwise see, e.g. a sandbox's
  injected filter, a sandbox Card's SQL, or the login attribute values bound into it.

  This runs outside the cache middleware, so cached results (which include the `:native_form` of whoever ran the query
  originally) are stripped as well."
  [qp :- ::qp.schema/qp]
  (fn [query rff]
    (if (qp.perms/current-user-has-adhoc-native-query-perms? query)
      (qp query rff)
      (letfn [(rff* [metadata]
                (let [rf (rff (dissoc metadata :native_form))]
                  (fn
                    ([] (rf))
                    ([result] (dissoc-native-form (rf (dissoc-native-form result))))
                    ([acc row] (rf acc row)))))]
        (qp query rff*)))))

(def ^:private middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f qp) -> qp

  e.g.

    (f (f query rff)) -> (f query rff)

  All of these middlewares assume MBQL 5."
  ;; Must be FIRST in this list so it runs INNERMOST (the LAST element of `reduce` ends up running FIRST). It needs
  ;; to execute INSIDE the `binding` blocks established by the EE postprocessing middlewares below. See
  ;; [[metabase.query-processor.middleware.process-userland-query/capture-execution-context-middleware]] for why.
  [#'qp.process-userland-query/capture-execution-context-middleware
   #'qp.middleware.enterprise/apply-workspace-sql-remapping-middleware
   #'qp.middleware.enterprise/swap-destination-db-middleware
   #'qp.middleware.enterprise/apply-impersonation-postprocessing-middleware
   #'update-used-cards/update-used-cards!
   #'add-native-form-to-result-metadata
   #'cache/maybe-return-cached-results
   #'remove-native-form-without-native-perms
   #'qp.perms/check-query-permissions
   #'qp.middleware.enterprise/check-download-permissions-middleware])

(def ^:private execute* nil)

(mu/defn- run [query :- ::lib.schema/query
               rff   :- ::qp.schema/rff]
  (let [query (if (driver.u/supports? driver/*driver* :mbql-5-native-query-execution (lib.metadata/database query))
                ;; keep MBQL 5 for execution
                (if (lib/native-only-query? query)
                  query
                  ;; keep any driver-specific keys in the compiled query, e.g. MongoDB's `:collection`
                  (let [native-stage (-> (:qp/compiled query)
                                         (set/rename-keys {:query :native})
                                         (assoc :lib/type :mbql.stage/native))]
                    (assoc query
                           :stages             [native-stage]
                           :qp/original-stages (:stages query))))
                ;; convert to legacy (drop this code branch in 69)
                (let [legacy-query #_{:clj-kondo/ignore [:deprecated-var]} (lib/->legacy-MBQL query)]
                  (cond-> legacy-query
                    (not (:native legacy-query)) (assoc :native (:qp/compiled legacy-query)))))]
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
