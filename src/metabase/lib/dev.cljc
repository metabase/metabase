(ns metabase.lib.dev
  "Conveniences for usage in REPL and tests. Things in this namespace are not meant for normal usage in the FE client or
  in QB code."
  (:require
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]))

(mu/defn field :- fn?
  "Returns a function that can get resolved to an actual `:field` clause later."
  ([id-or-name :- [:or
                   ::lib.schema.id/field
                   ::lib.schema.common/non-blank-string]]
   (if (integer? id-or-name)
     (let [id id-or-name]
       (fn [query stage-number]
         (->> (lib.metadata/field query id)
              (lib.field/field query stage-number))))
     (let [column-name id-or-name]
       (fn [query stage-number]
         (->> (lib.metadata/stage-column query stage-number column-name)
              (lib.field/field query stage-number))))))

  ([table-name :- ::lib.schema.common/non-blank-string
    field-name :- ::lib.schema.common/non-blank-string]
   (field nil table-name field-name))

  ([schema     :- [:maybe ::lib.schema.common/non-blank-string]
    table-name :- ::lib.schema.common/non-blank-string
    field-name :- ::lib.schema.common/non-blank-string]
   (fn [query stage-number]
     (->> (lib.metadata/field query schema table-name field-name)
          (lib.field/field query stage-number)))))

(mu/defn query-for-table-name :- ::lib.schema/query
  "Create a new query for a specific Table with a table name."
  ([metadata-provider :- lib.metadata/MetadataProvider
    table-name        :- ::lib.schema.common/non-blank-string]
   (query-for-table-name metadata-provider nil table-name))

  ([metadata-provider :- lib.metadata/MetadataProvider
    schema-name       :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string]
   (let [table-metadata (lib.metadata/table metadata-provider schema-name table-name)]
     (lib.query/query metadata-provider table-metadata))))

(mu/defn query-for-table-id :- ::lib.schema/query
  "Create a new query for a specific Table with `table-id`."
  [metadata-provider :- lib.metadata/MetadataProvider
   table-id          :- ::lib.schema.id/table]
  (let [table-metadata (lib.metadata/table metadata-provider table-id)]
    (lib.query/query metadata-provider table-metadata)))

(mu/defn table :- fn?
  "Returns a function that can be resolved to Table metadata. For use with a [[lib/join]] or something like that."
  ([id :- ::lib.schema.id/table]
   (fn [query _stage-number]
     (lib.metadata/table query id))))
