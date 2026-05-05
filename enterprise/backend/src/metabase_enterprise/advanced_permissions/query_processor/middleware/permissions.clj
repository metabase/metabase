(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(def ^:private max-rows-in-limited-downloads 10000)

(mu/defn- is-download?
  "Returns true if this query is being used to generate a CSV/JSON/XLSX export."
  [query :- ::qp.schema/any-query]
  (some-> query :info :context name (str/includes? "download")))

(defenterprise-schema apply-download-limit :- ::lib.schema/query
  "Pre-processing middleware to apply row limits to MBQL export queries if the user has `ten-thousand-rows` download
  perms. This does not apply to native queries, which are instead limited by the [[limit-download-result-rows]]
  post-processing middleware."
  :feature :advanced-permissions
  [query :- ::lib.schema/query]
  (cond-> query
    (and (is-download? query)
         (= (:lib/type (lib/query-stage query -1)) :mbql.stage/mbql)
         (= (perms/download-perms-level query api/*current-user-id*) :ten-thousand-rows))
    (lib/limit ((fnil min Integer/MAX_VALUE) (lib/current-limit query -1) max-rows-in-limited-downloads))))

(defenterprise-schema limit-download-result-rows :- ::qp.schema/rff
  "Post-processing middleware to limit the number of rows included in downloads if the user has `limited` download
  perms. Mainly useful for native queries, which are not modified by the [[apply-download-limit]] pre-processing
  middleware."
  :feature :advanced-permissions
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (if (and (is-download? query)
           (= (perms/download-perms-level query api/*current-user-id*) :ten-thousand-rows))
    (fn limit-download-result-rows* [metadata]
      ((take max-rows-in-limited-downloads) (rff metadata)))
    rff))

(defenterprise-schema check-download-permissions :- ::qp.schema/qp
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  :feature :advanced-permissions
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::lib.schema/query
          rff   :- ::qp.schema/rff]
    (let [download-perms-level (if api/*current-user-id*
                                 (perms/download-perms-level query api/*current-user-id*)
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
