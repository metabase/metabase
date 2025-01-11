(ns metabase.lib.breakout.metadata
  (:require
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join :as-alias lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

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
       (let [existing-breakouts         (lib.breakout/breakouts query stage-number)
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
          (lib.breakout/breakouts query stage-number)))))

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
    (lib.breakout/breakouts query stage-number))))
