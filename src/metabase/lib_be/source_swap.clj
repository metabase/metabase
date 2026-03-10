(ns metabase.lib-be.source-swap
  (:require
   [medley.core :as m]
   [metabase.lib-be.schema.source-swap :as lib-be.schema.source-swap]
   [metabase.lib-be.source-swap.mbql :as lib-be.source-swap.mbql]
   [metabase.lib-be.source-swap.native :as lib-be.source-swap.native]
   [metabase.lib-be.source-swap.util :as lib-be.source-swap.util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(mu/defn check-column-mappings :- [:sequential ::lib-be.schema.source-swap/column-mapping]
  "Build column mappings between source and target columns."
  [metadata-providerable             :- ::lib.metadata.protocols/metadata-providerable
   [old-source-type, :as old-source] :- ::lib-be.schema.source-swap/source
   [new-source-type, :as new-source] :- ::lib-be.schema.source-swap/source]
  (let [old-columns (lib-be.source-swap.util/source-columns metadata-providerable old-source)
        new-columns (lib-be.source-swap.util/source-columns metadata-providerable new-source)
        old-by-name (m/index-by lib-be.source-swap.util/column-match-key old-columns)
        new-by-name (m/index-by lib-be.source-swap.util/column-match-key new-columns)
        all-names   (distinct (concat (map lib-be.source-swap.util/column-match-key old-columns)
                                      (map lib-be.source-swap.util/column-match-key new-columns)))]
    (perf/mapv (fn [column-name]
                 (let [old-column (get old-by-name column-name)
                       new-column (get new-by-name column-name)
                       errors     (when (and old-column new-column)
                                    (perf/not-empty (lib-be.source-swap.util/column-errors old-column new-column old-source-type new-source-type)))]
                   (cond-> {}
                     old-column (assoc :source old-column)
                     new-column (assoc :target new-column)
                     errors     (assoc :errors errors))))
               all-names)))

(mu/defn upgrade-field-ref :- ::lib.schema.ref/ref
  "Generate a new ref for a column. Delegates to mbql module."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (if (lib/native-only-query? query)
    field-ref
    (lib-be.source-swap.mbql/upgrade-field-ref query stage-number field-ref)))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query :- ::lib.schema/query]
  (cond-> query
    (not (lib/native-only-query? query))
    lib-be.source-swap.mbql/upgrade-field-refs-in-mbql-stages))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (if (lib/native-only-query? query)
    target
    (lib-be.source-swap.mbql/upgrade-field-ref-in-parameter-mbql-target query target)))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::lib-be.schema.source-swap/source
   new-source :- ::lib-be.schema.source-swap/source]
  (cond-> query
    (lib/any-native-stage? query)
    (lib-be.source-swap.native/swap-source-in-native-stages old-source new-source)

    (not (lib/native-only-query? query))
    (lib-be.source-swap.mbql/swap-source-in-mbql-stages {old-source new-source})))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [query      :- ::lib.schema/query
   target     :- ::lib.schema.parameter/target
   old-source :- ::lib-be.schema.source-swap/source
   new-source :- ::lib-be.schema.source-swap/source]
  (if (lib/native-only-query? query)
    target
    (lib-be.source-swap.mbql/swap-source-in-parameter-mbql-target query target {old-source new-source})))
