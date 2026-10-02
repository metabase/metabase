(ns metabase.query-processor.sensitive-fields
  "Columns an admin has marked \"Do not include\" (`visibility_type = :sensitive`) are left out of a table's returned
  columns, so an explicit `:field` ref is the only way one can end up in a query. These checks reject such refs in
  queries a non-admin writes themselves. Saved content (cards, segments, metrics, dashboard filters) is left alone:
  whoever saved it decided what to share with the people who can see it."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.parameters :as lib.parameters]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.normalize-query :as normalize]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :refer [tru]]))

(defn- join-on-table? [query path join-alias]
  (let [joins (lib.walk/apply-f-for-stage-at-path lib/joins query path)
        join  (m/find-first #(= (:alias %) join-alias) joins)]
    (some? (:source-table (first (:stages join))))))

(defn- read-from-table?
  "Whether `col` comes straight from a table. Columns from native stages or saved cards were selected on purpose, and
  MBQL stages never project a sensitive column for later stages to pick up."
  [query path col]
  (case (:lib/source col)
    (:source/table-defaults :source/implicitly-joinable) true
    :source/joins                                        (join-on-table? query path (:lib/join-alias col))
    false))

(defn- check-field-ref [query path field-ref]
  (let [col (lib.walk/apply-f-for-stage-at-path lib.field.resolution/resolve-field-ref query path field-ref)]
    (when (and (= (:visibility-type col) :sensitive)
               (read-from-table? query path col))
      (throw (ex-info (tru "Field {0} is not available for querying." (pr-str (:name col)))
                      {:type             qp.error-type/invalid-query
                       :status-code      400
                       :field            field-ref
                       ::sensitive-field true})))))

(defn- check-parameters [query]
  (doseq [{:keys [target]} (:parameters query)
          :let [field-ref (lib.parameters/parameter-target-field-ref target)]
          :when field-ref
          :let [stage-number (lib.parameters/parameter-target-stage-number target)
                stage-number (cond-> stage-number
                               (neg? stage-number) (+ (count (:stages query))))]]
    (check-field-ref query [:stages stage-number] field-ref)))

(defn check-query!
  "Throw if `query`, a normalized MBQL 5 query, refers to a `:sensitive` column of a table."
  [query]
  (lib.walk/walk-clauses query (fn [query _path-type path clause]
                                 (when (lib.util/field-clause? clause)
                                   (check-field-ref query path clause))
                                 nil))
  (check-parameters query))

(defn check-query-can-be-saved!
  "Throw if the current user can't save `query` because it refers to a `:sensitive` column of a table."
  [query]
  (when-not api/*is-superuser?*
    (try
      (qp.setup/with-qp-setup [query query]
        (check-query! (normalize/normalize-preprocessing-middleware query)))
      ;; other problems with the query are left to the permissions check, which tolerates queries it can't preprocess
      (catch clojure.lang.ExceptionInfo e
        (when (::sensitive-field (ex-data e))
          (throw e))))))
