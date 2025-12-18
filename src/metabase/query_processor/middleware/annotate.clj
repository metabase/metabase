(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query, under the `:cols` column."
  (:refer-clojure :exclude [every? mapv empty? get-in])
  (:require
   [metabase.analyze.core :as analyze]
   [metabase.driver.common :as driver.common]
   ;; allowed because `:field_ref` is supposed to be a legacy field ref for backward compatibility purposes
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? mapv empty? get-in]]
   [potemkin :as p]))

(comment metabase.query-processor.middleware.annotate.legacy-helper-fns/keep-me)

(mr/def ::col
  [:map
   [:source    {:optional true} ::lib.schema.metadata/column.legacy-source]
   [:field_ref {:optional true} ::mbql.s/Reference]])

(mr/def ::qp-results-cased-col
  "Map where all simple keywords are snake_case, but lib keywords can stay in kebab-case."
  [:and
   ::col
   [:fn
    {:error/message "map with QP results casing rules for keys"}
    (fn [m]
      (every? (fn [k]
                (= k (lib/lib-metadata-column-key->legacy-metadata-column-key k)))
              (keys m)))]])

(mr/def ::cols
  [:maybe [:sequential ::col]])

(mr/def ::metadata
  [:map
   [:cols {:optional true} ::cols]])

(mu/defn expected-cols :- [:sequential ::qp-results-cased-col]
  "Return metadata for columns returned by a pMBQL `query`.

  `initial-cols` are (optionally) the initial minimal metadata columns as returned by the driver (usually just column
  name and base type). If provided these are merged with the columns the query is expected to return.

  Note this `initial-cols` is more or less required for native queries unless they have metadata attached."
  ([query]
   (expected-cols query []))

  ([query         :- ::lib.schema/query
    initial-cols  :- ::cols]
   (mapv lib/lib-metadata-column->legacy-metadata-column (lib.metadata.result-metadata/returned-columns query initial-cols))))

(mu/defn- add-column-info-no-type-inference :- ::qp.schema/rf
  [query            :- ::lib.schema/query
   rff              :- ::qp.schema/rff
   initial-metadata :- ::metadata]
  (qp.debug/debug> (list `add-column-info query initial-metadata))
  (let [metadata' (update initial-metadata :cols #(expected-cols query %))]
    (qp.debug/debug> (list `add-column-info query initial-metadata '=> metadata'))
    (rff metadata')))

;;;;
;;;; TYPE INFERENCE
;;;;

(mu/defn base-type-inferer :- ::qp.schema/rf
  "Native queries don't have the type information from the original `Field` objects used in the query. If the driver
  returned a base type more specific than :type/*, use that; otherwise look at the sample of rows and infer the base
  type based on the classes of the values"
  [{:keys [cols]} :- :map]
  (apply analyze/col-wise
         (for [{driver-base-type :base_type} cols]
           (if (contains? #{nil :type/*} driver-base-type)
             (driver.common/values->base-type)
             (analyze/constant-fingerprinter driver-base-type)))))

(defn- enrich-with-inferred-type
  "Set :base_type and :effective_type to `base-type` in `col`.
  Also set or update the :field_ref field to contain `base-type` in the field ref options."
  [col base-type]
  (cond-> (assoc col :base_type base-type, :effective_type base-type)
    ;; if we have a field_ref for a named column, set the base_type options
    (string? (get-in col [:field_ref 1]))
    (update-in [:field_ref 2] assoc :base-type base-type)
    ;; if there is no field_ref at all, add it
    (nil? (:field_ref col))
    (assoc :field_ref [:field (:name col) {:base-type base-type}])))

(mu/defn- infer-base-type-xform :- ::qp.schema/rf
  "Add an xform to `rf` that will update the final results metadata with `base_type` and an updated `field_ref` based on
  the a sample of values in result rows. This is only needed for drivers that don't return base type in initial metadata
  -- I think Mongo is the only driver where this is the case."
  [metadata :- ::metadata
   rf       :- ::qp.schema/rf]
  (qp.reducible/combine-additional-reducing-fns
   rf
   [(base-type-inferer metadata)]
   (fn combine [result base-types]
     (let [result-data-cols (when (map? result)
                              (-> result :data :cols))]
       (rf (cond-> result
             (and (seq result-data-cols)
                  ;; For pivot queries, when generating the row, column, or grand totals, the number of
                  ;; result-data-cols can be greater than the number of base-types.  In these cases, the
                  ;; result-data-cols already have the correct type, so no enrichment is necessary.
                  ;; For native queries where this correction is needed, the number and position of the columns and
                  ;; the base-types should match. (#64124)
                  (= (count result-data-cols) (count base-types)))
             (assoc-in [:data :cols] (mapv enrich-with-inferred-type result-data-cols base-types))))))))

(mu/defn- add-column-info-with-type-inference :- ::qp.schema/rf
  [query            :- ::lib.schema/query
   rff              :- ::qp.schema/rff
   initial-metadata :- ::metadata]
  (let [metadata' (update initial-metadata :cols #(expected-cols query %))]
    (qp.debug/debug> (list `add-column-info query initial-metadata '=> metadata'))
    (infer-base-type-xform metadata' (rff metadata'))))

;;;;
;;;; MIDDLEWARE
;;;;

(mu/defn- needs-type-inference?
  [query                                       :- ::lib.schema/query
   {initial-cols :cols, :as _initial-metadata} :- ::metadata]
  (and (= (:lib/type (lib/query-stage query 0)) :mbql.stage/native)
       (or (empty? initial-cols)
           (every? (fn [col]
                     (let [base-type ((some-fn :base-type :base_type) col)]
                       (or (nil? base-type)
                           (= base-type :type/*))))
                   initial-cols))))

(mu/defn add-column-info :- ::qp.schema/rff
  "Middleware for adding type information about the columns in the query results (the `:cols` key)."
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (mu/fn :- ::qp.schema/rf
    [initial-metadata :- ::metadata]
    (let [f (if (needs-type-inference? query initial-metadata)
              add-column-info-with-type-inference
              add-column-info-no-type-inference)]
      (f query rff initial-metadata))))

;;;;
;;;; NONSENSE
;;;;

;;; These are only for convenience for drivers that used to use stuff in annotate directly -- we can remove it once we
;;; convert drivers to MLv2
(p/import-vars
 [metabase.query-processor.middleware.annotate.legacy-helper-fns
  aggregation-name
  merged-column-info])
