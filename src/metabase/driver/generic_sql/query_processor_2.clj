(ns metabase.driver.generic-sql.query-processor-2
  (:require [korma.core :refer :all]
            [metabase.driver.generic-sql.query-processor.annotate :as annotate]
            [metabase.driver.generic-sql.util :as gsu]
            [metabase.driver.interface :refer :all])
  (:import [metabase.driver.interface QPField QPValue]))

;;# ---------------------------------------- GenericSQL Structured QP ----------------------------------------

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

  (eval-structured-query [_]
    ;; TODO - logging ?
    (eval
     `(select (gsu/table-id->korma-entity ~source-table-id)
              ~@@processed-forms)))

  ;; ## ANNOTATION

  IQueryProcessor
  (annotate-results [_ results]
    (annotate/annotate query results)))
