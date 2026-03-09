(ns metabase.lib-be.source-swap.util
  (:require
   [metabase.lib-be.schema.source-swap :as lib-be.schema.source-swap]
   [metabase.lib.card :as lib.card]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ column matching ---------------------------------------------------

(mu/defn column-match-key :- :string
  "Gets the column match key from a column. This is used to match columns by name or alias."
  [column :- ::lib.schema.metadata/column]
  (or (:lib/desired-column-alias column) (:name column)))

(mu/defn source-columns :- [:sequential ::lib.schema.metadata/column]
  "Get columns for a source. For cards, filters out remapped columns."
  [metadata-providerable   :- ::lib.metadata.protocols/metadata-providerable
   [source-type source-id] :- ::lib-be.schema.source-swap/source]
  (case source-type
    :table (lib.metadata/fields metadata-providerable source-id)
    :card  (into [] (remove :remapped-from) (lib.card/saved-question-metadata metadata-providerable source-id))))

(mu/defn column-errors :- [:sequential ::lib-be.schema.source-swap/column-error]
  "Checks for column type mismatches, missing primary keys, extra primary keys, missing foreign keys, and foreign key mismatches."
  [old-column :- ::lib.schema.metadata/column
   new-column :- ::lib.schema.metadata/column
   old-source-type :- ::lib-be.schema.source-swap/source-type
   new-source-type :- ::lib-be.schema.source-swap/source-type]
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
