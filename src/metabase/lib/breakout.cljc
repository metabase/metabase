(ns metabase.lib.breakout
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.columns :as lib.schema.columns]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
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
  ;; XXX: I don't think this is actually what we want to be returning here. It includes a lot of pieces from the input
  ;; column that I don't think should be part of the breakout. I think the breakout column should be minimal and link
  ;; back to the original column...
  (-> (lib.metadata.calculation/metadata query stage-number breakout-clause)
      (assoc :lib/source :source/breakouts
             :ident      (lib.options/ident breakout-clause))))

(mu/defn breakouts-metadata :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Get metadata about the breakouts in a given stage of a `query`.

  Uses the reified column maps if present (and they should be)."
  ([query]
   (breakouts-metadata query -1))
  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (some->> (breakouts query stage-number)
            (mapv (fn [field-ref]
                    (metadata-for-breakout query stage-number field-ref)
                    ;; TODO: Dynamic variables only present during returned-columns-method mean that we can't really
                    ;; cache the columns! (At least, not before we have new refs end to end.)
                    ;; So we always recompute the metadata for the breakouts for now.
                    #_(or (when-let [ident (lib.options/ident field-ref)]
                            (or (lib.metadata.ident/lookup-column-of-type query stage-number :lib.columns/breakout ident)
                                (log/warnf "Breakout metadata not found for ident '%s'\n%s"
                                           ident (-> query
                                                     :stages
                                                     (nth stage-number)
                                                     :lib.columns/breakout
                                                     u/pprint-to-str))))
                          (metadata-for-breakout query stage-number field-ref)))))))

(mu/defn breakout-columns-map :- ::lib.schema.columns/columns-map
  "Generate the complete map of `:ident` to breakout metadata for the given `query` and `stage-number`."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (->> (breakouts query stage-number)
       (map-indexed
        (fn [i break]
          (-> (metadata-for-breakout query stage-number break)
              (assoc :position i))))
       (m/index-by :ident)))

;; TODO: This can be made smarter once we trust that an existing cache is still valid!
;; To keep the scope of the refs overhaul down I'm not relying on them.
(mu/defn- populate-breakout-metadata
  "Generate the complete map of `:ident` to breakout metadata, and save it on the query.

  No caching or shortcuts - this regenerates them from scratch for all the breakouts on this stage."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (->> (breakout-columns-map query stage-number)
       (lib.util/update-query-stage query stage-number assoc :lib.columns/breakout)))

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
