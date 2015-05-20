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

(deftype GenericSQLQueryProcessor [database-id
                                   source-table-id
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
    (emit! this `(aggregate (~'avg ~(format-field this field)) :avg)))

  (aggregation:field-count [this field]
    (emit! this `(aggregate (~'count ~(format-field this field)) :count)))

  (aggregation:distinct [this field]
    (emit! this `(aggregate (~'count (sqlfn :DISTINCT ~(format-field this field)) :count))))

  (aggregation:stddev [this field]
    (emit! this `(fields [(sqlfn :stddev ~(format-field this field)) :stddev])))

  (aggregation:sum [this field]
    (emit! this `(aggregate (~'sum ~(format-field this field)) :sum)))

  ;; -------------------- BREAKOUT --------------------

  (breakout [this fields]
    ;; We want to add any fields included in the breakout clause that are *not* included in the fields clause to the fields clause
    ;; Get the IDs of the fields in the fields clause
    (let [fields-clause-field-ids (set (:fields query))]
      (emit! this `(group ~@(map (partial format-field this)
                                 fields)))
      (emit! this `(fields ~@(map (fn [^QPField field]
                                    (when-not (contains? fields-clause-field-ids (.id field))
                                      (format-field this field)))
                                  fields)))))

  ;; -------------------- FIELDS --------------------

  (fields-clause [this fields]
    (emit! this `(fields ~@(map (partial format-field this)
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
    `(~'and ~@[{(format-field this lat) ['< (format-value this lat-max)]}
               {(format-field this lat) ['> (format-value this lat-min)]}
               {(format-field this lon) ['< (format-value this lon-max)]}
               {(format-field this lon) ['> (format-value this lon-min)]}]))

  (filter-subclause:not-null [this field]
    {(format-field this field) ['not= nil]})

  (filter-subclause:null [this field]
    {(format-field this field) ['= nil]})

  (filter-subclause:between [this field min max]
    {(format-field this field) ['between [(format-value this min)
                                          (format-value this max)]]})

  (filter-subclause:=  [this field value]
    {(format-field this field) ['= (format-value this value)]})

  (filter-subclause:!= [this field value]
    {(format-field this field) ['not= (format-value this value)]})

  (filter-subclause:<  [this field value]
    {(format-field this field) ['< (format-value this value)]})

  (filter-subclause:>  [this field value]
    {(format-field this field) ['> (format-value this value)]})

  (filter-subclause:<= [this field value]
    {(format-field this field) ['<= (format-value this value)]})

  (filter-subclause:>= [this field value]
    {(format-field this field) ['>= (format-value this value)]})

  ;; -------------------- LIMIT --------------------

  (limit-clause [this value]
    (emit! this `(limit ~value)))

  ;; -------------------- ORDER-BY --------------------

  (order-by [_ _]) ; Since we emit [multiple] korma order forms directly from the subclauses there's nothing to do here :)

  (order-by-subclause:asc [this field]
    (emit! this `(order ~(format-field this field) :ASC)))

  (order-by-subclause:desc [this field]
    (emit! this `(order ~(format-field this field) :DESC)))

  ;; -------------------- OFFSET --------------------

  (offset-clause [this offset-amount]
    (emit! this `(offset ~offset-amount)))


  ;; ## ANNOTATION

  IQueryProcessor
  (annotate-results [_ results]
    (annotate/annotate query results)))
