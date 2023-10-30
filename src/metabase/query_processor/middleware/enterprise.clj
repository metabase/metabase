(ns metabase.query-processor.middleware.enterprise
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :as i18n]))

(defenterprise apply-sandboxing
  "Pre-processing middleware. Replaces source tables a User was querying against with source queries that (presumably)
  restrict the rows returned, based on presence of sandboxes."
  metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
  [query]
  query)

(defenterprise apply-download-limit
  "Pre-processing middleware to apply row limits to MBQL export queries if the user has `limited` download perms. This
  does not apply to native queries, which are instead limited by the [[limit-download-result-rows]] post-processing
  middleware."
  metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  [query]
  query)

(defenterprise check-download-permissions
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  [qp]
  qp)

(defenterprise maybe-apply-column-level-perms-check
  "Execution middleware. Check column-level permissions if applicable."
  metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check
  [qp]
  qp)

(defenterprise limit-download-result-rows
  "Post-processing middleware to limit the number of rows included in downloads if the user has `limited` download
  perms. Mainly useful for native queries, which are not modified by the [[apply-download-limit]] pre-processing
  middleware."
  metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  [_query rff]
  rff)

(defenterprise merge-sandboxing-metadata
  "Post-processing middleware. Merges in column metadata from the original, unsandboxed version of the query."
  metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
  [_query rff]
  rff)

(defenterprise handle-internal-queries
  "'Around' middleware that handles `internal` type queries."
  metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries
  [qp]
  (fn [{query-type :type, :as query} xform context]
    (when (= (keyword query-type) :internal)
      (throw (ex-info (i18n/tru "Audit App queries are not enabled on this instance.")
                      {:type qp.error-type/invalid-query})))
    (qp query xform context)))
