(ns metabase.lib.breakout
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
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
    expr         :- [:or ::lib.schema.expression/expression fn?]]
   (let [expr (if (fn? expr)
                (expr query stage-number)
                expr)]
     (lib.util/update-query-stage query stage-number update :breakout (fn [breakouts]
                                                                        (conj (vec breakouts) expr))))))

(mu/defn current-breakouts :- [:maybe [:sequential ::lib.schema.expression/expression]]
  "Return the current breakouts"
  ([query]
   (current-breakouts query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (:breakout (lib.util/query-stage query stage-number)))))

(mu/defn breakouts :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Get metadata about the breakouts in a given stage of a `query`."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (some->> (not-empty (:breakout (lib.util/query-stage query stage-number)))
           (mapv (fn [field-ref]
                   (-> (lib.metadata.calculation/metadata query stage-number field-ref)
                       (assoc :lib/source :source/breakouts))))))
