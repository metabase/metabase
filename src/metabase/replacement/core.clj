(ns metabase.replacement.core
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.replacement.compatibility :as replacement.compatibility]
   [metabase.replacement.mbql :as replacement.mbql]
   [metabase.replacement.native :as replacement.native]
   [metabase.replacement.schema :as replacement.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn check-column-mappings :- [:sequential ::replacement.schema/column-mapping]
  "Build column mappings between source and target columns."
  [metadata-providerable :- ::lib.metadata.protocols/metadata-providerable
   old-source            :- ::replacement.schema/source
   new-source            :- ::replacement.schema/source]
  (replacement.compatibility/check-column-mappings metadata-providerable old-source new-source))

(mu/defn upgrade-field-ref :- ::lib.schema.ref/ref
  "Generate a new ref for a column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- :mbql.clause/field]
  (if (lib/native-only-query? query)
    field-ref
    (replacement.mbql/upgrade-field-ref query stage-number field-ref)))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query :- ::lib.schema/query]
  (cond-> query
    (not (lib/native-only-query? query))
    replacement.mbql/upgrade-field-refs-in-mbql-stages))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (if (lib/native-only-query? query)
    target
    (replacement.mbql/upgrade-field-ref-in-parameter-mbql-target query target)))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::replacement.schema/source
   new-source :- ::replacement.schema/source]
  (cond-> query
    (lib/any-native-stage? query)
    (replacement.native/swap-source-in-native-stages old-source new-source)

    (not (lib/native-only-query? query))
    (replacement.mbql/swap-source-in-mbql-stages old-source new-source)))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [query      :- ::lib.schema/query
   target     :- ::lib.schema.parameter/target
   old-source :- ::replacement.schema/source
   new-source :- ::replacement.schema/source]
  (if (lib/native-only-query? query)
    target
    (replacement.mbql/swap-source-in-parameter-mbql-target query target old-source new-source)))
