(ns metabase.query-processor.middleware.parameters.sql
  "Param substitution for *SQL* queries.
   This is a new implementation, fondly referred to as 'SQL parameters 2.0', written for v0.23.0.
   The new implementation uses prepared statement args instead of substituting them directly into the query,
   and is much better-organized and better-documented."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
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
  {(s/optional-key :param-key)               s/Keyword
   (s/optional-key :original-snippet)        su/NonBlankString
   (s/optional-key :variable-snippet)        su/NonBlankString
   (s/optional-key :optional-snippet)        (s/maybe su/NonBlankString)
   (s/optional-key :replacement-snippet)     s/Str                       ; allowed to be blank if this is an optional param
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
    (instance? NoValue value)                        value
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
;;; |                                         QUERY PARSING / PARAM SNIPPETS                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions parse a query and look for param snippets, which look like:
;;
;; * {{...}} (required)
;; * [[...{{...}}...]] (optional)
;;
;; and creates a list of these snippets, keeping the original order.
;;
;; The details maps returned have the format:
;;
;;    {:param-key        :timestamp                           ; name of the param being replaced
;;     :original-snippet "[[AND timestamp < {{timestamp}}]]"  ; full text of the snippet to be replaced
;;     :optional-snippet "AND timestamp < {{timestamp}}"      ; portion of the snippet inside [[optional]] brackets, or `nil` if the snippet isn't optional
;;     :variable-snippet "{{timestamp}}"}                     ; portion of the snippet referencing the variable itself, e.g. {{x}}

(s/defn ^:private param-snippet->param-name :- s/Keyword
  "Return the keyword name of the param being referenced inside PARAM-SNIPPET.

     (param-snippet->param-name \"{{x}}\") -> :x"
  [param-snippet :- su/NonBlankString]
  (keyword (second (re-find #"\{\{\s*(\w+)\s*\}\}" param-snippet))))

(s/defn ^:private sql->params-snippets-info :- [ParamSnippetInfo]
  "Return a sequence of maps containing information about the param snippets found by paring SQL."
  [sql :- su/NonBlankString]
  (for [[param-snippet optional-replacement-snippet] (re-seq #"(?:\[\[(.+?)\]\])|(?:\{\{\s*\w+\s*\}\})" sql)]
    {:param-key        (param-snippet->param-name param-snippet)
     :original-snippet  param-snippet
     :variable-snippet (re-find #"\{\{\s*\w+\s*\}\}" param-snippet)
     :optional-snippet optional-replacement-snippet}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              PARAMS DETAILS LIST                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions combine the info from the other 3 stages (Param Info Resolution, Param->SQL Substitution, and Query
;; Parsing) and create a sequence of maps containing param details that has all the information needed to do SQL
;; substituion. This sequence is returned in the same order as params encountered in the
;;
;; original query, making passing prepared statement args simple
;;
;; The details maps returned have the format:
;;
;;    {:original-snippet        "[[AND timestamp < {{timestamp}}]]"  ; full text of the snippet to be replaced
;;     :replacement-snippet     "AND timestamp < ?"                  ; full text that the snippet should be replaced with
;;     :prepared-statement-args [#inst "2016-01-01"]}                ; prepared statement args needed by the replacement snippet
;;
;; (Basically these functions take `:param-key`, `:optional-snippet`, and `:variable-snippet` from the Query Parsing stage and the info from the other stages
;; to add the appropriate info for `:replacement-snippet` and `:prepared-statement-args`.)

(s/defn ^:private snippet-value :- ParamValue
  "Fetch the value from PARAM-KEY->VALUE for SNIPPET-INFO.
   If no value is specified, return `NoValue` if the snippet is optional; otherwise throw an Exception."
  [{:keys [param-key optional-snippet]} :- ParamSnippetInfo, param-key->value :- ParamValues]
  (u/prog1 (get param-key->value param-key (NoValue.))
    ;; if ::no-value was specified an the param is not [[optional]], throw an exception
    (when (and (instance? NoValue <>)
               (not optional-snippet))
      (throw (ex-info (format "Unable to substitute '%s': param not specified.\nFound: %s" param-key (keys param-key->value))
               {:status-code 400})))))

(s/defn ^:private handle-optional-snippet :- ParamSnippetInfo
  "Create the approprate `:replacement-snippet` for PARAM, combining the value of REPLACEMENT-SNIPPET from the Param->SQL Substitution phase
   with the OPTIONAL-SNIPPET, if any."
  [{:keys [variable-snippet optional-snippet replacement-snippet prepared-statement-args], :as snippet-info} :- ParamSnippetInfo]
  (assoc snippet-info
    :replacement-snippet     (cond
                               (not optional-snippet)    replacement-snippet                                                 ; if there is no optional-snippet return replacement as-is
                               (seq replacement-snippet) (str/replace optional-snippet variable-snippet replacement-snippet) ; if replacement-snippet is non blank splice into optional-snippet
                               :else                     "")                                                                 ; otherwise return blank replacement (i.e. for NoValue)
    ;; for every thime the `variable-snippet` occurs in the `optional-snippet` we need to supply an additional set of `prepared-statment-args`
    ;; e.g. [[ AND ID = {{id}} OR USER_ID = {{id}} ]] should have *2* sets of the prepared statement args for {{id}} since it occurs twice
    :prepared-statement-args (if-let [occurances (u/occurances-of-substring optional-snippet variable-snippet)]
                               (apply concat (repeat occurances prepared-statement-args))
                               prepared-statement-args)))

(s/defn ^:private add-replacement-snippet-info :- [ParamSnippetInfo]
  "Add `:replacement-snippet` and `:prepared-statement-args` info to the maps in PARAMS-SNIPPETS-INFO by looking at
   PARAM-KEY->VALUE and using the Param->SQL substituion functions."
  [params-snippets-info :- [ParamSnippetInfo], param-key->value :- ParamValues]
  (for [snippet-info params-snippets-info]
    (handle-optional-snippet
     (merge snippet-info
            (s/validate ParamSnippetInfo (->replacement-snippet-info (snippet-value snippet-info param-key->value)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 SUBSTITUITION                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions take the information about parameters from the Params Details List functions and then convert the
;; original SQL Query into a SQL query with appropriate subtitutions and a sequence of prepared statement args

(s/defn ^:private substitute-one
  [sql :- su/NonBlankString, {:keys [original-snippet replacement-snippet]} :- ParamSnippetInfo]
  (str/replace-first sql original-snippet replacement-snippet))


(s/defn ^:private substitute :- {:query su/NonBlankString, :params [s/Any]}
  "Using the PARAM-SNIPPET-INFO built from the stages above, replace the snippets in SQL and return a vector of
   `[sql & prepared-statement-params]`."
  {:style/indent 1}
  [sql :- su/NonBlankString, param-snippets-info :- [ParamSnippetInfo]]
  (log/debug (format "PARAM INFO: %s\n%s" (u/emoji "🔥") (u/pprint-to-str 'yellow param-snippets-info)))
  (loop [sql sql, prepared-statement-args [], [snippet-info & more] param-snippets-info]
    (if-not snippet-info
      {:query (str/trim sql), :params (for [arg prepared-statement-args]
                                        ((resolve 'metabase.driver.generic-sql/prepare-sql-param) *driver* arg))}
      (recur (substitute-one sql snippet-info)
             (concat prepared-statement-args (:prepared-statement-args snippet-info))
             more))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private expand-query-params
  [{sql :query, :as native}, param-key->value :- ParamValues]
  (merge native (when-let [param-snippets-info (seq (add-replacement-snippet-info (sql->params-snippets-info sql) param-key->value))]
                  (substitute sql param-snippets-info))))

(defn expand
  "Expand parameters inside a *SQL* QUERY."
  [query]
  (binding [*driver*   (:driver query)
            *timezone* (get-in query [:settings :report-timezone])]
    (update query :native expand-query-params (query->params-map query))))
