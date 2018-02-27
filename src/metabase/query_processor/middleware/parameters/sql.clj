(ns metabase.query-processor.middleware.parameters.sql
  "Param substitution for *SQL* queries.
   This is a new implementation, fondly referred to as 'SQL parameters 2.0', written for v0.23.0.
   The new implementation uses prepared statement args instead of substituting them directly into the query,
   and is much better-organized and better-documented."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [instaparse.core :as insta]
            [metabase.driver :as driver]
            [metabase.models.field :as field :refer [Field]]
            [metabase.query-processor.middleware.parameters.dates :as date-params]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import clojure.lang.Keyword
           honeysql.types.SqlCall
           java.text.NumberFormat
           metabase.models.field.FieldInstance))

;; The Basics:
;;
;; *  Things like `{{x}}` (required params) get subsituted with the value of `:x`, which can be a literal used in a
;;    clause (e.g. in a clause like `value = {{x}}`) or a "field filter" that handles adding the clause itself
;;    (e.g. `{{timestamp}}` might become `timestamp BETWEEN ? AND ?`).
;;
;; *  Things like `[[AND {{x}]]` are optional param. If the param (`:x`) isn't specified, the *entire* clause inside
;;    `[[...]]` is replaced with an empty string; If it is specified, the value inside the curly brackets `{{x}}` is
;;    replaced as usual and the rest of the clause (`AND ...`) is included in the query as-is
;;
;; See the various parts of this namespace below to see how it's done.


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      ETC                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Dynamic variables and record types used by the other parts of this namespace.

;; TODO - we have dynamic *driver* variables like this in several places; it probably makes more sense to see if we
;; can share one used somewhere else instead
(def ^:private ^:dynamic *driver* nil)

(def ^:private ^:dynamic *timezone* nil)


;; various record types below are used as a convenience for differentiating the different param types.

;; "Dimension" here means a "FIELD FILTER", e.g. something that expands to a clause like "some_field BETWEEN 1 AND 10"
(s/defrecord ^:private Dimension [field :- FieldInstance, param]) ; param is either single param or a vector of params

;; as in a literal date, defined by date-string S
(s/defrecord ^:private Date [s :- s/Str])

(defrecord ^:private DateRange [start end])

;; List of numbers to faciliate things like using params in a SQL `IN` clause. See the discussion in `value->number`
;; for more details.
(s/defrecord ^:private CommaSeparatedNumbers [numbers :- [s/Num]])

;; convenience for representing an *optional* parameter present in a query but whose value is unspecified in the param
;; values.
(defrecord ^:private NoValue [])

(defn- no-value? [x]
  (instance? NoValue x))

;; various schemas are used to check that various functions return things in expected formats

;; TAGS in this case are simple params like {{x}} that get replaced with a single value ("ABC" or 1) as opposed to a
;; "FieldFilter" clause like Dimensions
;;
;; Since 'Dimension' (Field Filters) are considered their own `:type`, to *actually* store the type of a Dimension
;; look at the key `:widget_type`. This applies to things like the default value for a Dimension as well.
(def ^:private TagParam
  "Schema for values passed in as part of the `:template_tags` list."
  {(s/optional-key :id)          su/NonBlankString ; this is used internally by the frontend
   :name                         su/NonBlankString
   :display_name                 su/NonBlankString
   :type                         (s/enum "number" "dimension" "text" "date")
   (s/optional-key :dimension)   [s/Any]
   (s/optional-key :widget_type) su/NonBlankString ; type of the [default] value if `:type` itself is `dimension`
   (s/optional-key :required)    s/Bool
   (s/optional-key :default)     s/Any})

(def ^:private DimensionValue
  {:type                   su/NonBlankString
   :target                 s/Any
   (s/optional-key :value) s/Any}) ; not specified if the param has no value. TODO - make this stricter

(def ^:private SingleValue
  "Schema for a valid *single* value for a param. As of 0.28.0 params can either be single-value or multiple value."
  (s/cond-pre NoValue
              CommaSeparatedNumbers
              Dimension
              Date
              s/Num
              s/Str
              s/Bool))

;; Sequence of multiple values for generating a SQL IN() clause. vales
(s/defrecord ^:private MultipleValues [values :- [SingleValue]])

(def ^:private ParamValue
  "Schema for valid param value(s). Params can have one or more values."
  (s/named (s/maybe (s/cond-pre SingleValue MultipleValues))
           "Valid param value(s)"))

(def ^:private ParamValues
  {s/Keyword ParamValue})

(def ^:private ParamSnippetInfo
  {(s/optional-key :replacement-snippet)     s/Str                       ; allowed to be blank if this is an optional param
   (s/optional-key :prepared-statement-args) [s/Any]})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             PARAM INFO RESOULTION                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions build a map of information about the types and values of the params used in a query.
;; (These functions don't parse the query itself, but instead look at the values of `:template_tags` and `:parameters`
;; passed along with the query.)
;;
;;     (query->params-map some-query)
;;     ;; -> {:checkin_date {:field {:name "\date"\, :parent_id nil, :table_id 1375}
;;                           :param {:type   "\date/range"\
;;                                   :target ["\dimension"\ ["\template-tag"\ "\checkin_date"\]]
;;                                   :value  "\2015-01-01~2016-09-01"\}}}

(s/defn ^:private param-with-target
  "Return the param in PARAMS with a matching TARGET. TARGET is something like:

     [:dimension [:template-tag <param-name>]] ; for Dimensions (Field Filters)
     [:variable  [:template-tag <param-name>]] ; for other types of params"
  [params :- (s/maybe [DimensionValue]), target]
  (when-let [matching-params (seq (for [param params
                                        :when (= (:target param) target)]
                                    param))]
    ;; if there's only one matching param no need to nest it inside a vector. Otherwise return vector of params
    ((if (= (count matching-params) 1)
       first
       vec) matching-params)))


;;; Dimension Params (Field Filters) (e.g. WHERE {{x}})

(s/defn ^:private default-value-for-dimension :- (s/maybe DimensionValue)
  "Return the default value for a Dimension (Field Filter) param defined by the map TAG, if one is set."
  [tag :- TagParam]
  (when-let [default (:default tag)]
    {:type   (:widget_type tag "dimension")             ; widget_type is the actual type of the default value if set
     :target ["dimension" ["template-tag" (:name tag)]]
     :value  default}))

(s/defn ^:private dimension->field-id :- su/IntGreaterThanZero
  [dimension]
  (:field-id (ql/expand-ql-sexpr dimension)))

(s/defn ^:private dimension-value-for-tag :- (s/maybe Dimension)
  "Return the \"Dimension\" value of a param, if applicable. \"Dimension\" here means what is called a \"Field
  Filter\" in the Native Query Editor."
  [tag :- TagParam, params :- (s/maybe [DimensionValue])]
  (when-let [dimension (:dimension tag)]
    (map->Dimension {:field (or (db/select-one [Field :name :parent_id :table_id], :id (dimension->field-id dimension))
                                (throw (Exception. (str "Can't find field with ID: " (dimension->field-id dimension)))))
                     :param (or
                             ;; look in the sequence of params we were passed to see if there's anything that matches
                             (param-with-target params ["dimension" ["template-tag" (:name tag)]])
                             ;; if not, check and see if we have a default param
                             (default-value-for-dimension tag))})))


;;; Non-Dimension Params (e.g. WHERE x = {{x}})

(s/defn ^:private param-value-for-tag [tag :- TagParam, params :- (s/maybe [DimensionValue])]
  (when (not= (:type tag) "dimension")
    (:value (param-with-target params ["variable" ["template-tag" (:name tag)]]))))

(s/defn ^:private default-value-for-tag
  "Return the `:default` value for a param if no explicit values were passsed. This only applies to non-Dimension
   (non-Field Filter) params. Default values for Dimension (Field Filter) params are handled above in
   `default-value-for-dimension`."
  [{:keys [default display_name required]} :- TagParam]
  (or default
      (when required
        (throw (Exception. (format "'%s' is a required param." display_name))))))


;;; Parsing Values

(s/defn ^:private parse-number :- s/Num
  "Parse a string like `1` or `2.0` into a valid number. Done mostly to keep people from passing in
   things that aren't numbers, like SQL identifiers."
  [s :- s/Str]
  (.parse (NumberFormat/getInstance) ^String s))

(s/defn ^:private value->number :- (s/cond-pre s/Num CommaSeparatedNumbers)
  "Parse a 'numeric' param value. Normally this returns an integer or floating-point number,
   but as a somewhat undocumented feature it also accepts comma-separated lists of numbers. This was a side-effect of
   the old parameter code that unquestioningly substituted any parameter passed in as a number directly into the SQL.
   This has long been changed for security purposes (avoiding SQL injection), but since users have come to expect
   comma-separated numeric values to work we'll allow that (with validation) and return an instance of
   `CommaSeperatedNumbers`. (That is converted to SQL as a simple comma-separated list.)"
  [value]
  (cond
    ;; if not a string it's already been parsed
    (number? value) value
    ;; same goes for an instance of CommaSeperated values
    (instance? CommaSeparatedNumbers value) value
    ;; if the value is a string, then split it by commas in the string. Usually there should be none.
    ;; Parse each part as a number.
    (string? value)
    (let [parts (for [part (str/split value #",")]
                  (parse-number part))]
      (if (> (count parts) 1)
        ;; If there's more than one number return an instance of `CommaSeparatedNumbers`
        (strict-map->CommaSeparatedNumbers {:numbers parts})
        ;; otherwise just return the single number
        (first parts)))))

(s/defn ^:private parse-value-for-type :- ParamValue
  [param-type value]
  (cond
    (no-value? value)                                value
    (= param-type "number")                          (value->number value)
    (= param-type "date")                            (map->Date {:s value})
    (and (= param-type "dimension")
         (= (get-in value [:param :type]) "number")) (update-in value [:param :value] value->number)
    (sequential? value)                              (map->MultipleValues
                                                      {:values (for [v value]
                                                                 (parse-value-for-type param-type v))})
    :else                                            value))

(s/defn ^:private value-for-tag :- ParamValue
  "Given a map TAG (a value in the `:template_tags` dictionary) return the corresponding value from the PARAMS
   sequence. The VALUE is something that can be compiled to SQL via `->replacement-snippet-info`."
  [tag :- TagParam, params :- (s/maybe [DimensionValue])]
  (parse-value-for-type (:type tag) (or (param-value-for-tag tag params)
                                        (dimension-value-for-tag tag params)
                                        (default-value-for-tag tag)
                                        ;; TODO - what if value is specified but is `nil`?
                                        (NoValue.))))

(s/defn ^:private query->params-map :- ParamValues
  "Extract parameters info from QUERY. Return a map of parameter name -> value.

     (query->params-map some-query)
      ->
      {:checkin_date {:field {:name \"date\", :parent_id nil, :table_id 1375}
                      :param {:type   \"date/range\"
                              :target [\"dimension\" [\"template-tag\" \"checkin_date\"]]
                              :value  \"2015-01-01~2016-09-01\"}}}"
  [{{tags :template_tags} :native, params :parameters}]
  (into {} (for [[k tag] tags
                 :let    [v (value-for-tag tag params)]
                 :when   v]
             ;; TODO - if V is `nil` *on purpose* this still won't give us a query like `WHERE field = NULL`. That
             ;; kind of query shouldn't be possible from the frontend anyway
             {k v})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PARAM->SQL SUBSTITUTION                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions take the info for a param fetched by the functions above and add additional info about how that
;; param should be represented as SQL. (Specifically, they return information in this format:
;;
;;    {:replacement-snippet     "= ?"                  ; appropriate SQL that should be used to replace the param snippet, e.g. {{x}}
;;     :prepared-statement-args [#inst "2017-01-01"]}  ; any prepared statement args (values for `?` placeholders) needed for the replacement snippet

(defprotocol ^:private ISQLParamSubstituion
  "Protocol for specifying what SQL should be generated for parameters of various types."
  (^:private ->replacement-snippet-info [this]
   "Return information about how THIS should be converted to SQL, as a map with keys `:replacement-snippet` and `:prepared-statement-args`.

      (->replacement-snippet-info \"ABC\") -> {:replacement-snippet \"?\", :prepared-statement-args \"ABC\"}"))


(defn- relative-date-param-type? [param-type]
  (contains? #{"date/range" "date/month-year" "date/quarter-year" "date/relative" "date/all-options"} param-type))

(defn- date-param-type? [param-type]
  (str/starts-with? param-type "date/"))

;; for relative dates convert the param to a `DateRange` record type and call `->replacement-snippet-info` on it
(s/defn ^:private relative-date-dimension-value->replacement-snippet-info :- ParamSnippetInfo
  [value]
  ;; TODO - get timezone from query dict
  (-> (date-params/date-string->range value *timezone*)
      map->DateRange
      ->replacement-snippet-info))

(s/defn ^:private dimension-value->equals-clause-sql :- ParamSnippetInfo
  [value]
  (-> (->replacement-snippet-info value)
      (update :replacement-snippet (partial str "= "))))

(s/defn ^:private dimension-multiple-values->in-clause-sql :- ParamSnippetInfo
  [values]
  (-> (map->MultipleValues {:values values})
      ->replacement-snippet-info
      (update :replacement-snippet (partial format "IN (%s)"))))

(s/defn ^:private dimension->replacement-snippet-info :- ParamSnippetInfo
  "Return `[replacement-snippet & prepared-statement-args]` appropriate for a DIMENSION parameter."
  [{param-type :type, value :value} :- DimensionValue]
  (cond
    ;; convert relative dates to approprate date range representations
    (relative-date-param-type? param-type) (relative-date-dimension-value->replacement-snippet-info value)
    ;; convert all other dates to `= <date>`
    (date-param-type? param-type)          (dimension-value->equals-clause-sql (map->Date {:s value}))
    ;; for sequences of multiple values we want to generate an `IN (...)` clause
    (sequential? value)                    (dimension-multiple-values->in-clause-sql value)
    ;; convert everything else to `= <value>`
    :else                                  (dimension-value->equals-clause-sql value)))

(s/defn ^:private honeysql->replacement-snippet-info :- ParamSnippetInfo
  "Convert X to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [x]
  (let [[snippet & args] (hsql/format x, :quoting ((resolve 'metabase.driver.generic-sql/quote-style) *driver*))]
    {:replacement-snippet     snippet
     :prepared-statement-args args}))

(s/defn ^:private field->identifier :- su/NonBlankString
  "Return an approprate snippet to represent this FIELD in SQL given its param type.
   For non-date Fields, this is just a quoted identifier; for dates, the SQL includes appropriately bucketing based on
   the PARAM-TYPE."
  [field param-type]
  (-> (honeysql->replacement-snippet-info (let [identifier ((resolve 'metabase.driver.generic-sql/field->identifier) *driver* field)]
                                            (if (date-param-type? param-type)
                                              ((resolve 'metabase.driver.generic-sql/date) *driver* :day identifier)
                                              identifier)))
      :replacement-snippet))

(s/defn ^:private combine-replacement-snippet-maps :- ParamSnippetInfo
  "Combine multiple REPLACEMENT-SNIPPET-MAPS into a single map using a SQL `AND` clause."
  [replacement-snippet-maps :- [ParamSnippetInfo]]
  {:replacement-snippet     (str \( (str/join " AND " (map :replacement-snippet replacement-snippet-maps)) \))
   :prepared-statement-args (reduce concat (map :prepared-statement-args replacement-snippet-maps))})

(extend-protocol ISQLParamSubstituion
  nil     (->replacement-snippet-info [this] (honeysql->replacement-snippet-info this))
  Object  (->replacement-snippet-info [this] (honeysql->replacement-snippet-info (str this)))
  Number  (->replacement-snippet-info [this] (honeysql->replacement-snippet-info this))
  Boolean (->replacement-snippet-info [this] (honeysql->replacement-snippet-info this))
  Keyword (->replacement-snippet-info [this] (honeysql->replacement-snippet-info this))
  SqlCall (->replacement-snippet-info [this] (honeysql->replacement-snippet-info this))
  NoValue (->replacement-snippet-info [_]    {:replacement-snippet ""})

  CommaSeparatedNumbers
  (->replacement-snippet-info [{:keys [numbers]}]
    {:replacement-snippet (str/join ", " numbers)})

  MultipleValues
  (->replacement-snippet-info [{:keys [values]}]
    (let [values (map ->replacement-snippet-info values)]
      {:replacement-snippet     (str/join ", " (map :replacement-snippet values))
       :prepared-statement-args (apply concat (map :prepared-statement-args values))}))

  Date
  (->replacement-snippet-info [{:keys [s]}]
    (honeysql->replacement-snippet-info (u/->Timestamp s)))

  DateRange
  (->replacement-snippet-info [{:keys [start end]}]
    (cond
      (= start end) {:replacement-snippet "= ?",             :prepared-statement-args [(u/->Timestamp start)]}
      (nil? start)  {:replacement-snippet "< ?",             :prepared-statement-args [(u/->Timestamp end)]}
      (nil? end)    {:replacement-snippet "> ?",             :prepared-statement-args [(u/->Timestamp start)]}
      :else         {:replacement-snippet "BETWEEN ? AND ?", :prepared-statement-args [(u/->Timestamp start) (u/->Timestamp end)]}))

  ;; TODO - clean this up if possible!
  Dimension
  (->replacement-snippet-info [{:keys [field param], :as dimension}]
    (cond
      ;; if the param is `nil` just put in something that will always be true, such as `1` (e.g. `WHERE 1 = 1`)
      (nil? param) {:replacement-snippet "1 = 1"}
      ;; if we have a vector of multiple params recursively convert them to SQL and combine into an `AND` clause
      ;; (This is multiple params in the sense that the frontend provided multiple maps with param values for the same
      ;; Dimension, not in the sense that we have a single map with multiple values for `:value`.)
      (vector? param)
      (combine-replacement-snippet-maps (for [p param]
                                          (->replacement-snippet-info (assoc dimension :param p))))
      ;; otherwise convert single param to SQL.
      ;; Convert the value to a replacement snippet info map and then tack on the field identifier to the front
      :else
      (update (dimension->replacement-snippet-info param) :replacement-snippet (partial str (field->identifier field (:type param)) " ")))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PARSING THE SQL TEMPLATE                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private sql-template-parser
  (insta/parser
   "SQL := (ANYTHING_NOT_RESERVED | SINGLE_BRACKET_PLUS_ANYTHING | SINGLE_BRACE_PLUS_ANYTHING | OPTIONAL | PARAM)*

    (* Treat double brackets and braces as special, pretty much everything else is good to go *)
    <SINGLE_BRACKET_PLUS_ANYTHING> := !'[[' '[' (ANYTHING_NOT_RESERVED | ']' | SINGLE_BRACKET_PLUS_ANYTHING | SINGLE_BRACE_PLUS_ANYTHING)*
    <SINGLE_BRACE_PLUS_ANYTHING> := !'{{' '{' (ANYTHING_NOT_RESERVED | '}' | SINGLE_BRACE_PLUS_ANYTHING  | SINGLE_BRACKET_PLUS_ANYTHING)*
    <ANYTHING_NOT_RESERVED> := #'[^\\[\\]\\{\\}]+'

    (* Parameters can have whitespace, but must be word characters for the name of the parameter *)
    PARAM = <'{{'> <WHITESPACE*> TOKEN <WHITESPACE*> <'}}'>

    (* Parameters, braces and brackets are all good here, just no nesting of optional clauses *)
    OPTIONAL := <'[['> (ANYTHING_NOT_RESERVED | SINGLE_BRACKET_PLUS_ANYTHING | SINGLE_BRACE_PLUS_ANYTHING | PARAM)* <']]'>
    <TOKEN>    := #'(\\w)+'
    WHITESPACE := #'\\s+'"))

(defrecord ^:private Param [param-key sql-value prepared-statement-args])

(defn- param? [maybe-param]
  (instance? Param maybe-param))

(defn- merge-query-map [query-map node]
  (cond
    (string? node)
    (update query-map :query str node)

    (param? node)
    (-> query-map
        (update :query str (:sql-value node))
        (update :params concat (:prepared-statement-args node)))

    :else
    (-> query-map
        (update :query str (:query node))
        (update :params concat (:params node)))))

(def ^:private empty-query-map {:query "" :params []})

(defn- no-value-param? [maybe-param]
  (and (param? maybe-param)
       (no-value? (:sql-value maybe-param))))

(defn- transform-sql
  "Returns the combined query-map from all of the parameters, optional clauses etc. At this point there should not be
  a NoValue leaf. If so, it's an error (i.e. missing a required parameter."
  [param-key->value]
  (fn [& nodes]
    (doseq [maybe-param nodes
            :when (no-value-param? maybe-param)]
      (throw (ex-info (format "Unable to substitute '%s': param not specified.\nFound: %s"
                              (:param-name maybe-param) (keys param-key->value))
               {:status-code 400})))
    (-> (reduce merge-query-map empty-query-map nodes)
        (update :query str/trim))))

(defn- transform-optional
  "Converts the `OPTIONAL` clause to a query map. If one or more parameters are not populated for this optional
  clause, it will return an empty-query-map, which will be omitted from the query."
  [& nodes]
  (if (some no-value-param? nodes)
    empty-query-map
    (reduce merge-query-map empty-query-map nodes)))

(defn- transform-param
  "Converts a `PARAM` parse leaf to a query map that includes the SQL snippet to replace the `{{param}}` value and the
  param itself for the prepared statement"
  [param-key->value]
  (fn [token]
    (let [val (get param-key->value (keyword token) (NoValue.))]
      (if (no-value? val)
        (map->Param {:param-key token, :sql-value val, :prepared-statement-args []})
        (let [{:keys [replacement-snippet prepared-statement-args]} (->replacement-snippet-info val)]
          (map->Param {:param-key               token
                       :sql-value               replacement-snippet
                       :prepared-statement-args prepared-statement-args}))))))

(defn- parse-transform-map
  "Instaparse returns things like [:SQL token token token...]. This map will be used when crawling the parse tree from
  the bottom up. When encountering the a `:PARAM` node, it will invoke the included function, invoking the function
  with each item in the list as arguments "
  [param-key->value]
  {:SQL      (transform-sql param-key->value)
   :OPTIONAL transform-optional
   :PARAM    (transform-param param-key->value)})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- prepare-sql-param-for-driver [param]
  ((resolve 'metabase.driver.generic-sql/prepare-sql-param) *driver* param))

(s/defn ^:private expand-query-params
  [{sql :query, :as native}, param-key->value :- ParamValues]
  (merge native
         (-> (parse-transform-map param-key->value)
             (insta/transform (insta/parse sql-template-parser sql))
             ;; `prepare-sql-param-for-driver` can't be lazy as it needs `*driver*` to be bound
             (update :params #(mapv prepare-sql-param-for-driver %)))))

(defn- ensure-driver
  "Depending on where the query came from (the user, permissions check etc) there might not be an driver associated to
  the query. If there is no driver, use the database to find the right driver or throw."
  [{:keys [driver database] :as query}]
  (or driver
      (driver/database-id->driver database)
      (throw (IllegalArgumentException. "Could not resolve driver"))))

(defn expand
  "Expand parameters inside a *SQL* QUERY."
  [query]
  (binding [*driver*   (ensure-driver query)
            *timezone* (get-in query [:settings :report-timezone])]
    (if (driver/driver-supports? *driver* :native-query-params)
      (update query :native expand-query-params (query->params-map query))
      query)))
