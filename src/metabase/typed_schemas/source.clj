(ns metabase.typed-schemas.source
  "Data access for typed schemas, reified as a protocol.

  [[SchemaSource]] names every read that [[metabase.typed-schemas.core/fetch-items]]
  performs, so the module's data-access surface is one definition instead of
  selects scattered across namespaces. [[app-db-source]] is the production
  implementation, backed by the application database and filtered by what the
  current user can read.

  Tests reify the protocol with literal values instead of redefining selection
  functions:

    (reify source/SchemaSource
      (library-scope [_ _] {:metric-collection-ids #{20}})
      (metrics [_ _ _] [{:type \"metric\" :key \"revenue\" :id 1}])
      ...)

  All methods return the shaped schema entities produced by the
  `metabase.typed-schemas.schema.*` builders, except [[library-tables]], which
  returns raw table rows (only `:id` is consumed).

  When the pipeline needs to read something new, add a protocol method and its
  [[app-db-source]] implementation here — do not call `t2`/`metabot` directly
  from `metabase.typed-schemas.core` or anything downstream of it. That keeps
  the module's data-access surface enumerable and every downstream stage
  testable with literal values."
  (:require
   [metabase.typed-schemas.schema.metric :as schema.metric]
   [metabase.typed-schemas.schema.model :as schema.model]
   [metabase.typed-schemas.schema.question :as schema.question]
   [metabase.typed-schemas.schema.table :as schema.table]
   [metabase.typed-schemas.scope :as scope]))

(set! *warn-on-reflection* true)

(defprotocol SchemaSource
  "The data-access patterns behind typed schema generation.

  Scope-resolution methods return ids; entity methods return shaped schema
  entities. A nil `database-ids`/`collection-ids` argument means unscoped;
  an empty set matches nothing."
  (database-ids [source database-ref]
    "Readable database ids matching a database reference, or nil without one.")
  (collection-ids [source collection-refs]
    "Ids of the referenced collections and their descendants, or nil without refs.")
  (library-scope [source scope-options]
    "Resolved [[metabase.typed-schemas.scope/LibraryScope]] for library
    collection refs and include flags, or nil when none are requested.")
  (questions [source database-ids collection-ids]
    "Question schema entities.")
  (models [source database-ids]
    "Model schema entities that have executable actions.")
  (metrics [source database-ids collection-ids]
    "Metric schema entities.")
  (tables [source database-ids table-ids]
    "Table schema entities.")
  (library-tables [source library-scope]
    "Published table rows in the library scope's data collections."))

(def app-db-source
  "The production [[SchemaSource]], backed by the application database."
  (reify SchemaSource
    (database-ids [_ database-ref]
      (scope/database-ids-for-ref database-ref))
    (collection-ids [_ collection-refs]
      (scope/collection-scope collection-refs))
    (library-scope [_ scope-options]
      (scope/library-scope scope-options))
    (questions [_ database-ids collection-ids]
      (vec (schema.question/question-schemas database-ids collection-ids)))
    (models [_ database-ids]
      (vec (schema.model/model-schemas database-ids nil)))
    (metrics [_ database-ids collection-ids]
      (vec (schema.metric/metric-schemas database-ids collection-ids)))
    (tables [_ database-ids table-ids]
      (vec (schema.table/table-schemas (schema.table/select-tables database-ids table-ids))))
    (library-tables [_ library-scope]
      (vec (schema.table/select-library-tables library-scope)))))
