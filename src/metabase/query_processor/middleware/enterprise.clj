(ns metabase.query-processor.middleware.enterprise
  "Wrappers for enterprise-only QP middleware using [[defenterprise]]. Pre-processing and post-processing middleware can
  use [[defenterprise]] directly, since the top-level function is applied directly each during each QP run, meaning it
  gets the chance to dispatch correctly every time it is run; 'around' middleware (including 'execution' middleware)
  needs a helper function that invokes the [[defenterprise]] function during every QP run, rather than just once when
  all middleware is combined. See [[handle-audit-app-internal-queries]]
  and [[handle-audit-app-internal-queries-middleware]] for example."
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :as i18n]))

;;;; Pre-processing middleware

;;; (f query) => query

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

;;;; Execution middleware

;;; (f qp) => qp

(defenterprise check-download-permissions
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  [qp]
  qp)

(defn check-download-permissions-middleware
  "Helper middleware wrapper for [[check-download-permissions]] to make sure we do [[defenterprise]] dispatch
  correctly on each QP run rather than just once when we combine all of the QP middleware."
  [qp]
  (fn [query rff]
    ((check-download-permissions qp) query rff)))

(defenterprise maybe-apply-column-level-perms-check
  "Execution middleware. Check column-level permissions if applicable."
  metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check
  [qp]
  qp)

(defn maybe-apply-column-level-perms-check-middleware
  "Helper middleware wrapper for [[maybe-apply-column-level-perms-check]] to make sure we do [[defenterprise]] dispatch
  correctly on each QP run rather than just once when we combine all of the QP middleware."
  [qp]
  (fn [query rff]
    ((maybe-apply-column-level-perms-check qp) query rff)))

;;;; Post-processing middleware

;;; (f query rff) => rff

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

;;;; Around middleware

;;; (f qp) => qp

(defenterprise handle-audit-app-internal-queries
  "'Around' middleware that handles `:internal` (Audit App) type queries."
  metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries
  [qp]
  (fn [{query-type :type, :as query} rff]
    (when (= (keyword query-type) :internal)
      (throw (ex-info (i18n/tru "Audit App queries are not enabled on this instance.")
                      {:type qp.error-type/invalid-query})))
    (qp query rff)))

(defn handle-audit-app-internal-queries-middleware
  "Helper middleware wrapper for [[handle-audit-app-internal-queries]] to make sure we do [[defenterprise]] dispatch
  correctly on each QP run rather than just once when we combine all of the QP middleware."
  [qp]
  (fn [query rff]
    ((handle-audit-app-internal-queries qp) query rff)))
