(ns metabase.lib.breakout
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join :as-alias lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.ident :as lib.metadata.ident]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/describe-top-level-key-method :breakout
  [query stage-number _k]
  (when-let [breakouts (not-empty (:breakout (lib.util/query-stage query stage-number)))]
    (i18n/tru "Grouped by {0}"
              (str/join (str \space (i18n/tru "and") \space)
                        (for [breakout breakouts]
                          (lib.metadata.calculation/display-name query stage-number breakout :long))))))

(mu/defn breakouts :- [:maybe [:sequential ::lib.schema.expression/expression]]
  "Return the current breakouts"
  ([query]
   (breakouts query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (:breakout (lib.util/query-stage query stage-number)))))

(mu/defn- metadata-for-breakout
  "Generates the metadata for the given breakout *a priori*, without reference to the reified columns.

  Should only be necessary to call on new breakouts. Otherwise they should be looked up in the reified column maps."
  [query stage-number breakout-clause]
  ;; TODO: Make sure the default `metadata-method` is including the `:ident` for breakouts!
  (-> (lib.metadata.calculation/metadata query stage-number breakout-clause)
      (assoc :lib/source :source/breakouts)))

(mu/defn breakouts-metadata :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Get metadata about the breakouts in a given stage of a `query`.

  Uses the reified column maps if present (and they should be)."
  ([query]
   (breakouts-metadata query -1))
  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (some->> (breakouts query stage-number)
            (mapv (fn [field-ref]
                    (or (when-let [ident (lib.options/ident field-ref)]
                          (or (lib.metadata.ident/lookup-column-of-type query stage-number :lib.columns/breakouts ident)
                              (log/warnf "Breakout metadata not found for ident '%s'" ident)))
                        (metadata-for-breakout query stage-number field-ref)))))))

;; TODO: This can be made smarter once we trust that an existing cache is still valid!
;; To keep the scope of the refs overhaul down I'm not relying on them.
(mu/defn- populate-breakout-metadata
  "Generate the complete map of `:ident` to breakout metadata, and save it on the query.

  No caching or shortcuts - this regenerates them from scratch for all the breakouts on this stage."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (->> (breakouts query stage-number)
       (map-indexed
        (fn [i break]
          (-> (metadata-for-breakout query stage-number break)
              (assoc :position i))))
       (m/index-by :ident)
       (lib.util/update-query-stage query stage-number assoc :lib.columns/breakouts)))

(mu/defn breakout-clause? :- :boolean
  "Returns true if `x` is a well-formed breakout clause."
  [x]
  (boolean (and (vector? x)
                (keyword? (first x))
                (lib.options/ident x))))

(mu/defn breakout-clause :- ::lib.schema/breakout
  "Wraps a breakoutable expression (usually a `:metadata/column` or a ref) into a breakout clause.

  (Currently, breakout clauses are represented as refs with a randomly generated `:ident` option.)

  If given a breakout clause, just returns it."
  [expr :- some?]
  (if (breakout-clause? expr)
    expr
    (-> expr
        lib.ref/ref
        (lib.options/update-options assoc :ident (u/generate-nano-id)))))

(mu/defn breakout :- ::lib.schema/query
  "Add a new breakout on an expression, presumably a Field reference. Ignores attempts to add a duplicate breakout."
  ([query expr]
   (breakout query -1 expr))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    expr         :- some?]
   (let [expr (breakout-clause expr)]
     (if-not (lib.schema.util/distinct-refs? (map lib.ref/ref (cons expr (breakouts query stage-number))))
       query
       (-> query
           (lib.util/add-summary-clause stage-number :breakout expr)
           (populate-breakout-metadata stage-number))))))

(mu/defn breakoutable-columns :- [:sequential ::lib.schema.metadata/column]
  "Get column metadata for all the columns that can be broken out by in
  the stage number `stage-number` of the query `query`
  If `stage-number` is omitted, the last stage is used.
  The rules for determining which columns can be broken out by are as follows:

  1. custom `:expressions` in this stage of the query

  2. Fields 'exported' by the previous stage of the query, if there is one;
     otherwise Fields from the current `:source-table`

  3. Fields exported by explicit joins

  4. Fields in Tables that are implicitly joinable."

  ([query :- ::lib.schema/query]
   (breakoutable-columns query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (let [columns (let [stage   (lib.util/query-stage query stage-number)
                       options {:include-implicitly-joinable-for-source-card? false}]
                   (lib.metadata.calculation/visible-columns query stage-number stage options))]
     (when (seq columns)
       (let [existing-breakouts         (breakouts query stage-number)
             column->breakout-positions (group-by
                                         (fn [position]
                                           (lib.equality/find-matching-column query
                                                                              stage-number
                                                                              (get existing-breakouts position)
                                                                              columns
                                                                              {:generous? true}))
                                         (range (count existing-breakouts)))]
         (mapv #(let [positions  (column->breakout-positions %)]
                  (cond-> (assoc % :lib/hide-bin-bucket? true)
                    positions (assoc :breakout-positions positions)))
               columns))))))

(mu/defn existing-breakouts :- [:maybe [:sequential {:min 1} ::lib.schema.ref/ref]]
  "Returns existing breakouts (as MBQL expressions) for `column` in a stage if there are any. Returns `nil` if there
  are no existing breakouts."
  ([query stage-number column]
   (existing-breakouts query stage-number column nil))

  ([query                                         :- ::lib.schema/query
    stage-number                                  :- :int
    column                                        :- ::lib.schema.metadata/column
    {:keys [same-binning-strategy?
            same-temporal-bucket?], :as _options} :- [:maybe
                                                      [:map
                                                       [:same-binning-strategy? {:optional true} [:maybe :boolean]]
                                                       [:same-temporal-bucket? {:optional true} [:maybe :boolean]]]]]
   (not-empty
    (into []
          (filter (fn [[_ref {:keys [join-alias source-field]} _id-or-name :as a-breakout]]
                    (and (lib.equality/find-matching-column query stage-number a-breakout [column] {:generous? true})
                         (= source-field (:fk-field-id column)) ; Must match, including both being nil/missing.
                         (= join-alias   (::lib.join/join-alias column))  ; Must match, including both being nil/missing.
                         (or (not same-temporal-bucket?)
                             (= (lib.temporal-bucket/temporal-bucket a-breakout)
                                (lib.temporal-bucket/temporal-bucket column)))
                         (or (not same-binning-strategy?)
                             (lib.binning/binning= (lib.binning/binning a-breakout)
                                                   (lib.binning/binning column))))))
          (breakouts query stage-number)))))

(defn breakout-column?
  "Returns if `column` is a breakout column of stage with `stage-number` of `query`."
  ([query stage-number column]
   (breakout-column? query stage-number column nil))
  ([query stage-number column opts]
   (seq (existing-breakouts query stage-number column opts))))

(mu/defn remove-existing-breakouts-for-column :- ::lib.schema/query
  "Remove all existing breakouts against `column` if there are any in the stage in question. Disregards temporal
  bucketing and binning."
  ([query column]
   (remove-existing-breakouts-for-column query -1 column))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    column       :- ::lib.schema.metadata/column]
   (reduce
    (fn [query a-breakout]
      (lib.remove-replace/remove-clause query stage-number a-breakout))
    query
    (existing-breakouts query stage-number column))))

(mu/defn breakout-column :- ::lib.schema.metadata/column
  "Returns the input column used for this breakout."
  ([query        :- ::lib.schema/query
    breakout-ref  :- ::lib.schema.ref/ref]
   (breakout-column query -1 breakout-ref))
  ([query       :- ::lib.schema/query
    stage-number :- :int
    breakout-ref :- ::lib.schema.ref/ref]
   (when-let [column (lib.equality/find-matching-column breakout-ref
                                                        (breakoutable-columns query stage-number)
                                                        {:generous? true})]
     (let [binning (lib.binning/binning breakout-ref)
           bucket  (lib.temporal-bucket/temporal-bucket breakout-ref)]
       (cond-> column
         binning (lib.binning/with-binning binning)
         bucket  (lib.temporal-bucket/with-temporal-bucket bucket))))))

(mu/defn remove-all-breakouts :- ::lib.schema/query
  "Remove all breakouts from a query stage."
  ([query]
   (remove-all-breakouts query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (reduce
    (fn [query a-breakout]
      (lib.remove-replace/remove-clause query stage-number a-breakout))
    query
    (breakouts query stage-number))))
