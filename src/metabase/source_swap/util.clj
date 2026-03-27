(ns metabase.source-swap.util
  (:require
   [metabase.lib.card :as lib.card]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.source-swap.schema :as source-swap.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn column-match-key :- :string
  "Gets the column match key from a column. This is used to match columns by name or alias."
  [column :- ::lib.schema.metadata/column]
  (or (:lib/desired-column-alias column) (:name column)))

(mu/defn source-columns :- [:sequential ::lib.schema.metadata/column]
  "Get columns for a source. For cards, filters out remapped columns."
  [metadata-providerable   :- ::lib.metadata.protocols/metadata-providerable
   [source-type source-id] :- ::source-swap.schema/source]
  (case source-type
    :table (lib.metadata/fields metadata-providerable source-id)
    :card  (into [] (remove :remapped-from) (lib.card/saved-question-metadata metadata-providerable source-id))))
