(ns metabase.typed-schemas.api.schema
  "Typed-schema data collection and schema construction."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.system.core :as system]
   [metabase.typed-schemas.api.common :as typed-schemas.common]
   [metabase.typed-schemas.api.query-params :as qp]
   [metabase.typed-schemas.api.schema.metric :as metric]
   [metabase.typed-schemas.api.schema.model :as model]
   [metabase.typed-schemas.api.schema.question :as question]
   [metabase.typed-schemas.api.schema.table :as table])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(defn- keyed-model-map
  [models]
  (reduce-kv (fn [m k model]
               (assoc m k (select-keys model [:actions])))
             (sorted-map)
             (typed-schemas.common/keyed-map models)))

(defn- base-schema
  [questions models tables metrics]
  (array-map
   :schemaVersion 2
   :generatedAt   (str (Instant/now))
   :metabase      {:instanceUrl (system/site-url)}
   :questions     (typed-schemas.common/keyed-map questions)
   :models        (keyed-model-map models)
   :tables        (typed-schemas.common/keyed-map tables)
   :metrics       (typed-schemas.common/keyed-map metrics)))

(defn- validate-query-params!
  [query-params]
  (let [library-value              (qp/query-library-value query-params)
        library-collection-values  (qp/query-library-collection-values query-params)
        question-collection-values (qp/query-question-collection-values query-params)
        include-library-root?      (or (qp/query-include-data-library? query-params)
                                       (qp/query-include-metric-library? query-params))
        collection-scoped?         (or library-value
                                       library-collection-values
                                       question-collection-values
                                       include-library-root?)
        database-value             (qp/query-database-value query-params)
        questions-only             (qp/truthy-query-param? (qp/query-param query-params :questions))]
    (api/check-400
     (not (and library-value (or library-collection-values include-library-root?)))
     "The library query parameter is mutually exclusive with library-collections, includeDataLibrary, and includeMetricLibrary.")
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
        metrics               (metric/metric-schemas nil metric-collection-ids)
        mapped-table-ids      (->> metrics (mapcat :mappedTableIds) set)
        library-table-ids     (->> (table/select-library-tables library-scope) (map :id) set)
        table-ids             (set/union library-table-ids mapped-table-ids)
        tables                (table/table-schemas (table/select-tables nil table-ids))]
    (base-schema [] models tables metrics)))

(defn typed-schema
  "Builds the typed-schema map for the supplied endpoint query params."
  [query-params]
  (validate-query-params! query-params)
  (let [library-value              (qp/query-library-value query-params)
        library-collection-values  (qp/query-library-collection-values query-params)
        question-collection-values (qp/query-question-collection-values query-params)
        library-scope              (qp/library-scope query-params)
        database-ids               (qp/database-ids-for-value (qp/query-database-value query-params))
        question-collection-ids    (qp/collection-scope question-collection-values)
        include-models?            (qp/query-include-models? query-params)
        models                     (cond
                                     database-ids
                                     (model/model-schemas database-ids)

                                     include-models?
                                     (model/model-schemas nil)

                                     :else
                                     [])
        questions-only             (qp/truthy-query-param? (qp/query-param query-params :questions))]
    (cond
      (or library-value
          library-collection-values
          library-scope
          question-collection-values
          (and include-models? (nil? database-ids)))
      (let [questions           (if question-collection-values
                                  (question/question-schemas nil question-collection-ids)
                                  [])
            library-schema      (some-> library-scope
                                        (typed-schema-for-library-scope models))]
        (base-schema questions
                     models
                     (-> library-schema :tables vals)
                     (-> library-schema :metrics vals)))

      questions-only
      (base-schema (question/question-schemas database-ids) models [] [])

      :else
      (let [questions (question/question-schemas database-ids)
            metrics   (metric/metric-schemas database-ids)
            tables    (table/table-schemas (table/select-tables database-ids))]
        (base-schema questions models tables metrics)))))
