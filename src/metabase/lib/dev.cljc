(ns metabase.lib.dev
  "Conveniences for usage in REPL and tests. Things in this namespace are not meant for normal usage in the FE client or
  in QB code."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn field :- fn?
  "Returns a function that can get resolved to an actual `:field` clause later."
  ([id-or-name :- [:or
                   ::lib.schema.id/field
                   ::lib.schema.common/non-blank-string]]
   (if (integer? id-or-name)
     (let [id id-or-name]
       (fn [query _stage-number]
         (lib.ref/ref (lib.metadata/field query id))))
     (let [column-name id-or-name]
       (fn [query stage-number]
         (lib.ref/ref (lib.metadata/stage-column query stage-number column-name))))))

  ([table-name :- ::lib.schema.common/non-blank-string
    field-name :- ::lib.schema.common/non-blank-string]
   (field nil table-name field-name))

  ([schema     :- [:maybe ::lib.schema.common/non-blank-string]
    table-name :- ::lib.schema.common/non-blank-string
    field-name :- ::lib.schema.common/non-blank-string]
   (fn [query _stage-number]
     (lib.ref/ref (lib.metadata/field query schema table-name field-name)))))

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
  [id :- ::lib.schema.id/table]
  (fn [query _stage-number]
    (lib.metadata/table query id)))

(mu/defn expression-ref :- fn?
  "Returns a function that can be resolved into an expression reference for the expression with name `expr-name`.
  Throws an exception if there is no expression with that name can be found."
  [expr-name :- :string]
  (fn [query stage-number]
    (if (contains? (:expressions (lib.util/query-stage query stage-number)) expr-name)
      (lib.options/ensure-uuid [:expression {} expr-name])
      (throw (ex-info (str "Undefined expression " expr-name)
                      {:expression-name expr-name
                       :query query
                       :stage-number stage-number})))))
