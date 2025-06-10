(ns metabase.query-processor.middleware.auto-parse-filter-values
  "Middleware that parses filter clause values that come in as strings (e.g. from the API) to the appropriate type. E.g.
  a String value in a filter clause against a `:type/Integer` Field should get parsed into an integer.

  Note that logic for automatically parsing temporal values lives in the `wrap-values-literals` middleware for
  historic reasons. When time permits it should be moved into this middleware since it's really a separate
  transformation from wrapping the value literals themselves."
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- floating-point-type?
  "Check if the effective type is a floating point type that might have precision issues."
  [effective-type]
  (and effective-type
       (or (isa? effective-type :type/Float)
           (isa? effective-type :type/Decimal))))

(defn- calculate-ulp-tolerance
  "Calculate ULP-based tolerance for robust floating point comparison.
  ULP automatically scales with value magnitude and doesn't break down near zero.

  Uses 4 ULPs by default."
  [value]
  (let [ulp-count 4 ; Allow up to 4 representable numbers between values
        ulp-value (Math/ulp (double value))]
    (* ulp-count ulp-value)))

(mu/defn- parse-value-for-base-type
  [v              :- :string
   effective-type :- ::lib.schema.common/base-type]
  {:pre [(string? v)]}
  (try
    (condp #(isa? %2 %1) effective-type
      :type/BigInteger (bigint v)
      :type/Integer    (Long/parseLong v)
      :type/Decimal    (bigdec v)
      :type/Float      (Double/parseDouble v)
      :type/Boolean    (Boolean/parseBoolean v)
      v)
    (catch Throwable e
      (throw (ex-info (tru "Error filtering against {0} Field: unable to parse String {1} to a {2}"
                           effective-type
                           (pr-str v)
                           effective-type)
                      {:type qp.error-type/invalid-query}
                      e)))))

;;; I guess we probably want this to work on join conditions as well as normal stage filters.
(defn- auto-parse-filter-values-this-stage-or-join
  [_query _path-type _path stage-or-join]
  (lib.util.match/replace stage-or-join
    [:value
     (info :guard (fn [{:keys [effective-type], :as _value-options}]
                    (and effective-type
                         (not (isa? effective-type :type/Text)))))
     (v :guard string?)]
    [:value info (parse-value-for-base-type v (:effective-type info))]))

(defn- is-filtering-aggregated-results?
  "Check if we're in a stage that filters results from a previous aggregation stage."
  [query stage-index]
  (and (number? stage-index)
       (> stage-index 0)
       (let [previous-stage (get-in query [:stages (dec stage-index)])]
         ;; Previous stage has aggregations:
         (seq (:aggregation previous-stage)))))

(defn- should-apply-ulp-filter?
  "Check if ULP-based filtering should be applied to this floating point value.
  Apply ULP filtering when filtering floating point results from aggregations."
  [effective-type value field-ref query stage-index]
  (and (floating-point-type? effective-type)
       (number? value)
       (or
         ;; Pattern 1: Multi-stage queries filtering aggregated results (real UI workflow)
        (is-filtering-aggregated-results? query stage-index)
         ;; Pattern 2: Direct aggregation references (programmatic/test usage)
        (and (vector? field-ref)
             (= :aggregation (first field-ref))))))

(defn- apply-floating-point-ulp-this-stage-or-join
  "Transform floating point equality filters to ULP-based range filters to handle
  precision issues."
  [query _path-type path stage-or-join]
  (let [stage-index (when (and (vector? path) (>= (count path) 2))
                      (second path))] ; Extract stage index from path
    (lib.util.match/replace stage-or-join
      ;; Transform:
      ;;   [:= opts field [:value {:effective-type :type/Float} value]]
      ;; to
      ;;   [:between opts field (value - ulp-tolerance) (value + ulp-tolerance)]
      [:= opts field-ref [:value info value]]
      (if (and (floating-point-type? (:effective-type info))
               (should-apply-ulp-filter? (:effective-type info) value field-ref query stage-index))
        (let [ulp-tolerance (calculate-ulp-tolerance value)
              lower-info (assoc info :lib/uuid (str (random-uuid)))
              upper-info (assoc info :lib/uuid (str (random-uuid)))]
          [:between opts field-ref
           [:value lower-info (- value ulp-tolerance)]
           [:value upper-info (+ value ulp-tolerance)]])
        [:= opts field-ref [:value info value]])

      ;; Transform:
      ;;   [:!= opts field [:value {:effective-type :type/Float} value]]
      ;; to
      ;;   [:or opts [:< field (value - ulp-tolerance)] [:> field (value + ulp-tolerance)]]
      [:!= opts field-ref [:value info value]]
      (if (and (floating-point-type? (:effective-type info))
               (should-apply-ulp-filter? (:effective-type info) value field-ref query stage-index))
        (let [ulp-tolerance (calculate-ulp-tolerance value)
              lower-info (assoc info :lib/uuid (str (random-uuid)))
              upper-info (assoc info :lib/uuid (str (random-uuid)))
              ;; Create new field references with unique UUIDs to avoid duplication
              field-ref-1 (if (map? (second field-ref))
                            (update field-ref 1 assoc :lib/uuid (str (random-uuid)))
                            field-ref)
              field-ref-2 (if (map? (second field-ref))
                            (update field-ref 1 assoc :lib/uuid (str (random-uuid)))
                            field-ref)
              ;; Create opts with UUIDs for sub-clauses
              less-opts {:lib/uuid (str (random-uuid))}
              greater-opts {:lib/uuid (str (random-uuid))}]
          [:or opts
           [:< less-opts field-ref-1 [:value lower-info (- value ulp-tolerance)]]
           [:> greater-opts field-ref-2 [:value upper-info (+ value ulp-tolerance)]]])
        [:!= opts field-ref [:value info value]]))))

(mu/defn auto-parse-filter-values :- ::lib.schema/query
  "Automatically parse String filter clause values to the appropriate type and apply
  ULP-based tolerance for floating point comparisons to handle precision issues."
  [query :- ::lib.schema/query]
  (-> query
      (lib.walk/walk auto-parse-filter-values-this-stage-or-join)
      (lib.walk/walk apply-floating-point-ulp-this-stage-or-join)))
