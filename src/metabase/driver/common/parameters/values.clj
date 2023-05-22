(ns metabase.driver.common.parameters.values
  "These functions build a map of information about the types and values of the params used in a query. (These functions
  don't parse the query itself, but instead look at the values of `:template-tags` and `:parameters` passed along with
  the query.)

    (query->params-map some-query)
    ;; -> {\"checkin_date\" {:field {:name \"date\", :parent_id nil, :table_id 1375}
                             :param {:type   \"date/range\"
                                     :target [\"dimension\" [\"template-tag\" \"checkin_date\"]]
                                     :value  \"2015-01-01~2016-09-01\"}}}"
  (:require
   [clojure.string :as str]
   [metabase.driver.common.parameters :as params]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models.card :refer [Card]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.persisted-info :refer [PersistedInfo]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.persisted-cache :as qp.persistence]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.text NumberFormat)
   (java.util UUID)
   (metabase.driver.common.parameters CommaSeparatedNumbers FieldFilter MultipleValues ReferencedCardQuery ReferencedQuerySnippet)))

(set! *warn-on-reflection* true)

(defmulti ^:private parse-tag
  "Parse a tag by its `:type`, returning an appropriate record type such as
  `metabase.driver.common.parameters.FieldFilter`."
  {:arglists '([tag params])}
  (fn [{tag-type :type} _]
    (keyword tag-type)))

(defmethod parse-tag :default
  [{tag-type :type, :as tag} _]
  (throw (ex-info (tru "Don''t know how to parse parameter of type {0}" (pr-str tag-type))
                  {:tag tag})))

;; various schemas are used to check that various functions return things in expected formats

;; TAGS in this case are simple params like {{x}} that get replaced with a single value ("ABC" or 1) as opposed to a
;; "FieldFilter" clause like FieldFilters
;;
;; Since 'FieldFilter' are considered their own `:type` (confusingly enough, called `:dimension`), to *actually* store
;; the type of a FieldFilter look at the key `:widget-type`. This applies to things like the default value for a
;; FieldFilter as well.

(def ^:private ParsedParamValue
  "Schema for valid param value(s). Params can have one or more values."
  (s/named (s/maybe (s/cond-pre params/SingleValue MultipleValues su/Map))
           "Valid param value(s)"))

(s/defn ^:private tag-targets
  "Given a template tag, returns a set of `target` structures that can be used to target the tag.
  Potential targets look something like:

     [:dimension [:template-tag {:id <param-id>}]
     [:dimension [:template-tag <param-name>]]     ; for Field Filters

     [:variable  [:template-tag {:id <param-id>}]]
     [:variable  [:template-tag <param-name>]]     ; for other types of params

  Targeting template tags by ID is preferable (as of version 44) but targeting by name is supported for backwards
  compatibility."
  [tag :- mbql.s/TemplateTag]
  (let [target-type (case (:type tag)
                      :dimension :dimension
                      :variable)]
    #{[target-type [:template-tag (:name tag)]]
      [target-type [:template-tag {:id (:id tag)}]]}))

(s/defn ^:private tag-params
  "Return params from the provided `params` list targeting the provided `tag`."
  [tag :- mbql.s/TemplateTag params :- (s/maybe [mbql.s/Parameter])]
  (let [targets (tag-targets tag)]
    (seq (for [param params
               :when (contains? targets (:target param))]
           param))))

;;; FieldFilter Params (Field Filters) (e.g. WHERE {{x}})

(defn- missing-required-param-exception [param-display-name]
  (ex-info (tru "You''ll need to pick a value for ''{0}'' before this query can run."
                param-display-name)
           {:type qp.error-type/missing-required-parameter}))

(s/defn ^:private field-filter->field-id :- su/IntGreaterThanZero
  [field-filter]
  (second field-filter))

(s/defn ^:private field-filter-value
  "Get parameter value(s) for a Field filter. Returns map if there is a normal single value, or a vector of maps for
  multiple values."
  [tag :- mbql.s/TemplateTag params :- (s/maybe [mbql.s/Parameter])]
  (let [matching-params  (tag-params tag params)
        tag-opts         (:options tag)
        normalize-params (fn [params]
                           ;; remove `:target` which is no longer needed after this point.
                           (let [params (map #(cond-> (dissoc % :target)
                                                tag-opts (assoc :options tag-opts))
                                             params)]
                             (if (= (count params) 1)
                               (first params)
                               params)))]
    (or
     ;; if we have matching parameter(s) that all have actual values, return those.
     (when (and (seq matching-params)
                (every? :value matching-params))
       (normalize-params matching-params))
     ;; otherwise, attempt to fall back to the default value specified as part of the template tag.
     (when-let [tag-default (:default tag)]
       {:type    (:widget-type tag :dimension) ; widget-type is the actual type of the default value if set
        :options tag-opts
        :value   tag-default})
     ;; if that doesn't exist, see if the matching parameters specified default values This can be the case if the
     ;; parameters came from a Dashboard -- Dashboard parameter mappings can specify their own defaults -- but we want
     ;; the defaults specified in the template tag to take precedence if both are specified
     (when (and (seq matching-params)
                (every? :default matching-params))
       (normalize-params matching-params))
     ;; otherwise there is no value for this Field filter ("dimension"), throw Exception if this param is required,
     ;; otherwise return [[params/no-value]] to signify that
     (if (:required tag)
       (throw (missing-required-param-exception (:display-name tag)))
       params/no-value))))

(s/defmethod parse-tag :dimension :- (s/maybe FieldFilter)
  [{field-filter :dimension, :as tag} :- mbql.s/TemplateTag
   params                             :- (s/maybe [mbql.s/Parameter])]
  (params/map->FieldFilter
   {:field (let [field-id (field-filter->field-id field-filter)]
             (qp.store/fetch-and-store-fields! #{field-id})
             (or (qp.store/field field-id)
                 (throw (ex-info (tru "Can''t find field with ID: {0}" field-id)
                                 {:field-id field-id, :type qp.error-type/invalid-parameter}))))
    :value (field-filter-value tag params)}))

(s/defmethod parse-tag :card :- ReferencedCardQuery
  [{:keys [card-id], :as tag} :- mbql.s/TemplateTag _params]
  (when-not card-id
    (throw (ex-info (tru "Invalid :card parameter: missing `:card-id`")
                    {:tag tag, :type qp.error-type/invalid-parameter})))
  (let [card           (t2/select-one Card :id card-id)
        persisted-info (when (:dataset card)
                         (t2/select-one PersistedInfo :card_id card-id))
        query          (or (:dataset_query card)
                           (throw (ex-info (tru "Card {0} not found." card-id)
                                           {:card-id card-id, :tag tag, :type qp.error-type/invalid-parameter})))]
    (try
      (params/map->ReferencedCardQuery
       (let [query (assoc query :info {:card-id card-id})]
         (log/tracef "Compiling referenced query for Card %d\n%s" card-id (u/pprint-to-str query))
         (merge {:card-id card-id}
                (or (when (qp.persistence/can-substitute? card persisted-info)
                      {:query (qp.persistence/persisted-info-native-query persisted-info)})
                    (qp/compile query)))))
      (catch ExceptionInfo e
        (throw (ex-info
                (tru "The sub-query from referenced question #{0} failed with the following error: {1}"
                     (str card-id) (pr-str (.getMessage e)))
                {:card-query-error? true
                 :card-id           card-id
                 :tag               tag
                 :type              qp.error-type/invalid-parameter}
                e))))))

(s/defmethod parse-tag :snippet :- ReferencedQuerySnippet
  [{:keys [snippet-name snippet-id], :as tag} :- mbql.s/TemplateTag, _]
  (let [snippet-id (or snippet-id
                       (throw (ex-info (tru "Unable to resolve Snippet: missing `:snippet-id`")
                                       {:tag tag, :type qp.error-type/invalid-parameter})))
        snippet    (or (t2/select-one NativeQuerySnippet :id snippet-id)
                       (throw (ex-info (tru "Snippet {0} {1} not found." snippet-id (pr-str snippet-name))
                                       {:snippet-id   snippet-id
                                        :snippet-name snippet-name
                                        :tag          tag
                                        :type         qp.error-type/invalid-parameter})))]
    (params/map->ReferencedQuerySnippet
     {:snippet-id (:id snippet)
      :content    (:content snippet)})))


;;; Non-FieldFilter Params (e.g. WHERE x = {{x}})

(s/defn ^:private param-value-for-raw-value-tag
  "Get the value that should be used for a raw value (i.e., non-Field filter) template tag from `params`."
  [tag    :- mbql.s/TemplateTag
   params :- (s/maybe [mbql.s/Parameter])]
  (let [matching-param (when-let [matching-params (not-empty (tag-params tag params))]
                         ;; double-check and make sure we didn't end up with multiple mappings or something crazy like that.
                         (when (> (count matching-params) 1)
                           (throw (ex-info (tru "Error: multiple values specified for parameter; non-Field Filter parameters can only have one value.")
                                           {:type                qp.error-type/invalid-parameter
                                            :template-tag        tag
                                            :matching-parameters params})))
                         (first matching-params))]
    ;; if both the tag and the Dashboard parameter specify a default value, prefer the default value from the tag.
    (or (:value matching-param)
        (:default tag)
        (:default matching-param)
        (if (:required tag)
          (throw (missing-required-param-exception (:display-name tag)))
          params/no-value))))

(defmethod parse-tag :number
  [tag params]
  (param-value-for-raw-value-tag tag params))

(defmethod parse-tag :text
  [tag params]
  (param-value-for-raw-value-tag tag params))

(defmethod parse-tag :date
  [tag params]
  (param-value-for-raw-value-tag tag params))


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
    (number? value)
    value
    ;; same goes for an instance of CommaSeperated values
    (instance? CommaSeparatedNumbers value)
    value
    ;; newer operators use vectors as their arguments even if there's only one
    (vector? value)
    (let [values (mapv value->number value)]
      (if (next values)
        (params/map->CommaSeparatedNumbers {:numbers values})
        (first values)))
    ;; if the value is a string, then split it by commas in the string. Usually there should be none.
    ;; Parse each part as a number.
    (string? value)
    (let [parts (for [part (str/split value #",")]
                  (parse-number part))]
      (if (> (count parts) 1)
        ;; If there's more than one number return an instance of `CommaSeparatedNumbers`
        (params/map->CommaSeparatedNumbers {:numbers parts})
        ;; otherwise just return the single number
        (first parts)))))

(s/defn ^:private parse-value-for-field-type :- s/Any
  "Do special parsing for value for a (presumably textual) FieldFilter (`:type` = `:dimension`) param (i.e., attempt
  to parse it as appropriate based on the base type and semantic type of the Field associated with it). These are
  special cases for handling types that do not have an associated parameter type (such as `date` or `number`), such as
  UUID fields."
  [effective-type :- su/FieldType value]
  (cond
    (isa? effective-type :type/UUID)
    (UUID/fromString value)

    (isa? effective-type :type/Number)
    (value->number value)

    :else
    value))

(s/defn ^:private update-filter-for-field-type :- ParsedParamValue
  "Update a Field Filter with a textual, or sequence of textual, values. The base type and semantic type of the field
  are used to determine what 'semantic' type interpretation is required (e.g. for UUID fields)."
  [{field :field, {value :value} :value, :as field-filter} :- FieldFilter]
  (let [effective-type (or (:effective_type field) (:base_type field))
        new-value (cond
                    (string? value)
                    (parse-value-for-field-type effective-type value)

                    (and (sequential? value)
                         (every? string? value))
                    (mapv (partial parse-value-for-field-type effective-type) value))]
    (when (not= value new-value)
      (log/tracef "update filter for base-type: %s value: %s -> %s"
                  (pr-str effective-type) (pr-str value) (pr-str new-value)))
    (cond-> field-filter
      new-value (assoc-in [:value :value] new-value))))

(s/defn ^:private parse-value-for-type :- ParsedParamValue
  "Parse a `value` based on the type chosen for the param, such as `text` or `number`. (Depending on the type of param
  created, `value` here might be a raw value or a map including information about the Field it references as well as a
  value.) For numbers, dates, and the like, this will parse the string appropriately; for `text` parameters, this will
  additionally attempt handle special cases based on the base type of the Field, for example, parsing params for UUID
  base type Fields as UUIDs."
  [param-type :- mbql.s/TemplateTagType value]
  (cond
   (= value params/no-value)
   value

   (= param-type :number)
   (value->number value)

   (= param-type :date)
   (params/map->Date {:s value})

   ;; Field Filters
   (and (= param-type :dimension)
        (= (get-in value [:value :type]) :number))
   (update-in value [:value :value] value->number)

   (sequential? value)
   (params/map->MultipleValues {:values (for [v value]
                                         (parse-value-for-type param-type v))})

   ;; Field Filters with "special" base types
   (and (= param-type :dimension)
        (get-in value [:field :base_type]))
   (update-filter-for-field-type value)

   :else
   value))

(s/defn ^:private value-for-tag :- ParsedParamValue
  "Given a map `tag` (a value in the `:template-tags` dictionary) return the corresponding value from the `params`
   sequence. The `value` is something that can be compiled to SQL via `->replacement-snippet-info`."
  [tag :- mbql.s/TemplateTag params :- (s/maybe [mbql.s/Parameter])]
  (try
    (parse-value-for-type (:type tag) (parse-tag tag params))
    (catch Throwable e
      (throw (ex-info (tru "Error determining value for parameter {0}: {1}"
                           (pr-str (:name tag))
                           (ex-message e))
                      {:tag  tag
                       :type (or (:type (ex-data e)) qp.error-type/invalid-parameter)}
                      e)))))

(s/defn query->params-map :- {su/NonBlankString ParsedParamValue}
  "Extract parameters info from `query`. Return a map of parameter name -> value.

    (query->params-map some-query)
    ->
    {:checkin_date #t \"2019-09-19T23:30:42.233-07:00\"}"
  [{tags :template-tags, params :parameters}]
  (log/tracef "Building params map out of tags\n%s\nand params\n%s\n" (u/pprint-to-str tags) (u/pprint-to-str params))
  (try
    (into {} (for [[k tag] tags
                   :let    [v (value-for-tag tag params)]
                   :when   v]
               ;; TODO - if V is `nil` *on purpose* this still won't give us a query like `WHERE field = NULL`. That
               ;; kind of query shouldn't be possible from the frontend anyway
               (do
                 (log/tracef "Value for tag %s\n%s\n->\n%s" (pr-str k) (u/pprint-to-str tag) (u/pprint-to-str v))
                 {k v})))
    (catch Throwable e
      (throw (ex-info (tru "Error building query parameter map: {0}" (ex-message e))
                      {:type   (or (:type (ex-data e)) qp.error-type/invalid-parameter)
                       :tags   tags
                       :params params}
                      e)))))
