(ns metabase.util.malli.schema
  (:require
   [cheshire.core :as json]
   [malli.core :as mc]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.password :as u.password]
   [schema.core :as s]))

;;; -------------------------------------------------- Utils --------------------------------------------------

(defn InstanceOf
  "Helper for creating a schema to check whether something is an instance of `model`.

    (ms/defn my-fn
      [user :- (ms/InstanceOf User)]
      ...)"
  [model]
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be an instance of {0}" (name model)))}
     #(models.dispatch/instance-of? model %)]))

;;; -------------------------------------------------- Schemas --------------------------------------------------

(def NonBlankString
  "Schema for a string that cannot be blank."
  (mc/schema
    [:string {:min 1}]))

(def IntGreaterThanOrEqualToZero
  "Schema representing an integer than must also be greater than or equal to zero."
  (mc/schema
    [:int {:min 0}]))

;; TODO - rename this to `PositiveInt`?
(def IntGreaterThanZero
  "Schema representing an integer than must also be greater than zero."
  (mc/schema
    [:int {:min      1
           :error/fn (fn [_ _] (deferred-tru "value must be an integer greater than zero."))}]))

(def PositiveNum
  "Schema representing a numeric value greater than zero. This allows floating point numbers and integers."
  (mc/schema
    [pos? {:error/fn (fn [_ _] (deferred-tru "value must be a number greater than zero."))}]))

(def KeywordOrString
  "Schema for something that can be either a `Keyword` or a `String`."
  (mc/schema
    [:or {:error/fn (fn [_ _] (deferred-tru "value must be a keyword or string."))}
     :string :keyword]))

(def FieldType
  "Schema for a valid Field base or effective (data) type (does it derive from `:type/*`)?"
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field type."))}
     #(isa? % :type/*)]))

(def FieldSemanticType
  "Schema for a valid Field semantic type deriving from `:Semantic/*`."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field semantic type."))}
     #(isa? % :Semantic/*)]))

(def FieldRelationType
  "Schema for a valid Field relation type deriving from `:Relation/*`"
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field relation type."))}
     #(isa? % :Relation/*)]))

(def FieldSemanticOrRelationType
  "Schema for a valid Field semantic *or* Relation type. This is currently needed because the `semantic_column` is used
  to store either the semantic type or relation type info. When this is changed in the future we can get rid of this
  schema. See #15486."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field semantic or relation type."))}
     (fn [k] (or (isa? k :Semantic/*) (isa? k :Relation/*)))]))

(def CoercionStrategy
  "Schema for a valid Field coercion strategy (does it derive from `:Coercion/*`)?"
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid coercion strategy."))}
     #(isa? % :Coercion/*)]))

(def FieldTypeKeywordOrString
  "Like `FieldType` (e.g. a valid derivative of `:type/*`) but allows either a keyword or a string.
   This is useful especially for validating API input or objects coming out of the DB as it is unlikely
   those values will be encoded as keywords at that point."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field data type (keyword or string)."))}
     #(isa? (keyword %) :type/*)]))

(def FieldSemanticTypeKeywordOrString
  "Like `FieldSemanticType` but accepts either a keyword or string."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field semantic type (keyword or string)."))}
     #(isa? (keyword %) :Semantic/*)]))

(def FieldRelationTypeKeywordOrString
  "Like `FieldRelationType` but accepts either a keyword or string."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field relation type (keyword or string)."))}
     #(isa? (keyword %) :Relation/*)]))

(def FieldSemanticOrRelationTypeKeywordOrString
  "Like `FieldSemanticOrRelationType` but accepts either a keyword or string."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid field semantic or relation type (keyword or string)."))}
     (fn [k]
       (let [k (keyword k)]
         (or (isa? k :Semantic/*)
             (isa? k :Relation/*))))]))

(def Field
  "Schema for a valid Field for API usage."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must an array with :field id-or-name and an options map"))}
     (fn [k]
       ((comp (complement (s/checker mbql.s/Field))
              mbql.normalize/normalize-tokens) k))]))

(def CoercionStrategyKeywordOrString
  "Like `CoercionStrategy` but accepts either a keyword or string."
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid coercion strategy (keyword or string)."))}
     #(isa? (keyword %) :Coercion/*)]))

(def EntityTypeKeywordOrString
  "Validates entity type derivatives of `:entity/*`. Allows strings or keywords"
  (mc/schema
    [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid entity type (keyword or string)."))}
     #(isa? (keyword %) :entity/*)]))

(def Map
  "Schema for a valid map."
  (mc/schema
    [:map {:error/fn (fn [_ _] (deferred-tru "Value must be a map."))}]))

(def Email
  "Schema for a valid email string."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid email address."))}
      u/email?]]))

(def ValidPassword
  "Schema for a valid password of sufficient complexity which is not found on a common password list."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "password is too common."))}
      u.password/is-valid?]]))

(def IntString
  "Schema for a string that can be parsed as an integer.
  Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid integer."))}
      #(u/ignore-exceptions (Integer/parseInt %))]]))

(def IntStringGreaterThanZero
  "Schema for a string that can be parsed as an integer, and is greater than zero.
  Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid integer greater than zero."))}
      #(u/ignore-exceptions (< 0 (Integer/parseInt %)))]]))

(def IntStringGreaterThanOrEqualToZero
  "Schema for a string that can be parsed as an integer, and is greater than or equal to zero.
  Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid integer greater than or equal to zero."))}
      #(u/ignore-exceptions (<= 0 (Integer/parseInt %)))]]))

(def BooleanString
  "Schema for a string that is a valid representation of a boolean (either `true` or `false`).
  Something that adheres to this schema is guaranteed to to work with `Boolean/parseBoolean`."
  (mc/schema
    [:enum "true" "false"]))

(def TemporalString
  "Schema for a string that can be parsed by date2/parse."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid date string"))}
      #(u/ignore-exceptions (boolean (u.date/parse %)))]]))

(def JSONString
  "Schema for a string that is valid serialized JSON."
  (mc/schema
    [:and
     :string
     [:fn {:error/fn (fn [_ _] (deferred-tru "value must be a valid JSON string."))}
      #(try
         (json/parse-string %)
         true
         (catch Throwable _
           false))]]))

(def ^:private keyword-or-non-blank-str-malli
  (mc/schema
    [:or :keyword NonBlankString]))

(def ValuesSourceConfig
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  (mc/schema
    [:map
     [:values {:optional true} [:* :any]]
     [:card_id {:optional true} IntGreaterThanZero]
     [:value_field {:optional true} Field]
     [:label_field {:optional true} Field]]))

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
  We're not using [metabase.mbql.schema/Parameter] here because this Parameter is meant to be used for
  Parameters we store on dashboard/card, and it has some difference with Parameter in MBQL."
  ;; TODO we could use :multi to dispatch values_source_type to the correct values_source_config
  (mc/schema
    [:map {:error/fn (fn [_ _] (deferred-tru "parameter must be a map with :id and :type keys"))}
     [:id NonBlankString]
     [:type keyword-or-non-blank-str-malli]
     ;; TODO how to merge this with ParameterSource above?
     [:values_source_type {:optional true} [:enum "static-list" "card" nil]]
     [:values_source_config {:optional true} ValuesSourceConfig]
     [:slug {:optional true} :string]
     [:name {:optional true} :string]
     [:default {:optional true} :any]
     [:sectionId {:optional true} NonBlankString]]))

(def ParameterMapping
  "Schema for a valid Parameter Mapping"
  (mc/schema
    [:map {:error/fn (fn [_ _] (deferred-tru "parameter_mapping must be a map with :parameter_id and :target keys"))}
     [:parameter_id NonBlankString]
     [:target :any]
     [:card_id {:optional true} IntGreaterThanZero]]))

(def EmbeddingParams
  "Schema for a valid map of embedding params."
  (mc/schema
    [:map-of {:error/fn (fn [_ _] (deferred-tru "value must be a valid embedding params map."))}
     :keyword
     [:enum "disabled" "enabled" "locked"]]))

(def ValidLocale
  "Schema for a valid ISO Locale code e.g. `en` or `en-US`. Case-insensitive and allows dashes or underscores."
  (mc/schema
    [:and
     NonBlankString
     [:fn {:error/fn (fn [_ _] (deferred-tru "String must be a valid two-letter ISO language or language-country code e.g. 'en' or 'en_US'."))}
      i18n/available-locale?]]))

(def NanoIdString
  "Schema for a 21-character NanoID string, like \"FReCLx5hSWTBU7kjCWfuu\"."
  (mc/schema
    [:re {:error/fn (fn [_ _] (deferred-tru "String must be a valid 21-character NanoID string."))}
     #"^[A-Za-z0-9_\-]{21}$"]))

(def UUIDString
  "Schema for a UUID string"
  (mc/schema
   [:re {:error/fn (constantly (deferred-tru "value must be a valid UUID."))}
    u/uuid-regex]))
