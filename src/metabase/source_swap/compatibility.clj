(ns metabase.source-swap.compatibility
  (:require
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.source-swap.schema :as source-swap.schema]
   [metabase.source-swap.util :as source-swap.util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(mu/defn column-errors :- [:sequential ::source-swap.schema/column-error]
  "Checks for column type mismatches, missing primary keys, extra primary keys, missing foreign keys, and foreign key mismatches."
  [old-column :- ::lib.schema.metadata/column
   new-column :- ::lib.schema.metadata/column
   old-source-type :- ::source-swap.schema/source-type
   new-source-type :- ::source-swap.schema/source-type]
  (cond-> []
    (not= (:effective-type old-column) (:effective-type new-column))
    (conj :column-type-mismatch)

    (and (= old-source-type :table)
         (= new-source-type :table)
         (lib.types.isa/primary-key? old-column)
         (not (lib.types.isa/primary-key? new-column)))
    (conj :missing-primary-key)

    (and (lib.types.isa/foreign-key? old-column)
         (not (lib.types.isa/foreign-key? new-column)))
    (conj :missing-foreign-key)

    (and (lib.types.isa/foreign-key? old-column)
         (lib.types.isa/foreign-key? new-column)
         (not= (:fk-target-field-id old-column) (:fk-target-field-id new-column)))
    (conj :foreign-key-mismatch)))

(mu/defn check-column-mappings :- [:sequential ::source-swap.schema/column-mapping]
  "Build column mappings between source and target columns."
  [metadata-providerable             :- ::lib.metadata.protocols/metadata-providerable
   [old-source-type, :as old-source] :- ::source-swap.schema/source
   [new-source-type, :as new-source] :- ::source-swap.schema/source]
  (let [old-columns (source-swap.util/source-columns metadata-providerable old-source)
        new-columns (source-swap.util/source-columns metadata-providerable new-source)
        old-by-name (m/index-by source-swap.util/column-match-key old-columns)
        new-by-name (m/index-by source-swap.util/column-match-key new-columns)
        all-names   (distinct (concat (map source-swap.util/column-match-key old-columns)
                                      (map source-swap.util/column-match-key new-columns)))]
    (perf/mapv (fn [column-name]
                 (let [old-column (get old-by-name column-name)
                       new-column (get new-by-name column-name)
                       errors     (when (and old-column new-column)
                                    (perf/not-empty (column-errors old-column new-column old-source-type new-source-type)))]
                   (cond-> {}
                     old-column (assoc :source old-column)
                     new-column (assoc :target new-column)
                     errors     (assoc :errors errors))))
               all-names)))
