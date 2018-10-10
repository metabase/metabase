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
            [schema.core :as s]
            [metabase.util :as u]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Adding :cols info for native queries                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- native-cols
  "Infer the types of columns by looking at the first value for each in the results, which will be added to the results
  as `:cols`. This is used for native queries, which don't have the type information from the original `Field` objects
  used in the query."
  [{:keys [columns rows]}]
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

(s/defn ^:private col-info-for-field-clause :- su/Map
  [clause :- mbql.s/Field]
  ;; for various things that can wrap Field clauses recurse on the wrapped Field but include a little bit of info
  ;; about the clause doing the wrapping
  (mbql.u/match-one clause
    [:binning-strategy field strategy _ resolved-options]
    (assoc (col-info-for-field-clause field) :binning_info (assoc (u/snake-keys resolved-options)
                                                             :binning_strategy strategy))

    [:datetime-field field unit]
    (assoc (col-info-for-field-clause field) :unit unit)

    [:fk-> [:field-id source-field-id] field]
    (assoc (col-info-for-field-clause field) :fk_field_id source-field-id)

    ;; for FKs where source is a :field-literal don't include `:fk_field_id`
    [:fk-> _ field]
    (recur field)

    [:field-literal field-name field-type]
    {:name         field-name
     :base_type    field-type
     :display_name (humanization/name->human-readable-name field-name)}

    [:expression expression-name]
    {:name         expression-name
     :display_name expression-name
     :base_type    :type/Float
     :special_type :type/Number}

    [:field-id id]
    (dissoc (qp.store/field id) :database_type)

    ;; we should never reach this if our patterns are written right so this is more to catch code mistakes than
    ;; something the user should expect to see
    _ (throw (Exception. (str (tru "Don't know how to get information about Field:") " " &match)))))


;;; ---------------------------------------------- Aggregate Field Info ----------------------------------------------

;; TODO - I think this might be an appropriate thing to move to either `mbql.u` or somewhere else more general we can
;; have the function take an ag clause and optional custom-name-formatting function so it doesn't need to worry about
;; `*driver*
(s/defn aggregation-name :- su/NonBlankString
  "Return an appropriate field *and* display name for an `:aggregation` subclause (an aggregation or expression)."
  [ag-clause :- mbql.s/Aggregation]
  (when-not i/*driver*
    (throw (Exception. (str (tru "metabase.query-processor.interface/*driver* is unbound.")))))
  (mbql.u/match-one ag-clause
    ;; if a custom name was provided use it
    [:named _ ag-name]
    (driver/format-custom-field-name i/*driver* ag-name)

    ;; for unnamed expressions, just compute a name like "sum + count"
    [(operator :guard #{:+ :- :/ :*}) & args]
    (str/join (str " " (name operator) " ")
              ;; for each arg...
              (for [arg args]
                (mbql.u/match-one arg
                  ;; if the arg itself is a nested expression, recursively find a name for it, and wrap in parens
                  [(_ :guard #{:+ :- :/ :*}) & _]
                  (str "(" (aggregation-name &match) ")")

                  ;; if the arg is another aggregation, recurse to get its name
                  [(_ :guard keyword?) & _]
                  (aggregation-name &match)

                  ;; otherwise for things like numbers just use that directly
                  _ &match)))

    ;; for unnamed normal aggregations, the column alias is always the same as the ag type except for `:distinct` with
    ;; is called `:count` (WHY?)
    [:distinct _]
    "count"

    ;; for any other aggregation just use the name of the clause e.g. `sum`
    [clause-name & _]
    (name clause-name)))

(defn- ag->name-info [ag]
  (let [ag-name (aggregation-name ag)]
    {:name         ag-name
     :display_name ag-name}))

(defn- col-info-for-aggregation-clause
  "Return appropriate column metadata for an `:aggregation` clause."
  [aggregation-clause]
  (mbql.u/match-one aggregation-clause
    ;; ok, if this is a named aggregation recurse so we can get information about the ag we are naming
    [:named ag _]
    (merge (col-info-for-aggregation-clause ag)
           (ag->name-info &match))

    ;; Always treat count or distinct count as an integer even if the DB in question returns it as something
    ;; wacky like a BigDecimal or Float
    [(_ :guard #{:count :distinct}) & args]
    (merge (col-info-for-aggregation-clause args)
           {:base_type    :type/Integer
            :special_type :type/Number}
           (ag->name-info &match))

    ;; get info from a Field if we can
    [(_ :guard #{:field-id :field-literal :fk-> :datetime-field :expression :binning-strategy}) & _]
    (select-keys (col-info-for-field-clause &match) [:base_type :special_type :settings])

    ;; For the time being every Expression is an arithmetic operator and returns a floating-point number, so
    ;; hardcoding these types is fine; In the future when we extend Expressions to handle more functionality
    ;; we'll want to introduce logic that associates a return type with a given expression. But this will work
    ;; for the purposes of a patch release.
    [(_ :guard #{:expression :+ :- :/ :*}) & _]
    {:base_type    :type/Float
     :special_type :type/Number}

    ;; get name/display-name of this ag
    [(_ :guard keyword?) arg]
    (merge (col-info-for-aggregation-clause arg)
           (ag->name-info &match))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- check-correct-number-of-columns-returned [mbql-cols results]
  (let [expected-count (count mbql-cols)
        actual-count   (count (:columns results))]
    (when (seq (:rows results))
      (when-not (= expected-count actual-count)
        (throw
         (Exception.
          (str (tru "Query processor error: mismatched number of columns in query and results.")
               " "
               (tru "Expected {0} fields, got {1}" expected-count actual-count)
               "\n"
               (tru "Expected: {0}" (mapv :name mbql-cols))
               "\n"
               (tru "Actual: {0}" (vec (:columns results))))))))))

(defn- cols-for-fields [{{fields-clause :fields} :query, :as query}]
  (for [field fields-clause]
    (assoc (col-info-for-field-clause field) :source :fields)))

(defn- cols-for-ags-and-breakouts [{{aggregations :aggregation, breakouts :breakout} :query, :as query}]
  (concat
   (for [breakout breakouts]
     (assoc (col-info-for-field-clause breakout) :source :breakout))
   (for [aggregation aggregations]
     (assoc (col-info-for-aggregation-clause aggregation) :source :aggregation))))

(declare mbql-cols)

(defn- cols-for-source-query [{native-source-query :native, :as source-query} results]
  (if native-source-query
    (native-cols results)
    (mbql-cols {:query source-query} results)))

(defn- mbql-cols [{{:keys [source-query]} :query, :as query}, results]
  (let [cols (concat
              (cols-for-ags-and-breakouts query)
              (cols-for-fields query))]
    (if (and (empty? cols) source-query)
      (cols-for-source-query source-query results)
      cols)))

(defn- add-mbql-column-info [query results]
  (let [cols (mbql-cols query results)]
    (check-correct-number-of-columns-returned cols results)
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
