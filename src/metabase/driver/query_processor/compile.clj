(ns metabase.driver.query-processor.parse
  (:require [clojure.core.match :refer [match]]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.util :as gsu]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]])))

(set! *warn-on-reflection* true)

(deftype QPField [^Integer id
                  ^String name
                  ^clojure.lang.Keyword base-type])

(deftype QPValue [value
                  ^clojure.lang.Keyword base-type])

(defprotocol IStructuredQueryProcessor
  (aggregation:rows          [this])
  (aggregation:rows-count    [this])
  (aggregation:avg           [this ^QPField field])
  (aggregation:field-count   [this ^QPField field])
  (aggregation:distinct      [this ^QPField field])
  (aggregation:stddev        [this ^QPField field])
  (aggregation:sum           [this ^QPField field])
  (aggregation:cum-sum       [this ^QPField field])

  (breakout                  [this fields])

  (fields-clause             [this fields])

  (filter:and                [this subclauses])
  (filter:or                 [this subclauses])
  (filter:simple             [this subclause])

  (filter-subclause:inside   [this & {:keys [^QPField lat-field ^QPField lon-field ^QPValue lat-min ^QPValue lat-max ^QPValue lon-min ^QPValue lon-max]}])
  (filter-subclause:not-null [this ^QPField field])
  (filter-subclause:null     [this ^QPField field])
  (filter-subclause:between  [this ^QPField field ^QPValue min ^QPValue max])
  (filter-subclause:=        [this ^QPField field ^QPValue value])
  (filter-subclause:!=       [this ^QPField field ^QPValue value])
  (filter-subclause:<        [this ^QPField field ^QPValue value])
  (filter-subclause:>        [this ^QPField field ^QPValue value])
  (filter-subclause:<=       [this ^QPField field ^QPValue value])
  (filter-subclause:>=       [this ^QPField field ^QPValue value])

  (limit-clause              [this ^Integer limit])

  (order-by                  [this subclauses])

  (order-by-subclause:asc    [this ^QPField field])
  (order-by-subclause:desc   [this ^QPField field])

  ;; PAGE can just be implemented as limit + offset
  (offset-clause             [this ^Integer offset])

  ;; TODO - do we *need* to process source_table ?
  ;; (source-table-id           [this ^Integer table-id])

  (emit-form                 [this]
    "Called at the end of the process-query. Emit a final form that can be evalled."))

(defprotocol IStructuredQueryProcessorFactory
  (create-query-processor [this, ^Integer database-id, ^Integer source-table-id, query]))


;; ## process-query

(defn resolve-field ^QPField [^Integer field-id]
  (let [field (sel :one :fields [Field :name :base_type] :id field-id)]
    (->QPField field-id (:name field) (:base_type field))))

(defmacro with-resolved-field [[field-binding field-id] & body]
  `(let [~field-binding (resolve-field ~field-id)
         ~'resolve-value (fn ^QPValue [value#]
                           (->QPValue value# (.base_type ~field-binding)))]
     ~@body))

(defn process-aggregation [qp clause]
  (match clause
    ["rows"]  (aggregation:rows qp)
    ["count"] (aggregation:rows-count qp)))

(defn process-filter-subclause [qp subclause]
  (match subclause
    ["BETWEEN" field-id min max] (with-resolved-field [field field-id]
                                   (filter-subclause:between qp field (resolve-value min) (resolve-value max)))))

(defn process-filter [qp clause]
  (match clause
    ["AND" & subclauses] (filter:and qp (mapv (partial process-filter-subclause qp)
                                              subclauses))
    ["OR"  & subclauses] (filter:or  qp (mapv (partial process-filter-subclause qp)
                                              subclauses))
    subclause            (filter:simple qp (process-filter-subclause qp subclause))))


(defn process-query [qp-factory {database-id :database, {:keys [source_table] :as query} :query}]
  {:pre [(extends? IStructuredQueryProcessorFactory (type qp-factory))
         (integer? database-id)
         (integer? source_table)
         (map?     query)]}
  (let [query (dissoc query :source_table)
        ^IStructuredQueryProcessor qp (create-query-processor qp-factory database-id source_table query)]
    (doseq [[clause-name clause-value] query]
      (match clause-name
        :aggregation (process-aggregation qp clause-value)
        :filter      (process-filter qp clause-value)))
    (emit-form qp)))

;; ## GenericSQL

(defprotocol IGenericSQLQueryProcessor
  (emit! [this form])
  (format-field [this ^QPField field])
  (format-value [this ^QPValue value]))

(deftype GenericSQLQueryProcessor [^Integer database-id
                                   ^Integer source-table-id
                                   query
                                   processed-forms]
  IGenericSQLQueryProcessor
  (emit! [_ form]
    (swap! processed-forms conj form))

  (format-field [this field]
    (if (contains? #{:DateField :DateTimeField} (.base_type ^QPField field)) `(raw ~(format "CAST(\"%s\" AS DATE)" (.name ^QPField field)))
        (keyword (.name ^QPField field))))

  (format-value [this value]
    (if (contains? #{:DateField :DateTimeField} (.base_type ^QPValue value)) `(raw ~(format "CAST('%s' AS DATE)" (.value ^QPValue value)))
        (.value ^QPValue value)))

  IStructuredQueryProcessor
  (aggregation:rows-count [this]
    (emit! this `(aggregate (~'count :*) :count)))

  (filter:and [this subclauses]
    (emit! this `(where (~'and ~@subclauses))))

  (filter-subclause:between [this field min max]
    {(format-field this field) ['between [(format-value this min)
                                          (format-value this max)]]})

  (emit-form [_]
    `(select (gsu/table-id->korma-entity ~source-table-id)
             ~@@processed-forms)))

(def generic-sql-qp-factory
  (reify
    IStructuredQueryProcessorFactory
    (create-query-processor [this database-id source-table-id query]
      (->GenericSQLQueryProcessor database-id
                                  source-table-id
                                  query
                                  (atom [])))))


;; ## Test Data

(def test-query
  {:database 33,
   :type "query",
   :query {:source_table 85,
           :aggregation ["count"],
           :filter ["AND" ["BETWEEN" 409 "2015-01-01" "2015-05-01"]]}})

;; ~ 17.5 ms
(defn x []
  (process-query generic-sql-qp-factory test-query))

(require '[metabase.driver :as driver])

;; ~ 36 ms
(defn y []
  (driver/process-query test-query))
