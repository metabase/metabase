(ns metabase.driver.generic-sql.query-processor-2
  (:refer-clojure :exclude [format])
  (:require [korma.core :refer :all]
            [metabase.driver.generic-sql.query-processor.annotate :as annotate]
            [metabase.driver.generic-sql.util :as gsu]
            [metabase.driver.interface :refer :all])
  (:import [metabase.driver.interface QPField QPValue]))

(set! *warn-on-reflection* true)

;;# ---------------------------------------- GenericSQL Structured QP ----------------------------------------

(defprotocol IGenericSQLStructuredQueryProcessorFormat
  "Protocol for defining how QL fields + values should be formatted when inserting into a resulting korma form."
  (format [this]
    "Return a form suitable for inclusion in a korma form."))

(extend-protocol IGenericSQLStructuredQueryProcessorFormat
  QPField
  (format [this]
    (if (contains? #{:DateField :DateTimeField} (.base_type this)) `(raw ~(clojure.core/format "CAST(\"%s\" AS DATE)" (.name this)))
        (keyword (.name this))))

  QPValue
  (format [this]
    (if (contains? #{:DateField :DateTimeField} (.base_type this)) `(raw ~(clojure.core/format "CAST('%s' AS DATE)" (.value this)))
        (.value this))))


(defprotocol IGenericSQLQueryProcessor
  (emit! [this form]))

(deftype GenericSQLQueryProcessor [database-id
                                   source-table-id
                                   query
                                   processed-forms]
  IGenericSQLQueryProcessor
  (emit! [_ form]
    (swap! processed-forms conj form))

  IStructuredQueryProcessor
  (eval-structured-query [_]
    ;; TODO - logging ?
    (eval
     `(select (gsu/table-id->korma-entity ~source-table-id)
              ~@@processed-forms)))

  ;; -------------------- AGGREGATION --------------------

  (aggregation:rows [_]) ; nothing to do here since 'select' basically defaults to "rows"

  (aggregation:rows-count [this]
    (emit! this `(aggregate (~'count :*) :count)))

  (aggregation:avg [this field]
    (emit! this `(aggregate (~'avg ~(format field)) :avg)))

  (aggregation:field-count [this field]
    (emit! this `(aggregate (~'count ~(format field)) :count)))

  (aggregation:distinct [this field]
    (emit! this `(aggregate (~'count (sqlfn :DISTINCT ~(format field)) :count))))

  (aggregation:stddev [this field]
    (emit! this `(fields [(sqlfn :stddev ~(format field)) :stddev])))

  (aggregation:sum [this field]
    (emit! this `(aggregate (~'sum ~(format field)) :sum)))

  ;; -------------------- BREAKOUT --------------------

  (breakout [this fields]
    ;; We want to add any fields included in the breakout clause that are *not* included in the fields clause to the fields clause
    ;; Get the IDs of the fields in the fields clause
    (let [fields-clause-field-ids (set (:fields query))]
      (emit! this `(group ~@(map (partial format)
                                 fields)))
      (emit! this `(fields ~@(map (fn [^QPField field]
                                    (when-not (contains? fields-clause-field-ids (.id field))
                                      (format field)))
                                  fields)))))

  ;; -------------------- FIELDS --------------------

  (fields-clause [this fields]
    (emit! this `(fields ~@(map (partial format)
                                fields))))

  ;; -------------------- FILTER --------------------

  (filter:and [this subclauses]
    (emit! this `(where (~'and ~@subclauses))))

  (filter:or [this subclauses]
    (emit! this `(where (~'or ~@subclauses))))

  (filter:simple [this subclause]
    (emit! this `(where ~subclause)))

  ;; -------------------- FILTER SUBCLAUSES --------------------

  (filter-subclause:inside [this {:keys [lat, lat-min, lat-max, lon, lon-min, lon-max]}]
    `(~'and ~@[{(format lat) ['< (format lat-max)]}
               {(format lat) ['> (format lat-min)]}
               {(format lon) ['< (format lon-max)]}
               {(format lon) ['> (format lon-min)]}]))

  (filter-subclause:not-null [this field]
    {(format field) ['not= nil]})

  (filter-subclause:null [this field]
    {(format field) ['= nil]})

  (filter-subclause:between [this field min max]
    {(format field) ['between [(format min)
                               (format max)]]})

  (filter-subclause:=  [this field value]
    {(format field) ['= (format value)]})

  (filter-subclause:!= [this field value]
    {(format field) ['not= (format value)]})

  (filter-subclause:<  [this field value]
    {(format field) ['< (format value)]})

  (filter-subclause:>  [this field value]
    {(format field) ['> (format value)]})

  (filter-subclause:<= [this field value]
    {(format field) ['<= (format value)]})

  (filter-subclause:>= [this field value]
    {(format field) ['>= (format value)]})

  ;; -------------------- LIMIT --------------------

  (limit-clause [this value]
    (emit! this `(limit ~value)))

  ;; -------------------- ORDER-BY --------------------

  (order-by [_ _]) ; Since we emit [multiple] korma order forms directly from the subclauses there's nothing to do here :)

  (order-by-subclause:asc [this field]
    (emit! this `(order ~(format field) :ASC)))

  (order-by-subclause:desc [this field]
    (emit! this `(order ~(format field) :DESC)))

  ;; -------------------- OFFSET --------------------

  (offset-clause [this offset-amount]
    (emit! this `(offset ~offset-amount)))


  ;; ## ANNOTATION

  IQueryProcessor
  (annotate-results [_ results]
    (annotate/annotate query results)))
