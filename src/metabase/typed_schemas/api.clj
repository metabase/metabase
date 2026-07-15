(ns metabase.typed-schemas.api
  "/api/typed-schemas endpoints."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.typed-schemas.api.render :as render]
   [metabase.typed-schemas.api.schema :as schema]
   [metabase.typed-schemas.api.schema.metric :as schema.metric]
   [metabase.typed-schemas.api.schema.model :as schema.model]
   [metabase.typed-schemas.api.schema.question :as schema.question]
   [metabase.typed-schemas.api.schema.table :as schema.table]
   [metabase.typed-schemas.api.scope :as scope]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private typescript-response-headers
  {"Content-Type"                 "text/typescript; charset=utf-8"
   "X-Content-Type-Options"       "nosniff"
   "Cross-Origin-Resource-Policy" "same-origin"
   "Referrer-Policy"              "no-referrer"
   "Cache-Control"                "no-store"})

(defn- validate-query-params!
  [query-params]
  (let [library-value              (scope/query-library-value query-params)
        library-collection-values  (scope/query-library-collection-values query-params)
        question-collection-values (scope/query-question-collection-values query-params)
        include-library-root?      (or (scope/query-include-data-library? query-params)
                                       (scope/query-include-metric-library? query-params))
        collection-scoped?         (or library-value
                                       library-collection-values
                                       question-collection-values
                                       include-library-root?)
        database-value             (scope/query-database-value query-params)
        questions-only             (scope/truthy-query-param? (:questions query-params))]
    (api/check-400
     (not (and library-value (or library-collection-values include-library-root?)))
     "The library query parameter is mutually exclusive with library-collections, include-data-library, and include-metric-library.")
    (api/check-400
     (not (and collection-scoped? database-value))
     "Collection-scoped query parameters and database query parameters are mutually exclusive.")
    (api/check-400
     (not (and collection-scoped? questions-only))
     "Collection-scoped query parameters and the questions query parameter are mutually exclusive.")
    (api/check-400
     (not (and questions-only (nil? database-value)))
     "The questions query parameter requires a database query parameter.")))

(defn- typed-schema-for-library-scope
  [library-scope models]
  (let [{:keys [metric-collection-ids]} library-scope
        metrics               (schema.metric/metric-schemas nil metric-collection-ids)
        mapped-table-ids      (->> metrics (mapcat :mappedTableIds) set)
        library-table-ids     (->> (schema.table/select-library-tables library-scope) (map :id) set)
        table-ids             (set/union library-table-ids mapped-table-ids)
        tables                (schema.table/table-schemas (schema.table/select-tables nil table-ids))]
    (schema/base-schema [] models tables metrics)))

(defn- typed-schema
  [query-params]
  (validate-query-params! query-params)
  (let [library-value              (scope/query-library-value query-params)
        library-collection-values  (scope/query-library-collection-values query-params)
        question-collection-values (scope/query-question-collection-values query-params)
        library-scope              (scope/library-scope query-params)
        database-ids               (scope/database-ids-for-value (scope/query-database-value query-params))
        question-collection-ids    (scope/collection-scope question-collection-values)
        include-models?            (scope/query-include-models? query-params)
        models                     (cond
                                     database-ids
                                     (schema.model/model-schemas database-ids)

                                     include-models?
                                     (schema.model/model-schemas nil)

                                     :else
                                     [])
        questions-only             (scope/truthy-query-param? (:questions query-params))]
    (cond
      (or library-value
          library-collection-values
          library-scope
          question-collection-values
          (and include-models? (nil? database-ids)))
      (let [questions           (if question-collection-values
                                  (schema.question/question-schemas nil question-collection-ids)
                                  [])
            library-schema      (some-> library-scope
                                        (typed-schema-for-library-scope models))]
        (schema/base-schema questions
                            models
                            (-> library-schema :tables vals)
                            (-> library-schema :metrics vals)))

      questions-only
      (schema/base-schema (schema.question/question-schemas database-ids) models [] [])

      :else
      (let [questions (schema.question/question-schemas database-ids)
            metrics   (schema.metric/metric-schemas database-ids)
            tables    (schema.table/table-schemas (schema.table/select-tables database-ids))]
        (schema/base-schema questions models tables metrics)))))

(def ^:private TypedSchemaQueryParams
  [:map
   [:database {:optional true} [:maybe ms/NonBlankString]]
   [:database-name {:optional true} [:maybe ms/NonBlankString]]
   [:library {:optional true} [:maybe ms/NonBlankString]]
   [:library-collections {:optional true} [:maybe ms/NonBlankString]]
   [:collections {:optional true} [:maybe ms/NonBlankString]]
   [:question-collections {:optional true} [:maybe ms/NonBlankString]]
   [:include-data-library {:optional true} [:maybe :boolean]]
   [:include-metric-library {:optional true} [:maybe :boolean]]
   [:include-models {:optional true} [:maybe :boolean]]
   [:questions {:optional true} [:maybe :boolean]]])

(api.macros/defendpoint :get "/v1/typescript" :- :any
  "Generate a TypeScript semantic schema module."
  [_route-params
   query-params :- TypedSchemaQueryParams
   _body
   _request
   respond
   _raise]
  (respond {:status  200
            :headers typescript-response-headers
            :body    (render/render-typescript (typed-schema query-params))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/typed-schemas/` routes."
  (api.macros/ns-handler *ns*))
