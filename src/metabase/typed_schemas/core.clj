(ns metabase.typed-schemas.core
  "Typed schemas: TypeScript modules that describe questions, models (with
  executable actions), tables and metrics to coding agents. Runtime objects
  feed the Lib.createTestQuery DSL; `//` comments carry context for humans and
  agents.

  The pipeline is one impure fetch stage followed by pure data -> data stages:

    (-> options
        fetch-items          ; all data access, returns [[Items]]
        (create-schema info) ; pure assembly into a semantic schema value
        schema->ast          ; pure render policy, returns a TypeScript AST
        render-js)           ; pure, option-free printer

  [[build-semantic-schema]] composes the first two stages and
  [[render-typescript]] the last two, so `(-> options build-semantic-schema
  render-typescript)` is the whole pipeline. Fetching filters by what the
  current user can read, so callers outside a request must bind a current-user
  context first.

  Keep the separation when extending this module:

  - New data reads go through [[metabase.typed-schemas.source/SchemaSource]] —
    a protocol method plus its `app-db-source` implementation — never direct
    `t2` calls from the pipeline stages.
  - Everything downstream of [[Items]] stays pure. Timestamps, site URL, and
    any other environment values enter through the `info` argument, not by
    calling out from assembly or rendering code.
  - Which keys render as runtime data vs comments is policy in
    `metabase.typed-schemas.render`; TypeScript syntax lives only in the
    `metabase.typed-schemas.javascript` printer.
  - REST query-parameter strings are decoded once, in
    `metabase.typed-schemas-rest.api.query-params`; this module only ever sees
    typed [[SemanticSchemaOptions]]."
  (:require
   [clojure.set :as set]
   [metabase.system.core :as system]
   [metabase.typed-schemas.common :as common]
   [metabase.typed-schemas.javascript]
   [metabase.typed-schemas.render]
   [metabase.typed-schemas.source :as source]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(p/import-vars
 [metabase.typed-schemas.javascript
  render-js]
 [metabase.typed-schemas.render
  render-typescript
  schema->ast])

(def ^:private DatabaseRef
  "References a database by id or name."
  [:or
   [:map [:id :int]]
   ; remote sync representations expose database names instead of numeric database ids
   [:map [:name ms/NonBlankString]]])

(def ^:private CollectionRef
  "References a collection by numeric or entity id."
  [:or
   [:map [:id :int]]
   [:map [:entity-id ms/NonBlankString]]])

(def SemanticSchemaOptions
  "Schema generation options accepted by [[fetch-items]]."
  [:map {:closed true}
   [:database {:optional true}
    [:maybe {:description (str "Scopes the schema to a database. "
                               "Accepts `{:id <database-id>}` or `{:name <database-name>}`.")}
     DatabaseRef]]
   [:library-collection-refs {:optional true}
    [:sequential {:description (str "Limits tables and metrics to library collections. "
                                    "Each reference accepts `{:id <collection-id>}` or `{:entity-id <collection-entity-id>}`.")}
     CollectionRef]]
   [:question-collection-refs {:optional true}
    [:sequential {:description (str "Includes saved questions from collections. "
                                    "Each reference accepts `{:id <collection-id>}` or `{:entity-id <collection-entity-id>}`.")}
     CollectionRef]]
   [:include-data-library? {:optional true}
    [:boolean {:description "Whether to include the root data library."}]]
   [:include-metric-library? {:optional true}
    [:boolean {:description "Whether to include the root metrics library."}]]
   [:include-models? {:optional true}
    [:boolean {:description (str "Whether to include readable models with actions when no "
                                 "database scope is given. A `:database` scope always includes "
                                 "that database's models, regardless of this option.")}]]])

(def Items
  "Fetched schema entities, ready for pure assembly by [[create-schema]].

  Each entry holds entity maps shaped by the `metabase.typed-schemas.schema.*`
  builders; `:key` on each entity seeds the generated object keys."
  [:map {:closed true}
   [:questions [:sequential :map]]
   [:models    [:sequential :map]]
   [:tables    [:sequential :map]]
   [:metrics   [:sequential :map]]])

(defn- invalid-options!
  [message]
  (throw (ex-info message {:status-code 400})))

(defn- validate-options!
  [{:keys [database library-collection-refs question-collection-refs
           include-data-library? include-metric-library?] :as options}]
  (when-not (mr/validate SemanticSchemaOptions options)
    (invalid-options! "Invalid semantic schema options."))
  (let [include-library-root? (or include-data-library? include-metric-library?)
        collection-scoped?    (or (seq library-collection-refs)
                                  (seq question-collection-refs)
                                  include-library-root?)]
    (when (and collection-scoped? database)
      (invalid-options!
       "Collection-scoped query parameters and database query parameters are mutually exclusive."))))

(defn- library-items
  "Returns tables and metrics for a library scope.

  Tables mapped by in-scope metrics are included even when they live outside
  the library, so rendered metric dimensions can reference their fields."
  [source library-scope]
  (let [metrics   (source/metrics source nil (:metric-collection-ids library-scope))
        table-ids (set/union (into #{} (map :id) (source/library-tables source library-scope))
                             (into #{} (mapcat :mappedTableIds) metrics))]
    {:tables  (source/tables source nil table-ids)
     :metrics metrics}))

(defn- models-for-scope
  "Returns model schemas scoped to `database-ids`, or all readable models when requested without a database scope."
  [source database-ids include-models?]
  (cond
    database-ids    (source/models source database-ids)
    include-models? (source/models source nil)
    :else           []))

(defn fetch-items
  "Fetches the schema entities selected by [[SemanticSchemaOptions]].

  This is the only impure stage of the pipeline: everything downstream of the
  returned [[Items]] is pure. All reads go through a
  [[metabase.typed-schemas.source/SchemaSource]] — the application database by
  default, filtered to what the current user can read; tests reify the
  protocol with literal values."
  ([options]
   (fetch-items options source/app-db-source))
  ([options source]
   (let [{:keys [database library-collection-refs question-collection-refs
                 include-data-library? include-metric-library? include-models?]
          :or {library-collection-refs  []
               question-collection-refs []
               include-data-library?    false
               include-metric-library?  false
               include-models?          false}} options]
     (validate-options! (assoc options
                               :library-collection-refs library-collection-refs
                               :question-collection-refs question-collection-refs
                               :include-data-library? include-data-library?
                               :include-metric-library? include-metric-library?
                               :include-models? include-models?))
     (let [library-scope           (source/library-scope source
                                                         {:library-collection-refs library-collection-refs
                                                          :include-data-library? include-data-library?
                                                          :include-metric-library? include-metric-library?})
           database-ids            (source/database-ids source database)
           question-collection-ids (source/collection-ids source question-collection-refs)
           models                  (models-for-scope source database-ids include-models?)]
       (if (or library-scope
               (seq question-collection-refs)
               (and include-models? (nil? database-ids)))
         (let [{:keys [tables metrics]} (when library-scope
                                          (library-items source library-scope))]
           {:questions (if (seq question-collection-refs)
                         (source/questions source nil question-collection-ids)
                         [])
            :models    (vec models)
            :tables    (vec tables)
            :metrics   (vec metrics)})
         {:questions (source/questions source database-ids nil)
          :models    (vec models)
          :tables    (source/tables source database-ids nil)
          :metrics   (source/metrics source database-ids nil)})))))

(defn create-schema
  "Assembles fetched [[Items]] into the semantic schema value rendered by
  [[render-typescript]].

  Pure when `info` provides `:generated-at` and `:instance-url`; they default
  to the current time and the configured site URL."
  ([items]
   (create-schema items nil))
  ([{:keys [questions models tables metrics]} {:keys [generated-at instance-url]}]
   (array-map
    :schemaVersion 2
    :generatedAt   (str (or generated-at (Instant/now)))
    :metabase      {:instanceUrl (or instance-url (system/site-url))}
    :questions     (common/keyed-map questions)
    :models        (common/keyed-model-map models)
    :tables        (common/keyed-map tables)
    :metrics       (common/keyed-map metrics))))

(defn build-semantic-schema
  "Builds a semantic schema map from [[SemanticSchemaOptions]].

  `info` optionally pins `:generated-at` and `:instance-url` for deterministic
  output."
  ([options]
   (build-semantic-schema options nil))
  ([options info]
   (-> options fetch-items (create-schema info))))
