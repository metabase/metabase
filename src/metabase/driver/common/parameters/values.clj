(ns metabase.driver.common.parameters.values
  "These functions build a map of information about the types and values of the params used in a query. (These functions
  don't parse the query itself, but instead look at the values of `:template-tags` and `:parameters` passed along with
  the query.)

    (query->params-map some-query)
    ;; -> {\"checkin_date\" {:field {:name \"date\", :parent_id nil, :table_id 1375}
                             :param {:type   \"date/range\"
                                     :target [\"dimension\" [\"template-tag\" \"checkin_date\"]]
                                     :value  \"2015-01-01~2016-09-01\"}}}"
  (:require [clojure.string :as str]
            [metabase.driver.common.parameters :as i]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.util
             [i18n :as ui18n :refer [deferred-tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import clojure.lang.ExceptionInfo
           java.text.NumberFormat
           java.util.UUID
           [metabase.driver.common.parameters CommaSeparatedNumbers FieldFilter MultipleValues]))

(def ^:private ParamType
  (s/enum :number
          :dimension                    ; Field Filter
          :card
          :text
          :date))

;; various schemas are used to check that various functions return things in expected formats

;; TAGS in this case are simple params like {{x}} that get replaced with a single value ("ABC" or 1) as opposed to a
;; "FieldFilter" clause like FieldFilters
;;
;; Since 'FieldFilter' are considered their own `:type` (confusingly enough, called `:dimension`), to *actually* store
;; the type of a FieldFilter look at the key `:widget-type`. This applies to things like the default value for a
;; FieldFilter as well.
(def ^:private TagParam
  "Schema for a tag parameter declaration, passed in as part of the `:template-tags` list."
  (s/named
   {(s/optional-key :id)          su/NonBlankString ; this is used internally by the frontend
    :name                         su/NonBlankString
    :display-name                 su/NonBlankString
    :type                         ParamType
    (s/optional-key :dimension)   [s/Any]
    (s/optional-key :card-id)     su/IntGreaterThanZero
    (s/optional-key :widget-type) s/Keyword         ; type of the [default] value if `:type` itself is `dimension`
    (s/optional-key :required)    s/Bool
    (s/optional-key :default)     s/Any}
   "valid template-tags tag"))

(def ^:private ParsedParamValue
  "Schema for valid param value(s). Params can have one or more values."
  (s/named (s/maybe (s/cond-pre i/SingleValue MultipleValues su/Map))
           "Valid param value(s)"))

(s/defn ^:private param-with-target
  "Return the param in `params` with a matching `target`. `target` is something like:

     [:dimension [:template-tag <param-name>]] ; for FieldFilters (Field Filters)
     [:variable  [:template-tag <param-name>]] ; for other types of params"
  [params :- (s/maybe [i/ParamValue]), target]
  (when-let [matching-params (seq (for [param params
                                        :when (= (:target param) target)]
                                    param))]
    ;; if there's only one matching param no need to nest it inside a vector. Otherwise return vector of params
    ((if (= (count matching-params) 1)
       first
       vec) matching-params)))


;;; FieldFilter Params (Field Filters) (e.g. WHERE {{x}})

(defn- missing-required-param-exception [param-display-name]
  (ex-info (str (deferred-tru "You''ll need to pick a value for ''{0}'' before this query can run."
                              param-display-name))
           {:type qp.error-type/missing-required-parameter}))

(s/defn ^:private default-value-for-field-filter
  "Return the default value for a FieldFilter (`:type` = `:dimension`) param defined by the map `tag`, if one is set."
  [tag :- TagParam]
  (when (and (:required tag) (not (:default tag)))
    (throw (missing-required-param-exception (:display-name tag))))
  (when-let [default (:default tag)]
    {:type   (:widget-type tag :dimension) ; widget-type is the actual type of the default value if set
     :target [:dimension [:template-tag (:name tag)]]
     :value  default}))

(s/defn ^:private field-filter->field-id :- su/IntGreaterThanZero
  [field-filter]
  (second field-filter))

(s/defn ^:private field-filter-value-for-tag :- (s/maybe (s/cond-pre FieldFilter (s/eq i/no-value)))
  "Return the `FieldFilter` value of a param, if applicable. Field filters are referred to internally as `:dimension`s
  for historic reasons."
  [tag :- TagParam, params :- (s/maybe [i/ParamValue])]
  (when-let [field-filter (:dimension tag)]
    (i/map->FieldFilter
     ;; TODO - shouldn't this use the QP Store?
     {:field (let [field-id (field-filter->field-id field-filter)]
               (or (db/select-one [Field :name :parent_id :table_id :base_type :special_type] :id field-id)
                   (throw (ex-info (str (deferred-tru "Can''t find field with ID: {0}" field-id))
                                   {:field-id field-id, :type qp.error-type/invalid-parameter}))))
      :value (if-let [value-info-or-infos (or
                                           ;; look in the sequence of params we were passed to see if there's anything
                                           ;; that matches
                                           (param-with-target params [:dimension [:template-tag (:name tag)]])
                                           ;; if not, check and see if we have a default param
                                           (default-value-for-field-filter tag))]
               ;; `value-info` will look something like after we remove `:target` which is not needed after this point
               ;;
               ;;    {:type   :date/single
               ;;     :value  #t "2019-09-20T19:52:00.000-07:00"}
               ;;
               ;; (or it will be a vector of these maps for multiple values)
               (cond
                (map? value-info-or-infos)        (dissoc value-info-or-infos :target)
                (sequential? value-info-or-infos) (mapv #(dissoc % :target) value-info-or-infos))
               i/no-value)})))

(s/defn ^:private card-query-for-tag :- (s/maybe (s/cond-pre su/Map (s/eq i/no-value)))
  "Returns the native query for the `:card-id` referenced by the given tag."
  [tag :- TagParam, _params :- (s/maybe [i/ParamValue])]
  (when-let [card-id (:card-id tag)]
    (when-let [query (db/select-one-field :dataset_query Card :id card-id)]
      (try
       (i/map->ReferencedCardQuery
        {:card-id card-id
         :query   (:query (qp/query->native query))})
       (catch ExceptionInfo e
         (throw (ex-info
                 (str (deferred-tru
                        "The sub-query from referenced question #{0} failed with the following error: {1}"
                        (str card-id) (.getMessage e)))
                 (merge (ex-data e)
                        {:card-query-error? true
                         :card-id           card-id
                         :tag               tag}))))))))


;;; Non-FieldFilter Params (e.g. WHERE x = {{x}})

(s/defn ^:private param-value-for-tag [tag :- TagParam, params :- (s/maybe [i/ParamValue])]
  (when (not= (:type tag) :dimension)
    (:value (param-with-target params [:variable [:template-tag (:name tag)]]))))

(s/defn ^:private default-value-for-tag
  "Return the `:default` value for a param if no explicit values were passsed. This only applies to non-FieldFilter
  params. Default values for FieldFilter (Field Filter) params are handled above in `default-value-for-field-filter`."
  [{:keys [default display-name required]} :- TagParam]
  (or default
      (when required
        (throw (missing-required-param-exception display-name)))))


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
       (i/map->CommaSeparatedNumbers {:numbers parts})
       ;; otherwise just return the single number
       (first parts)))))

(s/defn ^:private parse-value-for-field-base-type :- s/Any
  "Do special parsing for value for a (presumably textual) FieldFilter (`:type` = `:dimension`) param (i.e., attempt
  to parse it as appropriate based on the base-type of the Field associated with it). These are special cases for
  handling types that do not have an associated parameter type (such as `date` or `number`), such as UUID fields."
  [base-type :- su/FieldType, special-type :- su/FieldType, value]
  (cond
   (isa? base-type :type/UUID)             (UUID/fromString value)
   (isa? special-type :type/UNIXTimestamp) value ; don't convet potentially complex values just yet
   (isa? base-type :type/Number)           (value->number value)
   :else                                   value))

(s/defn ^:private update-filter-for-base-type :- ParsedParamValue
  "Update a Field Filter with a textual, or sequence of textual, values. The base type of the field is used
  to determine what 'special' type interpretation is required (e.g. for UUID fields)."
  [field-filter :- FieldFilter]
  (let [{base-type :base_type, special-type :special_type} (:field field-filter)
        value                                              (get-in field-filter [:value :value])]
    (cond
      (string? value)
      (update-in field-filter [:value :value]
                 (partial parse-value-for-field-base-type base-type special-type))

      (and (sequential? value)
           (every? string? value))
      (assoc-in field-filter [:value :value]
                (mapv (partial parse-value-for-field-base-type base-type special-type) value))

      :else
      field-filter)))

(s/defn ^:private parse-value-for-type :- ParsedParamValue
  "Parse a `value` based on the type chosen for the param, such as `text` or `number`. (Depending on the type of param
  created, `value` here might be a raw value or a map including information about the Field it references as well as a
  value.) For numbers, dates, and the like, this will parse the string appropriately; for `text` parameters, this will
  additionally attempt handle special cases based on the base type of the Field, for example, parsing params for UUID
  base type Fields as UUIDs."
  [param-type :- ParamType, value]
  (cond
   (= value i/no-value)
   value

   (= param-type :number)
   (value->number value)

   (= param-type :date)
   (i/map->Date {:s value})

   ;; Field Filters
   (and (= param-type :dimension)
        (= (get-in value [:value :type]) :number))
   (update-in value [:value :value] value->number)

   (sequential? value)
   (i/map->MultipleValues {:values (for [v value]
                                     (parse-value-for-type param-type v))})

   ;; Field Filters with "special" base types
   (and (= param-type :dimension)
        (get-in value [:field :base_type]))
   (update-filter-for-base-type value)

   :else
   value))

(s/defn ^:private value-for-tag :- ParsedParamValue
  "Given a map `tag` (a value in the `:template-tags` dictionary) return the corresponding value from the `params`
   sequence. The `value` is something that can be compiled to SQL via `->replacement-snippet-info`."
  [tag :- TagParam, params :- (s/maybe [i/ParamValue])]
  (parse-value-for-type (:type tag) (or (param-value-for-tag tag params)
                                        (field-filter-value-for-tag tag params)
                                        (card-query-for-tag tag params)
                                        (default-value-for-tag tag)
                                        i/no-value)))

(s/defn query->params-map :- {su/NonBlankString ParsedParamValue}
  "Extract parameters info from `query`. Return a map of parameter name -> value.

    (query->params-map some-query)
    ->
    {:checkin_date #t \"2019-09-19T23:30:42.233-07:00\"}"
  [{tags :template-tags, params :parameters}]
  (try
   (into {} (for [[k tag] tags
                  :let    [v (value-for-tag tag params)]
                  :when   v]
              ;; TODO - if V is `nil` *on purpose* this still won't give us a query like `WHERE field = NULL`. That
              ;; kind of query shouldn't be possible from the frontend anyway
              {k v}))
   (catch Throwable e
     (throw (ex-info (.getMessage e)
                     {:type   (or (:type (ex-data e)) qp.error-type/invalid-parameter)
                      :tags   tags
                      :params params}
                     e)))))
