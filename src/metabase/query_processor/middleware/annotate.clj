(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query, under the `:cols` column.

  TODO -- we should move most of this into a lib namespace -- Cam"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analyze.core :as analyze]
   [metabase.driver.common :as driver.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.debug :as qp.debug]
   [metabase.query-processor.middleware.annotate.legacy-helper-fns]
   [metabase.query-processor.middleware.annotate.legacy-impl :as annotate.legacy]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(comment metabase.query-processor.middleware.annotate.legacy-helper-fns/keep-me)

(mr/def ::col
  [:map
   [:source    {:optional true} ::lib.metadata.result-metadata/legacy-source]
   [:field_ref {:optional true} ::lib.metadata.result-metadata/super-broken-legacy-field-ref]])

(mr/def ::snake_cased-col
  [:and
   ::col
   [:fn
    {:error/message "column with all snake-cased keys"}
    (fn [m]
      (every? (fn [k]
                (not (str/includes? k "-")))
              (keys m)))]])

(mr/def ::cols
  [:maybe [:sequential ::col]])

(mr/def ::metadata
  [:map
   [:cols {:optional true} ::cols]])

;;; TODO (Cam 6/18/25) -- only convert unnamespaced keys to snake case; other keys such as `lib/` keys should stay in
;;; kebab-case. No point in converting them back and forth a hundred times, and it's not like JS can use namespaced keys
;;; directly without bracket notation anyway (actually ideally the FE wouldn't even be using result metadata directly --
;;; right?)
(defn- ->snake_case [col]
  (as-> col col
    (update-keys col u/->snake_case_en)
    (m/update-existing col :binning_info update-keys u/->snake_case_en)))

(mu/defn expected-cols :- [:sequential ::snake_cased-col]
  "Return metadata for columns returned by a pMBQL `query`.

  `initial-cols` are (optionally) the initial minimal metadata columns as returned by the driver (usually just column
  name and base type). If provided these are merged with the columns the query is expected to return.

  Note this `initial-cols` is more or less required for native queries unless they have metadata attached."
  ([query]
   (expected-cols query []))

  ([query         :- ::lib.schema/query
    initial-cols  :- ::cols]
   (for [col (lib.metadata.result-metadata/returned-columns query initial-cols)]
     (-> col
         (dissoc :lib/type)
         ->snake_case))))

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
     (let [cols' (mapv (fn [col base-type]
                         (assoc col
                                :base_type      base-type
                                :effective_type base-type
                                :field_ref      [:field (:name col) {:base-type base-type}]))
                       (:cols metadata)
                       base-types)]
       (rf (cond-> result
             (map? result)
             (assoc-in [:data :cols] cols')))))))

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
  (and (= (:lib/type (lib.util/query-stage query 0)) :mbql.stage/native)
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
    (let [f               (if (needs-type-inference? query initial-metadata)
                            add-column-info-with-type-inference
                            add-column-info-no-type-inference)
          metadata        (f query rff initial-metadata)
          legacy-metadata (qp.store/with-metadata-provider (lib.metadata/->metadata-provider query)
                            (annotate.legacy/update-metadata
                             (lib.convert/->legacy-MBQL query)
                             initial-metadata))]
      (if-not (= (count (:cols metadata)) (count (:cols legacy-metadata)))
        metadata
        (update metadata :cols (fn [cols]
                                 (mapv (fn [col legacy-col]
                                         (merge
                                          col
                                          (u/select-non-nil-keys legacy-col [:display_name])))
                                       cols
                                       (:cols legacy-metadata))))))))

;;;;
;;;; NONSENSE
;;;;

;;; These are only for convenience for drivers that used to use stuff in annotate directly -- we can remove it once we
;;; convert drivers to MLv2
(p/import-vars
 [metabase.query-processor.middleware.annotate.legacy-helper-fns
  aggregation-name
  merged-column-info])
