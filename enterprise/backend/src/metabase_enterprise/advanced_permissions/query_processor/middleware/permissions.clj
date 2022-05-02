(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  (:require [clojure.string :as str]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.models.query.permissions :as query-perms]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.util.i18n :refer [tru]]))

(def ^:private max-rows-in-limited-downloads 10000)

(defn- is-download?
  "Returns true if this query is being used to generate a CSV/JSON/XLSX export."
  [query]
  (some-> query :info :context name (str/includes? "download")))

(defn- table->download-perms-path
  "Given a table-id referenced by a query, returns the permissions path required to download the results of the query
  at the level specified by `download-level` (either :full or :limited)."
  [db-id table-id download-level]
  (first
   (query-perms/tables->permissions-path-set
    db-id
    #{table-id}
    {:table-perms-fn (fn [& path-components] (apply perms/feature-perms-path :download download-level path-components))
     :native-perms-fn (fn [db-id] (perms/native-feature-perms-path :download download-level db-id))})))

(defn- table-id->download-perms-level
  "Given a table-id referenced by a query, returns the level at which the current user can download the data in the
  table (:full, :limited or :none)."
  [db-id table-id]
  (cond (perms/set-has-full-permissions? @api/*current-user-permissions-set* (table->download-perms-path db-id table-id :full))
        :full

        (perms/set-has-full-permissions? @api/*current-user-permissions-set* (table->download-perms-path db-id table-id :limited))
        :limited

        :else
        :none))

(defmulti ^:private current-user-download-perms-level :type)

(defmethod current-user-download-perms-level :default
  [_]
  :full)

(defmethod current-user-download-perms-level :native
  [{database :database}]
  (cond
    (perms/set-has-full-permissions? @api/*current-user-permissions-set* (perms/native-feature-perms-path :download :full database))
    :full

    (perms/set-has-full-permissions? @api/*current-user-permissions-set* (perms/native-feature-perms-path :download :limited database))
    :limited

    :else
    :none))

(defmethod current-user-download-perms-level :query
  [{db-id :database, :as query}]
  ;; Remove the :native key (containing the transpiled MBQL) so that this helper function doesn't think the query is
  ;; a native query. Actual native queries are dispatched to a different method by the :type key.
  (let [table-ids (query-perms/query->source-table-ids (dissoc query :native))]
    ;; The download perm level for a query should be equal to the lowest perm level of any table referenced by the query.
    (reduce (fn [lowest-seen-perm-level table-id]
              (let [table-perm-level (table-id->download-perms-level db-id table-id)]
                (cond
                  (= table-perm-level :none)
                  (reduced :none)

                  (or (= lowest-seen-perm-level :limited)
                      (= table-perm-level :limited))
                  :limited

                  :else
                  :full)))
            :full
            table-ids)))

(defn apply-download-limit
  "Pre-processing middleware to apply row limits to MBQL export queries if the user has `limited` download perms. This
  does not apply to native queries, which are instead limited by the [[limit-download-result-rows]] post-processing
  middleware."
  [{query-type :type, {original-limit :limit} :query, :as query}]
  (if (and (is-download? query)
           (premium-features/has-feature? :advanced-permissions)
           (= query-type :query)
           (= (current-user-download-perms-level query) :limited))
    (assoc-in query
              [:query :limit]
              (apply min (filter some? [original-limit max-rows-in-limited-downloads])))
    query))

(defn limit-download-result-rows
  "Post-processing middleware to limit the number of rows included in downloads if the user has `limited` download
  perms. Mainly useful for native queries, which are not modified by the [[apply-download-limit]] pre-processing
  middleware."
  [query rff]
  (if (and (is-download? query)
           (premium-features/has-feature? :advanced-permissions)
           (= (current-user-download-perms-level query) :limited))
    (fn limit-download-result-rows* [metadata]
      ((take max-rows-in-limited-downloads) (rff metadata)))
    rff))

(defn check-download-permissions
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  [qp]
  (fn [query rff context]
    (if (premium-features/has-feature? :advanced-permissions)
      (let [download-perms-level (if api/*current-user-permissions-set*
                                   (current-user-download-perms-level query)
                                   ;; If no user is bound, assume full download permissions (e.g. for public questions)
                                   :full)]
        (when (and (is-download? query)
                   (= download-perms-level :none))
          (throw (ex-info (tru "You do not have permissions to download the results of this query.")
                          {:type qp.error-type/missing-required-permissions
                           :permissions-error? true})))
        (qp query
            (fn [metadata] (rff (some-> metadata (assoc :download_perms download-perms-level))))
            context))
      (qp query rff context))))
