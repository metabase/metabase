(ns metabase.lib.dev
  "Conveniences for usage in REPL and tests. Things in this namespace are not meant for normal usage in the FE client or
  in QB code."
  (:require
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
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
  ([database-metadata-provider :- lib.metadata/DatabaseMetadataProvider
    table-name                 :- ::lib.schema.common/non-blank-string]
   (query-for-table-name database-metadata-provider nil table-name))

  ([database-metadata-provider :- lib.metadata/DatabaseMetadataProvider
    schema-name                :- [:maybe ::lib.schema.common/non-blank-string]
    table-name                 :- ::lib.schema.common/non-blank-string]
   (let [table-metadata (lib.metadata/table database-metadata-provider schema-name table-name)]
     (lib.query/query database-metadata-provider table-metadata))))

(mu/defn ->= :- fn?
  "Return function creating an `=` filter clause."
  [x y]
  (fn [query stage-number]
    (lib.filter/= query stage-number x y)))
