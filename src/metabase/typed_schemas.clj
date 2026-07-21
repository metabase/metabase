(ns metabase.typed-schemas
  "Programmatic API for building and rendering typed schemas."
  (:require
   [clojure.set :as set]
   [metabase.typed-schemas.render :as render]
   [metabase.typed-schemas.schema :as schema]
   [metabase.typed-schemas.schema.metric :as schema.metric]
   [metabase.typed-schemas.schema.model :as schema.model]
   [metabase.typed-schemas.schema.question :as schema.question]
   [metabase.typed-schemas.schema.table :as schema.table]
   [metabase.typed-schemas.scope :as scope]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def SemanticSchemaOptions
  "Options accepted by [[build-semantic-schema]]."
  [:map
   [:database {:optional true} [:maybe [:or [:map [:id :int]] [:map [:name ms/NonBlankString]]]]]
   [:library {:optional true} [:maybe [:or [:map [:id :int]] [:map [:name ms/NonBlankString]]]]]
   [:library-collection-refs {:optional true}
    [:sequential [:or [:map [:id :int]] [:map [:entity-id ms/NonBlankString]]]]]
   [:question-collection-refs {:optional true}
    [:sequential [:or [:map [:id :int]] [:map [:entity-id ms/NonBlankString]]]]]
   [:include-data-library? {:optional true} :boolean]
   [:include-metric-library? {:optional true} :boolean]
   [:include-models? {:optional true} :boolean]
   [:questions-only? {:optional true} :boolean]])

(defn- invalid-options!
  [message]
  (throw (ex-info message {:status-code 400})))

(defn- validate-options!
  [{:keys [database library library-collection-refs question-collection-refs
           include-data-library? include-metric-library? questions-only?] :as options}]
  (when-not (mr/validate SemanticSchemaOptions options)
    (invalid-options! "Invalid typed schema options."))
  (let [include-library-root? (or include-data-library? include-metric-library?)
        collection-scoped?    (or library
                                  (seq library-collection-refs)
                                  (seq question-collection-refs)
                                  include-library-root?)]
    (when (and library (or (seq library-collection-refs) include-library-root?))
      (invalid-options!
       "The library query parameter is mutually exclusive with library-collections, include-data-library, and include-metric-library."))
    (when (and collection-scoped? database)
      (invalid-options! "Collection-scoped query parameters and database query parameters are mutually exclusive."))
    (when (and collection-scoped? questions-only?)
      (invalid-options! "Collection-scoped query parameters and the questions query parameter are mutually exclusive."))
    (when (and questions-only? (nil? database))
      (invalid-options! "The questions query parameter requires a database query parameter."))))

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
  "Builds a semantic schema map from typed [[SemanticSchemaOptions]]."
  [options]
  (let [{:keys [database library library-collection-refs question-collection-refs
                include-data-library? include-metric-library? include-models? questions-only?]
         :or {library-collection-refs  []
              question-collection-refs []
              include-data-library?    false
              include-metric-library?  false
              include-models?          false
              questions-only?          false}} options]
    (validate-options! (assoc options
                              :library-collection-refs library-collection-refs
                              :question-collection-refs question-collection-refs
                              :include-data-library? include-data-library?
                              :include-metric-library? include-metric-library?
                              :include-models? include-models?
                              :questions-only? questions-only?))
    (let [library-scope           (scope/library-scope {:library library
                                                        :library-collection-refs library-collection-refs
                                                        :include-data-library? include-data-library?
                                                        :include-metric-library? include-metric-library?})
          database-ids            (scope/database-ids-for-ref database)
          question-collection-ids (scope/collection-scope question-collection-refs)
          models                  (cond
                                    database-ids (schema.model/model-schemas database-ids)
                                    include-models? (schema.model/model-schemas nil)
                                    :else [])]
      (cond
        (or library
            (seq library-collection-refs)
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

        questions-only?
        (schema/base-schema (schema.question/question-schemas database-ids) models [] [])

        :else
        (let [questions (schema.question/question-schemas database-ids)
              metrics   (schema.metric/metric-schemas database-ids)
              tables    (schema.table/table-schemas (schema.table/select-tables database-ids))]
          (schema/base-schema questions models tables metrics))))))

(defn render-typescript
  "Renders a semantic schema map as a TypeScript module."
  [semantic-schema]
  (render/render-typescript semantic-schema))
