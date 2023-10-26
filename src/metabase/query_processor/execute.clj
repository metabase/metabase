(ns metabase.query-processor.execute
  (:require
   [metabase.driver :as driver]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.permissions :as qp.perms]))

(defenterprise ee-middleware-check-download-permissions
  "EE only: middleware for queries that generate downloads, which checks that the user has permissions to download the
  results of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  [qp]
  qp)

(defenterprise ee-middleware-maybe-apply-column-level-perms-check
  "EE only: check column-level permissions if applicable."
  metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check
  [qp]
  qp)

(def ^:private middleware
  "Middleware that happens after compilation, AROUND query execution itself. Has the form

    (f qp) -> qp

  Where QP is a function of the form

    (f query rff context)

  i.e.

    (f (f query rff context)) -> (f query rff context)"
  [#'cache/maybe-return-cached-results
   #'qp.perms/check-query-permissions
   #'ee-middleware-check-download-permissions
   #'ee-middleware-maybe-apply-column-level-perms-check])

(defn- respond [rff]
  (fn [initial-metadata reducible-rows]
    (let [rf (rff initial-metadata)]
      (transduce
       identity
       rf
       reducible-rows))))

(defn- execute* [query rff context]
  (driver/execute-reducible-query driver/*driver* query context (respond rff)))

(defn- execute-qp []
  (reduce
   (fn [qp middleware-fn]
     (middleware-fn qp))
   execute*
   middleware))

(defn execute [query rff context]
  ((execute-qp) query rff context))
