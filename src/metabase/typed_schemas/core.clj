(ns metabase.typed-schemas.core
  "Typed schemas: TypeScript modules that describe questions, models (with
  executable actions), tables and metrics to coding agents. Runtime objects
  feed the Lib.createTestQuery DSL; `//` comments carry context for humans and
  agents.

  The public surface is deliberately small — the schema value and its
  rendering, mirroring the module's data/print split:

    (-> options build-semantic-schema render-typescript) ; options -> TS string

  These public functions are compositions of the internal pipeline stages;
  their definitions below show the whole pipeline. Fetching filters by what
  the current user can read, so callers outside a request must bind a
  current-user context first.

  Keep the separation when extending this module:

  - New data reads go through [[metabase.typed-schemas.source/SchemaSource]] —
    a protocol method plus its `app-db-source` implementation — never direct
    `t2` calls from the pipeline stages.
  - Everything downstream of fetched items stays pure. Timestamps, site URL,
    and any other environment values enter through the `info` argument, not by
    calling out from assembly or rendering code.
  - Which keys render as runtime data vs comments is policy in
    `metabase.typed-schemas.render`; TypeScript syntax lives only in the
    `metabase.typed-schemas.javascript` printer.
  - REST query-parameter strings are decoded once, in
    `metabase.typed-schemas-rest.api.query-params`; this module only ever sees
    typed [[SemanticSchemaOptions]].
  - New exports here are compatibility promises, and they need not map 1:1 to
    internal functions — expose what consumers need, keep the stages internal."
  (:require
   [metabase.typed-schemas.build :as build]
   [metabase.typed-schemas.javascript :as javascript]
   [metabase.typed-schemas.render :as render]))

(set! *warn-on-reflection* true)

(def SemanticSchemaOptions
  "Schema generation options accepted by [[build-semantic-schema]]."
  build/SemanticSchemaOptions)

(defn build-semantic-schema
  "Builds a semantic schema value from [[SemanticSchemaOptions]].

  `info` optionally pins `:generated-at` and `:instance-url` for deterministic
  output; they default to the current time and the configured site URL."
  ([options]
   (build-semantic-schema options nil))
  ([options info]
   (-> options
       build/fetch-items             ; all data access, returns items
       (build/create-schema info)))) ; pure assembly into the schema value

(defn render-typescript
  "Renders a semantic schema value as an ES module of `as const` TypeScript
  constants."
  [schema]
  (-> schema
      render/schema->ast     ; pure render policy, returns a TypeScript AST
      javascript/render-js)) ; pure, option-free printer
