(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query and sorting the columns in the
  results."
  (:require [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.humanization :as humanization]
            [metabase.query-processor
             [interface :as i]
             [store :as qp.store]]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Adding :cols info for native queries                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- native-cols
  "Infer the types of columns by looking at the first value for each in the results, which will be added to the results
  as `:cols`. This is used for native queries, which don't have the type information from the original `Field` objects
  used in the query."
  [{:keys [columns rows], :as results}]
  (vec (for [i    (range (count columns))
             :let [col (nth columns i)]]
         {:name         (name col)
          :display_name (humanization/name->human-readable-name (name col))
          :base_type    (or (driver/values->base-type (for [row rows]
                                                        (nth row i)))
                            :type/*)})))

(defn- add-native-column-info
  [{:keys [columns], :as results}]
  (assoc results
    :columns (mapv name columns)
    :cols    (native-cols results)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Adding :cols info for MBQL queries                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; --------------------------------------------------- Field Info ---------------------------------------------------

(s/defn ^:private col-info-for-field-id :- su/Map
  [field-clause :- mbql.s/Field, field-id :- su/IntGreaterThanZero]
  (merge
   (dissoc (qp.store/field field-id) :database_type)
   (when-let [source-field-id (mbql.u/match-one field-clause [:fk-> [:field-id source-field-id] _] source-field-id)]
     {:fk_field_id source-field-id})
   (when-let [unit (mbql.u/match-one field-clause [:datetime-field _ unit] unit)]
     {:unit unit})))

(s/defn ^:private col-info-for-field-literal :- su/Map
  [query, [_ field-name field-type] :- mbql.s/field-literal]
  ;; TODO - shouldn't Field literals get a display_name too?
  {:name      field-name
   :base_type field-type})

(s/defn ^:private col-info-for-expression :- su/Map
  [query, expression-name :- su/NonBlankString]
  {:name         expression-name
   :display_name expression-name
   :base_type    :type/Float
   :special_type :type/Number})

(s/defn ^:private col-info-for-field-clause :- su/Map
  [query, original-clause :- mbql.s/Field]
  (let [[clause x :as wrapped-clause] (mbql.u/maybe-unwrap-field-clause original-clause)]
    (case clause
      :field-id      (col-info-for-field-id original-clause x)
      :field-literal (col-info-for-field-literal query wrapped-clause)
      :expression    (col-info-for-expression query x))))


;;; ---------------------------------------------- Aggregate Field Info ----------------------------------------------

(defn aggregation-name
  "Return an appropriate field *and* display name for an `:aggregation` subclause (an aggregation or expression)."
  ^String [[clause-name :as ag-clause]]
  (when-not i/*driver*
    (throw (Exception. (str (tru "metabase.query-processor.interface/*driver* is unbound.")))))

  (cond
    ;; if a custom name was provided use it
    (= clause-name :named)
    (driver/format-custom-field-name i/*driver* (nth ag-clause 2))

    ;; for unnamed expressions, just compute a name like "sum + count"
    (mbql.u/is-clause? #{:+ :- :/ :*} ag-clause)
    (let [[operator & args] ag-clause]
      (str/join (str " " (name operator) " ")
                (for [arg args]
                  (cond
                    (mbql.u/is-clause? #{:+ :- :/ :*} arg)
                    (str "(" (aggregation-name arg) ")")

                    (mbql.u/mbql-clause? arg)
                    (aggregation-name arg)

                    :else
                    arg))))

    ;; for unnamed normal aggregations, the column alias is always the same as the ag type except for `:distinct` with
    ;; is called `:count` (WHY?)
    (= clause-name :distinct)
    "count"

    :else
    (name clause-name)))

(defn- expression-aggregate-field-info [expression]
  (let [ag-name (aggregation-name expression)]
    {:name         ag-name
     :display_name ag-name
     :base_type    :type/Number
     :special_type :type/Number}))

(defn- col-info-for-aggregation-clause
  "Return appropriate column metadata for an `:aggregation` clause."
  [query [ag-type x :as ag]]
  (merge
   ;; ok, if this is a named aggregation recurse so we can get information about the ag we are naming
   (when (= ag-type :named)
     (col-info-for-aggregation-clause query x))
   ;; get name/display-name of this ag
   (let [ag-name (aggregation-name ag)]
     {:name         ag-name
      :display_name ag-name})
   ;; use base_type and special_type of the Field being aggregated if applicable
   (when-not (s/check mbql.s/Field x)
     (select-keys (col-info-for-field-clause query x) [:base_type :special_type]))
   ;; Always treat count or distinct count as an integer even if the DB in question returns it as something
   ;; wacky like a BigDecimal or Float
   (when (#{:count :distinct} ag-type)
     {:base_type    :type/Integer
      :special_type :type/Number})
   ;; For the time being every Expression is an arithmetic operator and returns a floating-point number, so
   ;; hardcoding these types is fine; In the future when we extend Expressions to handle more functionality
   ;; we'll want to introduce logic that associates a return type with a given expression. But this will work
   ;; for the purposes of a patch release.
   (when (mbql.u/is-clause? #{:expression :+ :- :/ :*} x)
     {:base_type    :type/Float
      :special_type :type/Number})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- check-correct-number-of-columns-returned [expected-count results]
  (let [actual-count (count (:columns results))]
    (when-not (= expected-count actual-count)
      (throw
       (Exception.
        (str (tru "Query processor error: mismatched number of columns in query and results.")
             " "
             (tru "Expected {0} fields, got {1}" expected-count actual-count)))))))

(defn- cols-for-fields [{{fields-clause :fields} :query, :as query}]
  (map (partial col-info-for-field-clause query) fields-clause))

(defn- cols-for-ags-and-breakouts [{{aggregations :aggregation, breakouts :breakout} :query, :as query}]
  (concat
   (map (partial col-info-for-field-clause query) breakouts)
   (map (partial col-info-for-aggregation-clause query) aggregations)))

(declare mbql-cols)

(defn- cols-for-source-query [{native-source-query :native, :as source-query} results]
  (if native-source-query
    (native-cols results)
    (mbql-cols {:query source-query} results)))

(defn- mbql-cols [{{:keys [fields breakout aggregation source-query]} :query, :as query}, results]
  (let [cols (concat
              (cols-for-ags-and-breakouts query)
              (cols-for-fields query))]
    (if (and (empty? cols) source-query)
      (cols-for-source-query source-query results)
      cols)))

(defn- add-mbql-column-info [query results]
  (let [cols (mbql-cols query results)]
    (check-correct-number-of-columns-returned (count cols) results)
    (assoc results :cols cols)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               GENERAL MIDDLEWARE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- add-column-info* [{query-type :type, :as query} results]
  (if-not (or (= query-type :query)
              (:annotate? results))
    (add-native-column-info results)
    (add-mbql-column-info query results)))

(defn add-column-info
  "Middleware for adding type information to columns returned by running a query, and sorting the columns in the
  results."
  [qp]
  (fn [query]
    (let [results (qp query)]
      (-> (add-column-info* query results)
          (dissoc :annotate?)))))
