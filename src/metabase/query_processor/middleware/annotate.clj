(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query, under the `:cols` column."
  (:require [clojure.string :as str]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.common :as driver.common]
            [metabase.mbql
             [predicates :as mbql.preds]
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.humanization :as humanization]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

(def ^:private Col
  "Schema for a valid map of column info as found in the `:cols` key of the results after this namespace has ran."
  ;; name and display name can be blank because some wacko DBMSes like SQL Server return blank column names for
  ;; unaliased aggregations like COUNT(*) (this only applies to native queries, since we determine our own names for
  ;; MBQL.)
  {:name                          s/Str
   :display_name                  s/Str
   ;; type of the Field. For Native queries we look at the values in the first 100 rows to make an educated guess
   :base_type                     su/FieldType
   (s/optional-key :special_type) (s/maybe su/FieldType)
   ;; where this column came from in the original query.
   :source                        (s/enum :aggregation :fields :breakout :native)
   ;; various other stuff from the original Field can and should be included such as `:settings`
   s/Any                          s/Any})


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
          :display_name (or (humanization/name->human-readable-name (u/keyword->qualified-name col))
                            (u/keyword->qualified-name col))
          :base_type    (or (driver.common/values->base-type (for [row rows]
                                                               (nth row i)))
                            :type/*)
          :source       :native})))

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
    {:name            expression-name
     :display_name    expression-name
     :base_type       :type/Float
     :special_type    :type/Number
     ;; provided so the FE can add easily add sorts and the like when someone clicks a column header
     :expression_name expression-name}

    [:field-id id]
    (dissoc (qp.store/field id) :database_type)

    ;; we should never reach this if our patterns are written right so this is more to catch code mistakes than
    ;; something the user should expect to see
    _ (throw (Exception. (str (tru "Don't know how to get information about Field:") " " &match)))))


;;; ---------------------------------------------- Aggregate Field Info ----------------------------------------------

(def ^:private arithmetic-op->text
  {:+ "add"
   :- "sub"
   :/ "div"
   :* "mul"})

(declare aggregation-name)

(defn- expression-ag-arg->name
  "Generate an appropriate name for an `arg` in an expression aggregation."
  [arg]
  (mbql.u/match-one arg
    ;; if the arg itself is a nested expression, recursively find a name for it, and wrap in parens
    [(_ :guard #{:+ :- :/ :*}) & _]
    (str "(" (aggregation-name &match) ")")

    ;; if the arg is another aggregation, recurse to get its name. (Only aggregations, nested expressions, or numbers
    ;; are allowed as args to expression aggregations; thus anything that's an MBQL clause, but not a nested
    ;; expression, is a ag clause.)
    [(_ :guard keyword?) & _]
    (aggregation-name &match)

    ;; otherwise for things like numbers just use that directly
    _ &match))

(s/defn aggregation-name :- su/NonBlankString
  "Return an appropriate field *and* display name for an `:aggregation` subclause (an aggregation or
  expression). Takes an options map as schema won't support passing keypairs directly as a varargs. `{:top-level?
  true}` will cause a name to be generated that will appear in the results, other names with a leading __ will be
  trimmed on some backends."
  [ag-clause :- mbql.s/Aggregation & [{:keys [top-level?]}]]
  (when-not driver/*driver*
    (throw (Exception. (str (tru "*driver* is unbound.")))))
  (mbql.u/match-one ag-clause
    ;; if a custom name was provided use it
    [:named _ ag-name]
    (driver/format-custom-field-name driver/*driver* ag-name)

    ;; For unnamed expressions, just compute a name like "sum + count"
    ;; Top level expressions need a name without a leading __ as those are automatically removed from the results
    [(operator :guard #{:+ :- :/ :*}) & args]
    (str (when top-level?
           (str (arithmetic-op->text operator)
                "__"))
         (str/join (str " " (name operator) " ")
                   (map expression-ag-arg->name args)))

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

    ;; get info from a Field if we can (theses Fields are matched when ag clauses recursively call
    ;; `col-info-for-ag-clause`, and this info is added into the results)
    [(_ :guard #{:field-id :field-literal :fk-> :datetime-field :expression :binning-strategy}) & _]
    (select-keys (col-info-for-field-clause &match) [:base_type :special_type :settings])

    ;; For the time being every Expression is an arithmetic operator and returns a floating-point number, so
    ;; hardcoding these types is fine; In the future when we extend Expressions to handle more functionality
    ;; we'll want to introduce logic that associates a return type with a given expression. But this will work
    ;; for the purposes of a patch release.
    [(_ :guard #{:expression :+ :- :/ :*}) & _]
    (merge {:base_type    :type/Float
            :special_type :type/Number}
           (when (mbql.preds/Aggregation? &match)
             (ag->name-info &match)))

    ;; get name/display-name of this ag
    [(_ :guard keyword?) arg]
    (merge (col-info-for-aggregation-clause arg)
           (ag->name-info &match))))


;;; ----------------------------------------- Putting it all together (MBQL) -----------------------------------------

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
;;; |                                              Deduplicating names                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ColsWithUniqueNames
  (s/constrained [Col] #(distinct? (map :name %)) ":cols with unique names"))

(s/defn ^:private deduplicate-cols-names :- ColsWithUniqueNames
  [cols :- [Col]]
  (map (fn [col unique-name]
         (assoc col :name unique-name))
       cols
       (mbql.u/uniquify-names (map :name cols))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               GENERAL MIDDLEWARE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private add-column-info* :- {:cols ColsWithUniqueNames, s/Keyword s/Any}
  [{query-type :type, :as query} {cols-returned-by-driver :cols, :as results}]
  (->
   ;; add `:cols` info to the query, using the appropriate function based on query type
   (if-not (= query-type :query)
     (add-native-column-info results)
     (add-mbql-column-info query results))
   ;; If the driver returned a `:cols` map with its results, which is completely optional, merge our `:cols` derived
   ;; from logic above with theirs. We'll prefer the values in theirs to ours. This is important for wacky drivers
   ;; like GA that use things like native metrics, which we have no information about.
   ;;
   ;; It's the responsibility of the driver to make sure the `:cols` are returned in the correct number and order.
   (update :cols (if (seq cols-returned-by-driver)
                   #(map merge % cols-returned-by-driver)
                   identity))
   ;; Finally, make sure the `:name` of each map in `:cols` is unique, since the FE uses it as a key for stuff like
   ;; column settings
   (update :cols deduplicate-cols-names)))

(defn add-column-info
  "Middleware for adding type information about the columns in the query results (the `:cols` key)."
  [qp]
  (fn [query]
    (add-column-info* query (qp query))))
