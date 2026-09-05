(ns metabase.typed-schemas.build
  "Builds the semantic schema value: interprets [[SemanticSchemaOptions]] into
  SchemaSource reads and assembles the fetched items into the document.

  Internal to the typed-schemas module: the public surface is
  [[metabase.typed-schemas.core]], which composes [[fetch-items]] and
  [[create-schema]] into its public functions. See the core namespace
  docstring for the pipeline shape and the separation rules."
  (:require
   [clojure.set :as set]
   [metabase.system.core :as system]
   [metabase.typed-schemas.common :as common]
   [metabase.typed-schemas.source :as source]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

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
   [:models    [:sequential :map]]
   [:tables    [:sequential :map]]
   [:metrics   [:sequential :map]]])

(defn- invalid-options!
  [message]
  (throw (ex-info message {:status-code 400})))

(defn- validate-options!
  [{:keys [database library-collection-refs
           include-data-library? include-metric-library?] :as options}]
  (when-not (mr/validate SemanticSchemaOptions options)
    (invalid-options! "Invalid semantic schema options."))
  (let [include-library-root? (or include-data-library? include-metric-library?)
        collection-scoped?    (or (seq library-collection-refs)
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
   (let [{:keys [database library-collection-refs
                 include-data-library? include-metric-library? include-models?]
          :or {library-collection-refs  []
               include-data-library?    false
               include-metric-library?  false
               include-models?          false}} options]
     (validate-options! (assoc options
                               :library-collection-refs library-collection-refs
                               :include-data-library? include-data-library?
                               :include-metric-library? include-metric-library?
                               :include-models? include-models?))
     (let [library-scope           (source/library-scope source
                                                         {:library-collection-refs library-collection-refs
                                                          :include-data-library? include-data-library?
                                                          :include-metric-library? include-metric-library?})
           database-ids            (source/database-ids source database)
           models                  (models-for-scope source database-ids include-models?)]
       (if (or library-scope
               (and include-models? (nil? database-ids)))
         (let [{:keys [tables metrics]} (when library-scope
                                          (library-items source library-scope))]
           {:models    (vec models)
            :tables    (vec tables)
            :metrics   (vec metrics)})
         {:models    (vec models)
          :tables    (source/tables source database-ids nil)
          :metrics   (source/metrics source database-ids nil)})))))

(defn create-schema
  "Assembles fetched [[Items]] into the semantic schema value rendered by
  [[render-typescript]].

  Pure when `info` provides `:generated-at` and `:instance-url`; they default
  to the current time and the configured site URL."
  ([items]
   (create-schema items nil))
  ([{:keys [models tables metrics]} {:keys [generated-at instance-url]}]
   (array-map
    :schemaVersion 2
    :generatedAt   (str (or generated-at (Instant/now)))
    :metabase      {:instanceUrl (or instance-url (system/site-url))}
    :models        (common/keyed-model-map models)
    :tables        (common/keyed-map tables)
    :metrics       (common/keyed-map metrics))))
