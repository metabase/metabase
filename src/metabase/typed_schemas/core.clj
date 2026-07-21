(ns metabase.typed-schemas.core
  "Programmatic API for building and rendering typed schemas."
  (:require
   [clojure.set :as set]
   [metabase.typed-schemas.render]
   [metabase.typed-schemas.schema :as schema]
   [metabase.typed-schemas.schema.metric :as schema.metric]
   [metabase.typed-schemas.schema.model :as schema.model]
   [metabase.typed-schemas.schema.question :as schema.question]
   [metabase.typed-schemas.schema.table :as schema.table]
   [metabase.typed-schemas.scope :as scope]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [metabase.typed-schemas.render
  render-typescript])

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
  "Schema generation options accepted by [[build-semantic-schema]]."
  [:map
   [:database {:optional true}
    [:maybe {:description "Scopes the schema to a database. Accepts `{:id <database-id>}` or `{:name <database-name>}`."}
     DatabaseRef]]
   [:library-collection-refs {:optional true}
    [:sequential {:description "Limits tables and metrics to library collections. Each reference accepts `{:id <collection-id>}` or `{:entity-id <collection-entity-id>}`."}
     CollectionRef]]
   [:question-collection-refs {:optional true}
    [:sequential {:description "Includes saved questions from collections. Each reference accepts `{:id <collection-id>}` or `{:entity-id <collection-entity-id>}`."}
     CollectionRef]]
   [:include-data-library? {:optional true}
    [:boolean {:description "Whether to include the root data library."}]]
   [:include-metric-library? {:optional true}
    [:boolean {:description "Whether to include the root metrics library."}]]
   [:include-models? {:optional true}
    [:boolean {:description "Whether to include readable models with actions. Database scope applies when provided."}]]])

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
      (invalid-options! "Collection-scoped query parameters and database query parameters are mutually exclusive."))))

(defn- semantic-schema-for-library-scope
  [library-scope models]
  (let [{:keys [metric-collection-ids]} library-scope
        metrics           (schema.metric/metric-schemas nil metric-collection-ids)
        mapped-table-ids  (->> metrics (mapcat :mappedTableIds) set)
        library-table-ids (->> (schema.table/select-library-tables library-scope) (map :id) set)
        table-ids         (set/union library-table-ids mapped-table-ids)
        tables            (schema.table/table-schemas (schema.table/select-tables nil table-ids))]
    (schema/base-schema [] models tables metrics)))

(defn build-semantic-schema
  "Builds a semantic schema map from [[SemanticSchemaOptions]]."
  [options]
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
    (let [library-scope           (scope/library-scope {:library-collection-refs library-collection-refs
                                                        :include-data-library? include-data-library?
                                                        :include-metric-library? include-metric-library?})
          database-ids            (scope/database-ids-for-ref database)
          question-collection-ids (scope/collection-scope question-collection-refs)
          models                  (cond
                                    database-ids (schema.model/model-schemas database-ids)
                                    include-models? (schema.model/model-schemas nil)
                                    :else [])]
      (cond
        (or (seq library-collection-refs)
            library-scope
            (seq question-collection-refs)
            (and include-models? (nil? database-ids)))
        (let [questions      (if (seq question-collection-refs)
                               (schema.question/question-schemas nil question-collection-ids)
                               [])
              library-schema (some-> library-scope (semantic-schema-for-library-scope models))]
          (schema/base-schema questions
                              models
                              (-> library-schema :tables vals)
                              (-> library-schema :metrics vals)))

        :else
        (let [questions (schema.question/question-schemas database-ids)
              metrics   (schema.metric/metric-schemas database-ids)
              tables    (schema.table/table-schemas (schema.table/select-tables database-ids))]
          (schema/base-schema questions models tables metrics))))))
