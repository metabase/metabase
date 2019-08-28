(ns metabase.query-processor.middleware.parameters.sql
  "Param substitution for *SQL* queries.
   This is a new implementation, fondly referred to as 'SQL parameters 2.0', written for v0.23.0.
   The new implementation uses prepared statement args instead of substituting them directly into the query,
   and is much better-organized and better-documented."
  (:require [clojure.string :as str]
            [honeysql.core :as hsql]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.driver.sql :as sql]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.field :as field :refer [Field]]
            [metabase.query-processor.middleware.parameters.dates :as date-params]
            [metabase.util
             [date :as du]
             [i18n :as ui18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import clojure.lang.Keyword
           honeysql.types.SqlCall
           java.text.NumberFormat
           java.util.regex.Pattern
           java.util.UUID
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

;; Various record types below are used as a convenience for differentiating the different param types.

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

(def ^:private ParamType
  (s/enum :number :dimension :text :date))

;; various schemas are used to check that various functions return things in expected formats

;; TAGS in this case are simple params like {{x}} that get replaced with a single value ("ABC" or 1) as opposed to a
;; "FieldFilter" clause like Dimensions
;;
;; Since 'Dimension' (Field Filters) are considered their own `:type`, to *actually* store the type of a Dimension
;; look at the key `:widget-type`. This applies to things like the default value for a Dimension as well.
(def ^:private TagParam
  "Schema for values passed in as part of the `:template-tags` list."
  {(s/optional-key :id)          su/NonBlankString ; this is used internally by the frontend
   :name                         su/NonBlankString
   :display-name                 su/NonBlankString
   :type                         ParamType
   (s/optional-key :dimension)   [s/Any]
   (s/optional-key :widget-type) s/Keyword ; type of the [default] value if `:type` itself is `dimension`
   (s/optional-key :required)    s/Bool
   (s/optional-key :default)     s/Any})

(def ^:private DimensionValue
  {:type                     s/Keyword ; TODO - what types are allowed? :text, ...?
   :target                   s/Any
   ;; not specified if the param has no value. TODO - make this stricter
   (s/optional-key :value)   s/Any
   ;; The following are not used by the code in this namespace but may or may not be specified depending on what the
   ;; code that constructs the query params is doing. We can go ahead and ignore these when present.
   (s/optional-key :slug)    su/NonBlankString
   (s/optional-key :name)    su/NonBlankString
   (s/optional-key :default) s/Any
   (s/optional-key :id)      s/Any}) ; used internally by the frontend

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
  {su/NonBlankString ParamValue})

(def ^:private ParamSnippetInfo
  {(s/optional-key :replacement-snippet)     s/Str     ; allowed to be blank if this is an optional param
   (s/optional-key :prepared-statement-args) [s/Any]})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             PARAM INFO RESOULTION                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These functions build a map of information about the types and values of the params used in a query.
;; (These functions don't parse the query itself, but instead look at the values of `:template-tags` and `:parameters`
;; passed along with the query.)
;;
;;     (query->params-map some-query)
;;     ;; -> {"checkin_date" {:field {:name "\date"\, :parent_id nil, :table_id 1375}
;;                            :param {:type   "\date/range"\
;;                                    :target ["\dimension"\ ["\template-tag"\ "\checkin_date"\]]
;;                                    :value  "\2015-01-01~2016-09-01"\}}}

(s/defn ^:private param-with-target
  "Return the param in `params` with a matching `target`. `target` is something like:

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
  (when (and (:required tag) (not (:default tag)))
    (throw (Exception. (tru "''{0}'' is a required param." (:display-name tag)))))
  (when-let [default (:default tag)]
    {:type   (:widget-type tag :dimension)             ; widget-type is the actual type of the default value if set
     :target [:dimension [:template-tag (:name tag)]]
     :value  default}))

(s/defn ^:private dimension->field-id :- su/IntGreaterThanZero
  [dimension]
  (second dimension))

(s/defn ^:private dimension-value-for-tag :- (s/maybe Dimension)
  "Return the \"Dimension\" value of a param, if applicable. \"Dimension\" here means what is called a \"Field
  Filter\" in the Native Query Editor."
  [tag :- TagParam, params :- (s/maybe [DimensionValue])]
  (when-let [dimension (:dimension tag)]
    (map->Dimension {:field (or (db/select-one [Field :name :parent_id :table_id :base_type],
                                  :id (dimension->field-id dimension))
                                (throw (Exception. (tru "Can't find field with ID: {0}"
                                                        (dimension->field-id dimension)))))
                     :param (or
                             ;; look in the sequence of params we were passed to see if there's anything that matches
                             (param-with-target params [:dimension [:template-tag (:name tag)]])
                             ;; if not, check and see if we have a default param
                             (default-value-for-dimension tag))})))


;;; Non-Dimension Params (e.g. WHERE x = {{x}})

(s/defn ^:private param-value-for-tag [tag :- TagParam, params :- (s/maybe [DimensionValue])]
  (when (not= (:type tag) :dimension)
    (:value (param-with-target params [:variable [:template-tag (:name tag)]]))))

(s/defn ^:private default-value-for-tag
  "Return the `:default` value for a param if no explicit values were passsed. This only applies to non-Dimension
   (non-Field Filter) params. Default values for Dimension (Field Filter) params are handled above in
   `default-value-for-dimension`."
  [{:keys [default display-name required]} :- TagParam]
  (or default
      (when required
        (throw (Exception. (tru "''{0}'' is a required param." display-name))))))


;;; Parsing Values

(s/defn ^:private parse-number :- s/Num
  "Parse a string like `1` or `2.0` into a valid number. Done mostly to keep people from passing in
   things that aren't numbers, like SQL identifiers."
  [s :- s/Str]
  (.parse (NumberFormat/getInstance) ^String s))

(s/defn ^:private value->number :- (s/cond-pre s/Num CommaSeparatedNumbers)
  "Parse a 'numeric' param value. Normally this returns an integer or floating-point number, but as a somewhat
  undocumented feature it also accepts comma-separated lists of numbers. This was a side-effect of the old parameter
  code that unquestioningly substituted any parameter passed in as a number directly into the SQL. This has long been
  changed for security purposes (avoiding SQL injection), but since users have come to expect comma-separated numeric
  values to work we'll allow that (with validation) and return an instance of `CommaSeperatedNumbers`. (That is
  converted to SQL as a simple comma-separated list.)"
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

(s/defn ^:private parse-value-for-field-base-type :- s/Any
  "Do special parsing for value for a (presumably textual) FieldFilter 'dimension' param (i.e., attempt to parse it as
  appropriate based on the base-type of the Field associated with it). These are special cases for handling types that
  do not have an associated parameter type (such as `date` or `number`), such as UUID fields."
  [base-type :- su/FieldType, value]
  (cond
    (isa? base-type :type/UUID) (UUID/fromString value)
    (isa? base-type :type/Number) (value->number value)
    :else                       value))

(s/defn ^:private parse-value-for-type :- ParamValue
  "Parse a `value` based on the type chosen for the param, such as `text` or `number`. (Depending on the type of param
  created, `value` here might be a raw value or a map including information about the Field it references as well as a
  value.) For numbers, dates, and the like, this will parse the string appropriately; for `text` parameters, this will
  additionally attempt handle special cases based on the base type of the Field, for example, parsing params for UUID
  base type Fields as UUIDs."
  [param-type :- ParamType, value]
  (cond
    (no-value? value)
    value

    (= param-type :number)
    (value->number value)

    (= param-type :date)
    (map->Date {:s value})

    (and (= param-type :dimension)
         (= (get-in value [:param :type]) :number))
    (update-in value [:param :value] value->number)

    (sequential? value)
    (map->MultipleValues {:values (for [v value]
                                    (parse-value-for-type param-type v))})

    (and (= param-type :dimension)
         (get-in value [:field :base_type])
         (string? (get-in value [:param :value])))
    (update-in value [:param :value] (partial parse-value-for-field-base-type (get-in value [:field :base_type])))

    :else
    value))

(s/defn ^:private value-for-tag :- ParamValue
  "Given a map TAG (a value in the `:template-tags` dictionary) return the corresponding value from the `params`
   sequence. The VALUE is something that can be compiled to SQL via `->replacement-snippet-info`."
  [tag :- TagParam, params :- (s/maybe [DimensionValue])]
  (parse-value-for-type (:type tag) (or (param-value-for-tag tag params)
                                        (dimension-value-for-tag tag params)
                                        (default-value-for-tag tag)
                                        ;; TODO - what if value is specified but is `nil`?
                                        (NoValue.))))

(s/defn ^:private query->params-map :- ParamValues
  "Extract parameters info from `query`. Return a map of parameter name -> value.

     (query->params-map some-query)
      ->
      {:checkin_date {:field {:name \"date\", :parent_id nil, :table_id 1375}
                      :param {:type   :date/range
                              :target [:dimension [:template-tag \"checkin_date\"]]
                              :value  \"2015-01-01~2016-09-01\"}}}"
  [{{tags :template-tags} :native, params :parameters}]
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
   "Return information about how THIS should be converted to SQL, as a map with keys `:replacement-snippet` and
   `:prepared-statement-args`.

      (->replacement-snippet-info \"ABC\") -> {:replacement-snippet \"?\", :prepared-statement-args \"ABC\"}"))


(defn- relative-date-param-type? [param-type]
  (contains? #{:date/range :date/month-year :date/quarter-year :date/relative :date/all-options} param-type))

;; for relative dates convert the param to a `DateRange` record type and call `->replacement-snippet-info` on it
(s/defn ^:private relative-date-dimension-value->replacement-snippet-info :- ParamSnippetInfo
  [value]
  ;; TODO - get timezone from query dict
  (-> (date-params/date-string->range value (.getID du/*report-timezone*))
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
  "Return `[replacement-snippet & prepared-statement-args]` appropriate for a `dimension` parameter."
  [{param-type :type, value :value} :- DimensionValue]
  (cond
    ;; convert relative dates to approprate date range representations
    (relative-date-param-type? param-type) (relative-date-dimension-value->replacement-snippet-info value)
    ;; convert all other dates to `= <date>`
    (date-params/date-type? param-type)    (dimension-value->equals-clause-sql (map->Date {:s value}))
    ;; for sequences of multiple values we want to generate an `IN (...)` clause
    (sequential? value)                    (dimension-multiple-values->in-clause-sql value)
    ;; convert everything else to `= <value>`
    :else                                  (dimension-value->equals-clause-sql value)))

(s/defn ^:private honeysql->replacement-snippet-info :- ParamSnippetInfo
  "Convert `x` to a replacement snippet info map by passing it to HoneySQL's `format` function."
  [x]
  (let [[snippet & args] (hsql/format x, :quoting (sql.qp/quote-style driver/*driver*), :allow-dashed-names? true)]
    {:replacement-snippet     snippet
     :prepared-statement-args args}))

(s/defn ^:private field->identifier :- su/NonBlankString
  "Return an approprate snippet to represent this `field` in SQL given its param type.
   For non-date Fields, this is just a quoted identifier; for dates, the SQL includes appropriately bucketing based on
   the `param-type`."
  [field param-type]
  (:replacement-snippet
   (honeysql->replacement-snippet-info
    (let [identifier (sql.qp/->honeysql driver/*driver* (sql.qp/field->identifier driver/*driver* field))]
      (if (date-params/date-type? param-type)
        (sql.qp/date driver/*driver* :day identifier)
        identifier)))))

(s/defn ^:private combine-replacement-snippet-maps :- ParamSnippetInfo
  "Combine multiple `replacement-snippet-maps` into a single map using a SQL `AND` clause."
  [replacement-snippet-maps :- [ParamSnippetInfo]]
  {:replacement-snippet     (str \( (str/join " AND " (map :replacement-snippet replacement-snippet-maps)) \))
   :prepared-statement-args (reduce concat (map :prepared-statement-args replacement-snippet-maps))})

(defn- create-replacement-snippet [nil-or-obj]
  (let [{:keys [sql-string param-values]} (sql/->prepared-substitution driver/*driver* nil-or-obj)]
    {:replacement-snippet     sql-string
     :prepared-statement-args param-values}))

(defn- prepared-ts-subs [operator date-str]
  (let [{:keys [sql-string param-values]} (sql/->prepared-substitution driver/*driver* (du/->Timestamp date-str))]
    {:replacement-snippet     (str operator " " sql-string)
     :prepared-statement-args param-values}))

(extend-protocol ISQLParamSubstituion
  nil     (->replacement-snippet-info [this] (create-replacement-snippet this))
  Object  (->replacement-snippet-info [this] (create-replacement-snippet (str this)))
  Number  (->replacement-snippet-info [this] (create-replacement-snippet this))
  Boolean (->replacement-snippet-info [this] (create-replacement-snippet this))
  Keyword (->replacement-snippet-info [this] (create-replacement-snippet this))
  SqlCall (->replacement-snippet-info [this] (create-replacement-snippet this))
  UUID    (->replacement-snippet-info [this] {:replacement-snippet (format "CAST('%s' AS uuid)" (str this))})
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
    (create-replacement-snippet (du/->Timestamp s)))

  DateRange
  (->replacement-snippet-info [{:keys [start end]}]
    (cond
      (= start end)
      (prepared-ts-subs \= start)

      (nil? start)
      (prepared-ts-subs \< end)

      (nil? end)
      (prepared-ts-subs \> start)

      :else
      (let [params (map (comp #(sql/->prepared-substitution driver/*driver* %) du/->Timestamp) [start end])]
        {:replacement-snippet     (apply format "BETWEEN %s AND %s" (map :sql-string params)),
         :prepared-statement-args (vec (mapcat :param-values params))})))

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
      (update (dimension->replacement-snippet-info param)
              :replacement-snippet (partial str (field->identifier field (:type param)) " ")))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PARSING THE SQL TEMPLATE                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

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

(defn- quoted-re-pattern [s]
  (-> s Pattern/quote re-pattern))

(defn- split-delimited-string
  "Interesting parts of the SQL string (vs. parts that are just passed through) are delimited, i.e. {{something}}. This
  function takes a `delimited-begin` and `delimited-end` regex and uses that to separate the string. Returns a map
  with the prefix (the string leading up to the first `delimited-begin`) and `:delimited-strings` as a seq of maps
  where `:delimited-body` is what's in-between the delimited marks (i.e. foo in {{foo}} and then a suffix, which is
  the characters after the trailing delimiter but before the next occurrence of the `delimited-end`."
  [delimited-begin delimited-end s]
  (let [begin-pattern                (quoted-re-pattern delimited-begin)
        end-pattern                  (quoted-re-pattern delimited-end)
        [prefix & segmented-strings] (str/split s begin-pattern)]
    (when-let [^String msg (and (seq segmented-strings)
                                (not-every? #(str/index-of % delimited-end) segmented-strings)
                                (tru "Found ''{0}'' with no terminating ''{1}'' in query ''{2}''"
                                     delimited-begin delimited-end s))]
      (throw (IllegalArgumentException. msg)))
    {:prefix            prefix
     :delimited-strings (for [segmented-string segmented-strings
                              :let             [[token-str & rest-of-segment] (str/split segmented-string end-pattern)]]
                          {:delimited-body token-str
                           :suffix         (apply str rest-of-segment)})}))

(s/defn ^:private token->param :- Param
  "Given a `token` and `param-key->value` return a `Param`. If no parameter value is found, return a `NoValue` param"
  [token :- su/NonBlankString, param-key->value :- ParamValues]
  (let [val                               (get param-key->value token (NoValue.))
        {:keys [replacement-snippet
                prepared-statement-args]} (->replacement-snippet-info val)]
    (map->Param (merge {:param-key token}
                       (if (no-value? val)
                         {:sql-value val, :prepared-statement-args []}
                         {:sql-value               replacement-snippet
                          :prepared-statement-args prepared-statement-args})))))

(s/defn ^:private parse-params
  "Parse `s` for any parameters. Returns a seq of strings and `Param` instances"
  [s :- s/Str, param-key->value :- ParamValues]
  (let [{:keys [prefix delimited-strings]} (split-delimited-string "{{" "}}" s)]
    (cons prefix
          (mapcat (fn [{:keys [delimited-body suffix]}]
                    [(-> delimited-body
                         str/trim
                         (token->param param-key->value))
                     suffix])
                  delimited-strings))))

(s/defn ^:private parse-params-or-throw
  "Same as `parse-params` but will throw an exception if there are any `NoValue` parameters"
  [s :- s/Str, param-key->value :- ParamValues]
  (let [results (parse-params s param-key->value)]
    (if-let [{:keys [param-key]} (m/find-first no-value-param? results)]
      (throw (ui18n/ex-info (tru "Unable to substitute ''{0}'': param not specified.\nFound: {1}"
                                 (name param-key) (pr-str (map name (keys param-key->value))))
               {:status-code 400}))
      results)))

(def ^:private ParseTemplateResponse
  {:query  s/Str
   :params [s/Any]})

(defn- parse-one-optional-param
  "Parse a single optional param."
  [param-key->value {:keys [delimited-body suffix]}]
  (let [optional-clause (parse-params delimited-body param-key->value)]
    (if (some no-value-param? optional-clause)
      (parse-params-or-throw suffix param-key->value)
      (concat optional-clause (parse-params-or-throw suffix param-key->value)))))

(s/defn ^:private parse-optional-params :- ParseTemplateResponse
  "Attempts to parse SQL parameter string `s`. Parses any optional clauses or parameters found, returns a query map."
  [s :- s/Str, param-key->value :- ParamValues]
  (let [{:keys [prefix delimited-strings]} (split-delimited-string "[[" "]]" s)
        parsed                             (apply
                                            concat
                                            (parse-params-or-throw prefix param-key->value)
                                            (for [parsed-delimited-string delimited-strings]
                                              (parse-one-optional-param param-key->value parsed-delimited-string)))]
    (reduce merge-query-map empty-query-map parsed)))

(s/defn ^:private parse-template :- ParseTemplateResponse
  [sql :- s/Str, param-key->value :- ParamValues]
  (-> sql
      (parse-optional-params param-key->value)
      (update :query str/trim)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private expand-query-params
  [{sql :query, :as native} :- {:query s/Str, s/Keyword s/Any}, param-key->value :- ParamValues]
  (-> native
      (merge (parse-template sql param-key->value))
      (dissoc :template-tags)))

(s/defn expand
  "Expand parameters inside a *SQL* `query`."
  ([query :- {:native su/Map, s/Keyword s/Any}]
   (if (driver/supports? driver/*driver* :native-parameters)
     (update query :native expand-query-params (query->params-map query))
     query))

  ;; HACK - all this code is written expecting `:parameters` to be a top-level key; to support parameters in source
  ;; queries (especially for GTAPs) we need `:parameters` to be in the same level as the query they affect; so move
  ;; passed parameters to the top-level until we get a chance to fix this.
  ([query parameters]
   (-> (assoc query :parameters parameters)
       expand
       (dissoc query :parameters))))
