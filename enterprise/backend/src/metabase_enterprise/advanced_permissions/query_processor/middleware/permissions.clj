(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.query.permissions :as query-perms]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]))

(def ^:private max-rows-in-limited-downloads 10000)

(defn- is-download?
  "Returns true if this query is being used to generate a CSV/JSON/XLSX export."
  [query]
  (some-> query :info :context name (str/includes? "download")))

(defmulti ^:private current-user-download-perms-level :type)

(defmethod current-user-download-perms-level :default
  [_]
  :one-million-rows)

(defmethod current-user-download-perms-level :native
  [{database :database}]
  (data-perms/native-download-permission-for-user api/*current-user-id* database))

(defmethod current-user-download-perms-level :query
  [{db-id :database, :as query}]
  ;; Remove the :native key (containing the transpiled MBQL) so that this helper function doesn't think the query is
  ;; a native query. Actual native queries are dispatched to a different method by the :type key.
  (let [table-ids   (query-perms/query->source-table-ids (dissoc query :native))
        table-perms (into #{}
                          (map (fn [table-id]
                                 (if (= table-id ::query-perms/native)
                                   (data-perms/native-download-permission-for-user api/*current-user-id* db-id)
                                   (data-perms/table-permission-for-user api/*current-user-id* :perms/download-results db-id table-id)))
                               table-ids))]
    ;; The download perm level for a query should be equal to the lowest perm level of any table referenced by the query.
    (or (table-perms :no)
        (table-perms :ten-thousand-rows)
        :one-million-rows)))

(defenterprise apply-download-limit
  "Pre-processing middleware to apply row limits to MBQL export queries if the user has `ten-thousand-rows` download
  perms. This does not apply to native queries, which are instead limited by the [[limit-download-result-rows]]
  post-processing middleware."
  :feature :advanced-permissions
  [{query-type :type, {original-limit :limit} :query, :as query}]
  (if (and (is-download? query)
           (= query-type :query)
           (= (current-user-download-perms-level query) :ten-thousand-rows))
    (assoc-in query
              [:query :limit]
              (apply min (filter some? [original-limit max-rows-in-limited-downloads])))
    query))

(defenterprise limit-download-result-rows
  "Post-processing middleware to limit the number of rows included in downloads if the user has `limited` download
  perms. Mainly useful for native queries, which are not modified by the [[apply-download-limit]] pre-processing
  middleware."
  :feature :advanced-permissions
  [query rff]
  (if (and (is-download? query)
           (= (current-user-download-perms-level query) :ten-thousand-rows))
    (fn limit-download-result-rows* [metadata]
      ((take max-rows-in-limited-downloads) (rff metadata)))
    rff))

(defenterprise check-download-permissions
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  :feature :advanced-permissions
  [qp]
  (fn [query rff]
    (let [download-perms-level (if api/*current-user-id*
                                 (current-user-download-perms-level query)
                                 ;; If no user is bound, assume full download permissions (e.g. for public questions)
                                 :one-million-rows)]
      (when (and (is-download? query)
                 (= download-perms-level :no))
        (throw (ex-info (tru "You do not have permissions to download the results of this query.")
                        {:type qp.error-type/missing-required-permissions
                         :permissions-error? true})))
      (qp query
          (fn rff* [metadata] (rff (some-> metadata
                                           ;; Convert to API-style value names for the FE, for now
                                           (assoc :download_perms (case download-perms-level
                                                                    :no :none
                                                                    :ten-thousand-rows :limited
                                                                    :one-million-rows :full)))))))))
