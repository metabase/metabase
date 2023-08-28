(ns metabase.lib.breakout
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/describe-top-level-key-method :breakout
  [query stage-number _k]
  (when-let [breakouts (not-empty (:breakout (lib.util/query-stage query stage-number)))]
    (i18n/tru "Grouped by {0}"
              (str/join (str \space (i18n/tru "and") \space)
                        (for [breakout breakouts]
                          (lib.metadata.calculation/display-name query stage-number breakout :long))))))

(mu/defn breakout :- ::lib.schema/query
  "Add a new breakout on an expression, presumably a Field reference."
  ([query expr]
   (breakout query -1 expr))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    expr         :- some?]
   (let [expr (lib.ref/ref (if (fn? expr)
                             (expr query stage-number)
                             expr))]
     (lib.util/add-summary-clause query stage-number :breakout expr))))

(mu/defn breakouts :- [:maybe [:sequential ::lib.schema.expression/expression]]
  "Return the current breakouts"
  ([query]
   (breakouts query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (:breakout (lib.util/query-stage query stage-number)))))

(mu/defn breakouts-metadata :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Get metadata about the breakouts in a given stage of a `query`."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (some->> (not-empty (:breakout (lib.util/query-stage query stage-number)))
           (mapv (fn [field-ref]
                   (-> (lib.metadata.calculation/metadata query stage-number field-ref)
                       (assoc :lib/source :source/breakouts))))))

(mu/defn breakoutable-columns :- [:sequential lib.metadata/ColumnMetadata]
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
   (let [cols                      (let [stage (lib.util/query-stage query stage-number)]
                                     (lib.metadata.calculation/visible-columns query stage-number stage))
         col-index->breakout-index (into {}
                                         (map-indexed
                                          (fn [breakout-index breakout-ref]
                                            (when-let [col-index (lib.equality/index-of-closest-matching-metadata breakout-ref cols)]
                                              [col-index breakout-index])))
                                         (breakouts query stage-number))]
     (when (seq cols)
       (mapv (fn [[i col]]
               (let [pos (col-index->breakout-index i)]
                 (cond-> col
                   pos (assoc :breakout-position pos))))
             (m/indexed cols))))))
