(ns metabase.util.malli.schema
  "TODO: Consider refacor this namespace by defining custom schema with [[mr/def]] instead.

  For example the PositiveInt can be defined as (mr/def ::positive-int pos-int?)
  "
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.password :as u.password]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Utils --------------------------------------------------

;;; TODO -- consider renaming this to `InstanceOfModel` to differentiate it from [[InstanceOfClass]]
(def ^{:arglists '([model])} InstanceOf
  "Helper for creating a schema to check whether something is an instance of `model`.

    (ms/defn my-fn
      [user :- (ms/InstanceOf User)]
      ...)"
  (memoize
    (fn [model]
      (mu/with-api-error-message
        [:fn
         {:error/message (format "value must be an instance of %s" (name model))}
         #(models.dispatch/instance-of? model %)]
        (deferred-tru "value must be an instance of {0}" (name model))))))

(def ^{:arglists '([^Class klass])} InstanceOfClass
  "Helper for creating schemas to check whether something is an instance of a given class."
  (memoize
    (fn [^Class klass]
      [:fn
       {:error/message (format "Instance of a %s" (.getCanonicalName klass))}
       (partial instance? klass)])))

(def ^{:arglists '([maps-schema k])} maps-with-unique-key
  "Given a schema of a sequence of maps, returns a schema that does an additional unique check on key `k`."
  (memoize
    (fn [maps-schema k]
      (mu/with-api-error-message
        [:and
         [:fn (fn [maps]
                (= (count maps)
                   (-> (map #(get % k) maps)
                       distinct
                       count)))]
         maps-schema]
        (deferred-tru "value must be seq of maps in which {0}s are unique" (name k))))))

;;; -------------------------------------------------- Schemas --------------------------------------------------

(def NonBlankString
  "Schema for a string that cannot be blank."
  (mu/with-api-error-message ::lib.schema.common/non-blank-string (deferred-tru "value must be a non-blank string.")))

(def IntGreaterThanOrEqualToZero
  "Schema representing an integer than must also be greater than or equal to zero."
  (mu/with-api-error-message
    [:int {:min 0}]
    ;; FIXME: greater than _or equal to_ zero.
    (deferred-tru "value must be an integer greater than zero.")))

(def Int
  "Schema representing an integer."
  (mu/with-api-error-message
    int?
    (deferred-tru "value must be an integer.")))

(def PositiveInt
  "Schema representing an integer than must also be greater than zero."
  (mu/with-api-error-message
    pos-int?
    (deferred-tru "value must be an integer greater than zero.")))

(def NegativeInt
  "Schema representing an integer than must be less than zero."
  (mu/with-api-error-message
    neg?
    (deferred-tru "value must be a negative integer")))

(def PositiveNum
  "Schema representing a numeric value greater than zero. This allows floating point numbers and integers."
  (mu/with-api-error-message
    [:and number? pos?]
    (deferred-tru "value must be a number greater than zero.")))

(def KeywordOrString
  "Schema for something that can be either a `Keyword` or a `String`."
  (mu/with-api-error-message
    [:or :string :keyword]
    (deferred-tru "value must be a keyword or string.")))

(def FieldType
  "Schema for a valid Field base or effective (data) type (does it derive from `:type/*`)?"
  (mu/with-api-error-message
    [:fn #(isa? % :type/*)]
    (deferred-tru "value must be a valid field type.")))

(def FieldSemanticType
  "Schema for a valid Field semantic type deriving from `:Semantic/*`."
  (mu/with-api-error-message
    [:fn #(isa? % :Semantic/*)]
    (deferred-tru "value must be a valid field semantic type.")))

(def FieldRelationType
  "Schema for a valid Field relation type deriving from `:Relation/*`"
  (mu/with-api-error-message
    [:fn #(isa? % :Relation/*)]
    (deferred-tru "value must be a valid field relation type.")))

(def FieldSemanticOrRelationType
  "Schema for a valid Field semantic *or* Relation type. This is currently needed because the `semantic_column` is used
  to store either the semantic type or relation type info. When this is changed in the future we can get rid of this
  schema. See #15486."
  (mu/with-api-error-message
    [:fn (fn [k] (or (isa? k :Semantic/*) (isa? k :Relation/*)))]
    (deferred-tru "value must be a valid field semantic or relation type.")))

(def CoercionStrategy
  "Schema for a valid Field coercion strategy (does it derive from `:Coercion/*`)?"
  (mu/with-api-error-message
    [:fn #(isa? % :Coercion/*)]
    (deferred-tru "value must be a valid coercion strategy.")))

(def FieldTypeKeywordOrString
  "Like `FieldType` (e.g. a valid derivative of `:type/*`) but allows either a keyword or a string.
   This is useful especially for validating API input or objects coming out of the DB as it is unlikely
   those values will be encoded as keywords at that point."
  (mu/with-api-error-message
    [:fn #(isa? (keyword %) :type/*)]
    (deferred-tru "value must be a valid field data type (keyword or string).")))

(def FieldSemanticTypeKeywordOrString
  "Like `FieldSemanticType` but accepts either a keyword or string."
  (mu/with-api-error-message
    [:fn #(isa? (keyword %) :Semantic/*)]
    (deferred-tru "value must be a valid field semantic type (keyword or string).")))

(def FieldRelationTypeKeywordOrString
  "Like `FieldRelationType` but accepts either a keyword or string."
  (mu/with-api-error-message
    [:fn #(isa? (keyword %) :Relation/*)]
    (deferred-tru "value must be a valid field relation type (keyword or string).")))

(def FieldSemanticOrRelationTypeKeywordOrString
  "Like `FieldSemanticOrRelationType` but accepts either a keyword or string."
  (mu/with-api-error-message
    [:fn (fn [k]
           (let [k (keyword k)]
             (or (isa? k :Semantic/*)
                 (isa? k :Relation/*))))]
    (deferred-tru "value must be a valid field semantic or relation type (keyword or string).")))

(def LegacyFieldOrExpressionReference
  "Schema for a valid legacy `:field` or `:expression` reference for API usage. TODO -- why are these passed into the
  REST API at all? MBQL clauses are not things we should ask for as API parameters."
  (mu/with-api-error-message
    [:fn (fn [k]
           ((comp (mc/validator mbql.s/Field)
                  mbql.normalize/normalize-tokens) k))]
    (deferred-tru "value must an array with :field id-or-name and an options map")))

(def CoercionStrategyKeywordOrString
  "Like `CoercionStrategy` but accepts either a keyword or string."
  (mu/with-api-error-message
    [:fn #(isa? (keyword %) :Coercion/*)]
    (deferred-tru "value must be a valid coercion strategy (keyword or string).")))

(def EntityTypeKeywordOrString
  "Validates entity type derivatives of `:entity/*`. Allows strings or keywords"
  (mu/with-api-error-message
    [:fn #(isa? (keyword %) :entity/*)]
    (deferred-tru "value must be a valid entity type (keyword or string).")))

(def Map
  "Schema for a valid map."
  (mu/with-api-error-message
    :map
    (deferred-tru "Value must be a map.")))

(def Email
  "Schema for a valid email string."
  (mu/with-api-error-message
    [:and
     :string
     [:fn u/email?]]
    (deferred-tru "value must be a valid email address.")))

(def ValidPassword
  "Schema for a valid password of sufficient complexity which is not found on a common password list."
  (mu/with-api-error-message
    [:and
     :string
     [:fn (every-pred string? #'u.password/is-valid?)]]
    (deferred-tru "password is too common.")))

(def IntString
  "Schema for a string that can be parsed as an integer.
  Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (mu/with-api-error-message
    [:and
     :string
     [:fn #(u/ignore-exceptions (Integer/parseInt %))]]
    (deferred-tru "value must be a valid integer.")))

(def IntStringGreaterThanZero
  "Schema for a string that can be parsed as an integer, and is greater than zero.
  Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (mu/with-api-error-message
    [:and
     :string
     [:fn #(u/ignore-exceptions (< 0 (Integer/parseInt %)))]]
    (deferred-tru "value must be a valid integer greater than zero.")))

(def IntStringGreaterThanOrEqualToZero
  "Schema for a string that can be parsed as an integer, and is greater than or equal to zero.
  Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (mu/with-api-error-message
    [:and
     :string
     [:fn #(u/ignore-exceptions (<= 0 (Integer/parseInt %)))]]
    (deferred-tru "value must be a valid integer greater than or equal to zero.")))

(def TemporalString
  "Schema for a string that can be parsed by date2/parse."
  (mu/with-api-error-message
    [:and
     :string
     [:fn #(u/ignore-exceptions (boolean (u.date/parse %)))]]
    (deferred-tru "value must be a valid date string")))

(def JSONString
  "Schema for a string that is valid serialized JSON."
  (mu/with-api-error-message
    [:and
     :string
     [:fn #(try
             (json/parse-string %)
             true
             (catch Throwable _
               false))]]
    (deferred-tru "value must be a valid JSON string.")))

(def ^:private keyword-or-non-blank-str-malli
  (mc/schema
    [:or :keyword NonBlankString]))

(def BooleanValue
  "Schema for a valid representation of a boolean
  (one of `\"true\"` or `true` or `\"false\"` or `false`.).
  Used by [[metabase.api.common/defendpoint]] to coerce the value for this schema to a boolean.
   Garanteed to evaluate to `true` or `false` when passed through a json decoder."
  (-> [:enum {:decode/json (fn [b] (contains? #{"true" true} b))}
       "true" "false" true false]
      (mu/with-api-error-message
       (deferred-tru "value must be a valid boolean string (''true'' or ''false'')."))))

(def MaybeBooleanValue
  "Same as above, but allows distinguishing between `nil` (the user did not specify a value)
  and `false` (the user specified `false`)."
  (-> [:enum {:decode/json (fn [b] (some->> b (contains? #{"true" true})))}
       "true" "false" true false nil]
      (mu/with-api-error-message
       (deferred-tru "value must be a valid boolean string (''true'' or ''false'')."))))

(def ValuesSourceConfig
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  (mc/schema
    [:map
     [:values {:optional true} [:* :any]]
     [:card_id {:optional true} PositiveInt]
     [:value_field {:optional true} LegacyFieldOrExpressionReference]
     [:label_field {:optional true} LegacyFieldOrExpressionReference]]))

(def RemappedFieldValue
  "Has two components:
    1. <value-of-field>          (can be anything)
    2. <value-of-remapped-field> (must be a string)"
  [:tuple :any :string])

(def NonRemappedFieldValue
  "Has one component: <value-of-field>"
  [:tuple :any])

(def FieldValuesList
  "Schema for a valid list of values for a field, in contexts where the field can have a remapped field."
  [:sequential [:or RemappedFieldValue NonRemappedFieldValue]])

(def FieldValuesResult
  "Schema for a value result of fetching the values for a field, in contexts where the field can have a remapped field."
  [:map
   [:has_more_values :boolean]
   [:values FieldValuesList]])

#_(def ParameterSource
      (mc/schema
        [:multi {:dispatch :values_source_type}
         ["card"        [:map
                         [:values_source_type :string]
                         [:values_source_config
                          [:map {:closed true}
                           [:card_id {:optional true} IntGreaterThanZero]
                           [:value_field {:optional true} Field]
                           [:label_field {:optional true} Field]]]]]
         ["static-list" [:map
                         [:values_source_type :string]
                         [:values_source_config
                          [:map {:closed true}
                           [:values {:optional true} [:* :any]]]]]]]))

(def Parameter
  "Schema for a valid Parameter.
  We're not using [metabase.legacy-mbql.schema/Parameter] here because this Parameter is meant to be used for
  Parameters we store on dashboard/card, and it has some difference with Parameter in MBQL."
  ;; TODO we could use :multi to dispatch values_source_type to the correct values_source_config
  (mu/with-api-error-message
    [:map [:id NonBlankString]
     [:type keyword-or-non-blank-str-malli]
     ;; TODO how to merge this with ParameterSource above?
     [:values_source_type {:optional true} [:enum "static-list" "card" nil]]
     [:values_source_config {:optional true} ValuesSourceConfig]
     [:slug {:optional true} :string]
     [:name {:optional true} :string]
     [:default {:optional true} :any]
     [:sectionId {:optional true} NonBlankString]
     [:temporal_units {:optional true}
      [:sequential ::lib.schema.temporal-bucketing/unit]]]
    (deferred-tru "parameter must be a map with :id and :type keys")))

(def ParameterMapping
  "Schema for a valid Parameter Mapping"
  (mu/with-api-error-message
    [:map [:parameter_id NonBlankString]
     [:target :any]
     [:card_id {:optional true} PositiveInt]]
    (deferred-tru "parameter_mapping must be a map with :parameter_id and :target keys")))

(def EmbeddingParams
  "Schema for a valid map of embedding params."
  (mu/with-api-error-message
    [:maybe [:map-of
             :keyword
             [:enum "disabled" "enabled" "locked"]]]
    (deferred-tru "value must be a valid embedding params map.")))

(def ValidLocale
  "Schema for a valid ISO Locale code e.g. `en` or `en-US`. Case-insensitive and allows dashes or underscores."
  (mu/with-api-error-message
    [:and
     NonBlankString
     [:fn i18n/available-locale?]]
    (deferred-tru "String must be a valid two-letter ISO language or language-country code e.g. 'en' or 'en_US'.")))

(def NanoIdString
  "Schema for a 21-character NanoID string, like \"FReCLx5hSWTBU7kjCWfuu\"."
  (mu/with-api-error-message
    [:re #"^[A-Za-z0-9_\-]{21}$"]
    (deferred-tru "String must be a valid 21-character NanoID string.")))

(def UUIDString
  "Schema for a UUID string"
  (mu/with-api-error-message
   [:re u/uuid-regex]
   (deferred-tru "value must be a valid UUID.")))

(defn CollectionOf
  "Helper for creating schemas to check whether something is an instance of a collection."
  [item-schema]
  [:fn
   {:error/message (format "Collection of %s" item-schema)}
   #(and (coll? %) (every? (partial mc/validate item-schema) %))])

(defn QueryVectorOf
  "Helper for creating a schema that coerces single-value to a vector. Useful for coercing query parameters."
  [schema]
  [:vector {:decode/string (fn [x] (cond (vector? x) x x [x]))} schema])

(defn MapWithNoKebabKeys
  "Helper for creating a schema to check if a map doesn't contain kebab case keys."
  []
  [:fn
   {:error/message "Map should not contain any kebab-case keys"}
   (fn [m]
     ;; reduce-kv is more efficient that iterating over (keys m). But we have to extract the underlying map from
     ;; Toucan2 Instance because it doesn't implement IKVReduce (yet).
     (let [m (if (instance? toucan2.instance.Instance m)
               (.m ^toucan2.instance.Instance m)
               m)]
       (reduce-kv (fn [_ k _]
                    (if (str/includes? k "-")
                      (reduced false)
                      true))
                  true m)))])
