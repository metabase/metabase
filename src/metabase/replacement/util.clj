(ns metabase.replacement.util
  (:require
   [metabase.lib.card :as lib.card]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.replacement.schema :as replacement.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn column-match-key :- :string
  "Gets the column match key from a column. This is used to match columns by name or alias."
  [column :- ::lib.schema.metadata/lib-or-legacy-column]
  (or (:lib/desired-column-alias column) (:name column)))

(mu/defn source-columns :- [:sequential ::lib.schema.metadata/column]
  "Get columns for a source. For cards, filters out remapped columns."
  [metadata-providerable   :- ::lib.metadata.protocols/metadata-providerable
   [source-type source-id] :- ::replacement.schema/source]
  (case source-type
    :table (lib.metadata/fields metadata-providerable source-id)
    :card  (into [] (remove :remapped-from) (lib.card/saved-question-metadata metadata-providerable source-id))))

(mu/defn valid-query? :- :boolean
  "Returns true if `maybe-query` has at least one stage.

  This is used to skip fully broken queries in the app db."
  [maybe-query :- [:maybe [:or ::lib.schema/query [:map {:closed true}]]]]
  (some? (seq (:stages maybe-query))))
