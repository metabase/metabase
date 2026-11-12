(ns metabase.query-processor.middleware.reject-sensitive-field-refs
  (:require
   [metabase.api.common :as api]
   [metabase.query-processor.middleware.normalize-query :as normalize]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.sensitive-fields :as qp.sensitive-fields]))

(defn- skip-check?
  "Superusers can query anything, and queries with no user are run by Metabase itself. Saved cards and dashboard filter
  values come from saved content."
  []
  (or api/*is-superuser?*
      (nil? api/*current-user-id*)
      qp.perms/*card-id*
      qp.perms/*param-values-query*))

(defn reject-sensitive-field-refs
  "Around middleware. Throw if an ad-hoc query refers to a `:sensitive` column of a table. Runs before preprocessing
  expands source cards, segments, and metrics, so only the parts of the query the user wrote are checked. (It can't be
  a preprocessing middleware: those can't depend on [[qp.perms]].)"
  [qp]
  (fn [query rff]
    (when-not (skip-check?)
      (qp.sensitive-fields/check-query! (normalize/normalize-preprocessing-middleware query)))
    (qp query rff)))
