(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require
   [clojure.set :as set]
   [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
   [metabase.audit-app.core :as audit]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.walk :as lib.walk]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.schema :as qp.schema]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^:dynamic *card-id*
  "ID of the Card currently being executed, if there is one. Bind this in a Card-execution so we will use
  Card [Collection] perms checking rather than ad-hoc perms checking."
  nil)

(defenterprise check-block-permissions
  "OSS implementation always returns `nil` because block permissions are an EE-only feature."
  metabase-enterprise.advanced-permissions.models.permissions.block-permissions
  [_query])

(defn- throw-inactive-table-error
  [{db-id :id db-name :name} {table-id :id table-name :name schema :schema}]
  ;; We don't cache perms for inactive tables, so we need to manually bypass the cache here
  (perms/disable-perms-cache
    (let [show-table-name? (perms/user-has-permission-for-table? *current-user-id*
                                                                 :perms/view-data
                                                                 :unrestricted
                                                                 db-id
                                                                 table-id)]
      (throw (Exception. (tru "Table {0} is inactive." (if show-table-name?
                                                         (format "\"%s.%s.%s\"" db-name schema table-name)
                                                         table-id)))))))

(defn- check-query-does-not-access-inactive-tables
  "Throws an exception if any of the tables referenced by this query are marked as inactive in the app DB.
  These queries would (likely) fail anyway since an inactive table one is either deleted, or Metabase's connection
  doesn't have access to it. But we can reject them preemptively for a more consistent experience, and to avoid
  needing to cache permissions for inactive tables."
  [{database-id :database, :as outer-query}]
  (qp.store/with-metadata-provider database-id
    (let [table-ids (query-perms/query->source-table-ids outer-query)]
      (doseq [table-id table-ids]
        (let [table (lib.metadata.protocols/table (qp.store/metadata-provider) table-id)]
          (when-not (:active table)
            (throw-inactive-table-error (lib.metadata.protocols/database (qp.store/metadata-provider))
                                        table)))))))

(def ^:dynamic *param-values-query*
  "Used to allow users looking at a dashboard to view (possibly chained) filters."
  false)

(defenterprise check-audit-db-permissions
  "OSS implementation always throws an exception since queries over the audit DB are not permitted."
  metabase-enterprise.audit-app.permissions
  [query]
  (throw (ex-info (tru "Querying this database requires the audit-app feature flag")
                  query)))

(defn remove-permissions-key
  "Pre-processing middleware. Removes the `:query-permissions/perms` key from the query. This is where we store important permissions
  information like perms coming from sandboxing (GTAPs). This is programmatically added by middleware when appropriate,
  but we definitely don't want users passing it in themselves. So remove it if it's present."
  [query]
  (dissoc query :query-permissions/perms))

(defn remove-source-card-keys
  "Pre-processing middleware. Removes any instances of the `:qp/stage-is-from-source-card` key which is added by the
  fetch-source-query middleware when source cards are resolved in a query. Since we rely on this for permission enforcement,
  we want to disallow users from passing it in themselves (like `remove-permissions-key` above)."
  [query]
  (lib.walk/walk
   query
   (fn [_query _path-type _path stage-or-join]
     (dissoc stage-or-join :qp/stage-is-from-source-card))))

(defn remove-sandboxed-table-keys
  "Pre-processing middleware. Removes any instances of the `:query-permissions/sandboxed-table` key which is added by the
  row-level-restriction middleware when sandboxes are resolved in a query. Since we rely on this for permission
  enforcement, we want to disallow users from passing it in themselves (like the functions above)."
  [query]
  (lib.walk/walk
   query
   (fn [_query _path-type _path stage-or-join]
     (dissoc stage-or-join :query-permissions/sandboxed-table))))

(mu/defn check-query-permissions*
  "Check that User with `user-id` has permissions to run `query`, or throw an exception."
  [query :- ::qp.schema/any-query]
  (if (:lib/type query)
    (recur (lib/->legacy-MBQL query))
    (let [{database-id :database, {gtap-perms :gtaps} :query-permissions/perms :as outer-query} query]
      (when *current-user-id*
        (log/tracef "Checking query permissions. Current user permissions = %s"
                    (pr-str (perms/permissions-for-user *current-user-id*)))
        (when (= audit/audit-db-id database-id)
          (check-audit-db-permissions outer-query))
        (check-query-does-not-access-inactive-tables outer-query)
        (let [required-perms  (query-perms/required-perms-for-query outer-query :already-preprocessed? true)
              source-card-ids (set/difference (:card-ids required-perms) (:card-ids gtap-perms))]
          ;; On EE, check block permissions up front for all queries. If block perms are in place, reject all native queries
          ;; (unless overridden by `gtap-perms`) and any queries that touch blocked tables/DBs
          (check-block-permissions outer-query)
          (cond
            ;; if card-id is bound this means that this is not an ad hoc query and we can just
            ;; check that the user has permission to read this card
            *card-id*
            (do (query-perms/check-card-read-perms database-id *card-id*)
                (query-perms/check-card-result-metadata-data-perms database-id *card-id*))

            ;; set when querying for field values of dashboard filters, which only require
            ;; collection perms for the dashboard and not ad-hoc query perms
            *param-values-query*
            (when-not (query-perms/has-perm-for-query? outer-query :perms/view-data required-perms)
              (throw (query-perms/perms-exception required-perms)))

            ;; Ad-hoc query (not a saved question)
            :else
            (do
              ;; Check that we permissions for any source cards first, then check that we have requisite data permissions
              ;; Recursively check permissions for any source Cards
              (doseq [card-id source-card-ids]
                (query-perms/check-card-read-perms database-id card-id))

              ;; Check that we have the data permissions to run this card
              (query-perms/check-data-perms outer-query required-perms :throw-exceptions? true)

              ;; Check that all columns from source cards result_metadata are accessible
              (doseq [card-id source-card-ids]
                (query-perms/check-card-result-metadata-data-perms database-id card-id))

              ;; Recursively check permissions for any Cards referenced by this query via template tags
              (doseq [{query :dataset-query} (lib/template-tags-referenced-cards
                                              (lib/query (qp.store/metadata-provider) outer-query))]
                (check-query-permissions* query)))))))))

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query. This only applies if
  `*current-user-id*` is bound. In other cases, like when running public Cards or sending pulses, permissions need to
  be checked separately before allowing the relevant objects to be create (e.g., when saving a new Pulse or
  'publishing' a Card)."
  [qp]
  (fn [query rff]
    (check-query-permissions* query)
    (qp query rff)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Writeback fns                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn check-query-action-permissions*
  "Check that User with `user-id` has permissions to run query action `query`, or throw an exception. Takes
  as [[metabase.actions.args/action-arg-map-schema]]."
  [{database-id :database, :as query} :- ::lib.schema/query]
  (log/tracef "Checking query permissions. Current user perms set = %s" (pr-str @*current-user-permissions-set*))
  (when *card-id*
    (query-perms/check-card-read-perms database-id *card-id*))
  (when-not (query-perms/check-data-perms
             query
             (query-perms/required-perms-for-query query :already-preprocessed? true)
             :throw-exceptions? false)
    (check-block-permissions query)))

(mu/defn check-query-action-permissions :- ::qp.schema/qp
  "Middleware that check that the current user has permissions to run the current query action."
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::lib.schema/native-only-query
          rff   :- ::qp.schema/rff]
    (check-query-action-permissions* query)
    (qp query rff)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Non-middleware util fns                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn current-user-has-adhoc-native-query-perms?
  "If current user is bound, do they have ad-hoc native query permissions for `query`'s database? (This is used by
  [[metabase.query-processor.compile/compile]] and
  the [[metabase.query-processor.middleware.catch-exceptions/catch-exceptions]] middleware to check the user should be
  allowed to see the native query before converting the MBQL query to native.)"
  [{database-id :database, :as _query}]
  (or
   (not *current-user-id*)
   (= (perms/full-db-permission-for-user *current-user-id* :perms/create-queries database-id)
      :query-builder-and-native)))

(defn check-current-user-has-adhoc-native-query-perms
  "Check that the current user (if bound) has adhoc native query permissions to run `query`, or throw an
  Exception. (This is used by the `POST /api/dataset/native` endpoint to check perms before converting an MBQL query
  to native.)"
  [{database-id :database, :as query}]
  (when-not (current-user-has-adhoc-native-query-perms? query)
    (throw (query-perms/perms-exception {database-id {:perms/create-queries :query-builder-and-native}}))))
