(ns metabase.query-processor.execute
  (:require
   [metabase.api.common :as api]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.enterprise :as qp.middleware.enterprise]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.update-used-cards :as update-used-cards]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- add-native-form-to-result-metadata [qp]
  (fn [query rff]
    (letfn [(rff* [metadata]
              {:pre [(map? metadata)]}
              (rff (cond-> metadata
                     (not (:native_form metadata))
                     (assoc :native_form ((some-fn :qp/compiled-inline :qp/compiled :native) query)))))]
      (qp query rff*))))

(defn- add-preprocessed-query-to-result-metadata-for-userland-query [qp]
  (fn [query rff]
    (letfn [(rff* [metadata]
              {:pre [(map? metadata)]}
              (rff (cond-> metadata
                     ;; process-userland-query needs the preprocessed-query to find field usages
                     ;; it'll then be removed from the result
                     (qp.util/userland-query? query)
                     (assoc :preprocessed_query query))))]
      (qp query rff*))))

(defn- user-attribute
  "Which user attribute should we use for this RouterDB?"
  [db-or-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :db_id (u/the-id db-or-id)))

(defn primary-db-or-id->router-db-id
  [current-user db-or-id]
  (when-let [attr-name (user-attribute db-or-id)]
    (let [database-name #p (get (:login_attributes @current-user) attr-name)]
      (if (= database-name "__METABASE_PRIMARY__")
        (u/the-id db-or-id)
        (or (t2/select-one-pk :model/Database
                              :primary_database_id (u/the-id db-or-id)
                              :name database-name)
            (throw (ex-info "No MirrorDB found for user attribute" {:database-name database-name
                                                                    :primary-database-id (u/the-id db-or-id)})))))))

(defn swap-mirror-db
  [qp]
  (fn [query rff]
    (let [current-database (lib.metadata/database (qp.store/metadata-provider))
          mirror-database (primary-db-or-id->router-db-id api/*current-user* current-database)]
      (if-not mirror-database
        (qp query rff)
        (let [rff* (fn [metadata]
                     (binding [qp.store/*TESTS-ONLY-allow-replacing-metadata-provider* true]
                       (qp.store/with-metadata-provider (u/id current-database)
                         (rff metadata))))]
          (binding [qp.store/*TESTS-ONLY-allow-replacing-metadata-provider* true]
            (qp.store/with-metadata-provider mirror-database
              (qp query rff*))))))))

(def ^:private middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f qp) -> qp

  e.g.

    (f (f query rff)) -> (f query rff)"
  [#'swap-mirror-db
   #'update-used-cards/update-used-cards!
   #'add-native-form-to-result-metadata
   #'add-preprocessed-query-to-result-metadata-for-userland-query
   #'cache/maybe-return-cached-results
   #'qp.perms/check-query-permissions
   #'qp.middleware.enterprise/check-download-permissions-middleware
   #'qp.middleware.enterprise/maybe-apply-column-level-perms-check-middleware])

(def ^:private execute* nil)

(defn- run [query rff]
  ;; if the query has a `:qp/compiled` key (i.e., this query was compiled from MBQL), rename it to `:native`, so the
  ;; driver implementations only need to look for one key. Can't really do this any sooner because it will break schema
  ;; checks in the middleware
  (let [query (cond-> query
                (not (:native query)) (assoc :native (:qp/compiled query)))]
    (qp.pipeline/*run* query rff)))

(defn- rebuild-execute-fn! []
  (alter-var-root #'execute* (constantly
                              (reduce
                               (fn [qp middleware-fn]
                                 (u/prog1 (middleware-fn qp)
                                   (assert (ifn? <>) (format "%s did not return a valid function" middleware-fn))))
                               run
                               middleware))))

(rebuild-execute-fn!)

(doseq [varr middleware]
  (add-watch varr ::reload (fn [_key _ref _old-state _new-state]
                             (log/infof "%s changed, rebuilding %s" varr `execute*)
                             (rebuild-execute-fn!))))

(def ^:private CompiledQuery
  [:and
   [:map
    [:database ::lib.schema.id/database]]
   [:fn
    {:error/message "Query must be compiled -- should have either :native or :qp/compiled."}
    (some-fn :native :qp/compiled)]])

;;; TODO -- consider whether this should return an `IReduceInit` that we can reduce as a separate step.
(mu/defn execute :- some?
  "Execute a compiled query, then reduce the results."
  [compiled-query :- CompiledQuery
   rff            :- ::qp.schema/rff]
  (qp.setup/with-qp-setup [compiled-query compiled-query]
    (execute* compiled-query rff)))
