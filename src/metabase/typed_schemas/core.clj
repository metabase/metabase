(ns metabase.typed-schemas.core
  "Typed schemas: TypeScript modules that describe questions, models (with
  executable actions), tables and metrics to coding agents. Runtime objects
  feed the Lib.createTestQuery DSL; `//` comments carry context for humans and
  agents.

  The public surface is deliberately small — the schema value and its
  rendering, mirroring the module's data/print split:

    (-> options build-semantic-schema render-typescript) ; options -> TS string

  [[build-semantic-schema]] takes [[SemanticSchemaOptions]] (and an optional
  `info` map pinning `:generated-at`/`:instance-url` for deterministic
  output) and returns the semantic schema value; [[render-typescript]] prints
  it. Fetching filters by what the current user can read, so callers outside a
  request must bind a current-user context first.

  Internally this is a pipeline of one impure fetch stage followed by pure
  data -> data stages (see [[metabase.typed-schemas.pipeline]]):

    (-> options
        fetch-items          ; all data access, returns Items
        (create-schema info) ; pure assembly into a semantic schema value
        schema->ast          ; pure render policy, returns a TypeScript AST
        render-js)           ; pure, option-free printer

  Keep the separation when extending this module:

  - New data reads go through [[metabase.typed-schemas.source/SchemaSource]] —
    a protocol method plus its `app-db-source` implementation — never direct
    `t2` calls from the pipeline stages.
  - Everything downstream of Items stays pure. Timestamps, site URL, and any
    other environment values enter through the `info` argument, not by calling
    out from assembly or rendering code.
  - Which keys render as runtime data vs comments is policy in
    `metabase.typed-schemas.render`; TypeScript syntax lives only in the
    `metabase.typed-schemas.javascript` printer.
  - REST query-parameter strings are decoded once, in
    `metabase.typed-schemas-rest.api.query-params`; this module only ever sees
    typed [[SemanticSchemaOptions]].
  - New exports here are compatibility promises — pipeline internals stay in
    their own namespaces unless another module genuinely needs them."
  (:require
   [metabase.typed-schemas.pipeline]
   [metabase.typed-schemas.render]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [metabase.typed-schemas.pipeline
  SemanticSchemaOptions
  build-semantic-schema]
 [metabase.typed-schemas.render
  render-typescript])
