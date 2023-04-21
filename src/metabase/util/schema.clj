(ns ^{:deprecated "0.46.0"} metabase.util.schema
  "Various schemas that are useful throughout the app.

  Schemas defined are deprecated and should be replaced with Malli schema defined in [[metabase.util.malli.schema]].
  If you update schemas in this ns, please make sure you update the malli schema too. It'll help us makes the transition easier."
  (:refer-clojure :exclude [distinct])
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.password :as u.password]
   [schema.core :as s]
   [schema.macros :as s.macros]
   [schema.utils :as s.utils]))

(set! *warn-on-reflection* true)

;; So the `:type/` hierarchy is loaded.
(comment types/keep-me)

;; always validate all schemas in s/defn function declarations. See
;; https://github.com/plumatic/schema#schemas-in-practice for details.
(s/set-fn-validation! true)

;; swap out the default impl of `schema.core/validator` with one that does not barf out the entire schema, since it's
;; way too huge with things like our MBQL query schema
(defn- schema-core-validator [schema]
  (let [c (s/checker schema)]
    (fn [value]
      (when-let [error (c value)]
        (s.macros/error! (s.utils/format* "Value does not match schema: %s" (pr-str error))
                         {:value value, :error error}))
      value)))

(alter-var-root #'schema.core/validator (constantly schema-core-validator))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            Plumatic API Schema Validation & Error Messages                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn with-api-error-message
  "Return `schema` with an additional `api-error-message` that will be used to explain the error if a parameter fails
  validation."
  {:style/indent [:defn]}
  [schema api-error-message]
  (if-not (record? schema)
    ;; since this only works for record types, if `schema` isn't already one just wrap it in `s/named` to make it one
    (recur (s/named schema api-error-message) api-error-message)
    (assoc schema :api-error-message api-error-message)))

(defn api-param
  "Return `schema` with an additional `api-param-name` key that will be used in the auto-generate documentation and in
  error messages. This is important for situations where you want to bind a parameter coming in to the API to
  something other than the `snake_case` key it normally comes in as:

     ;; BAD -- Documentation/errors will tell you `dimension-type` is wrong
     [:is {{dimension-type :type} :body}]
     {dimension-type DimensionType}

     ;; GOOD - Documentation/errors will mention correct param name, `type`
     [:is {{dimension-type :type} :body}]
     {dimension-type (su/api-param \"type\" DimensionType)}"
  {:style/indent 1}
  [api-param-name schema]
  {:pre [(record? schema)]}
  (assoc schema :api-param-name (name api-param-name)))

(defn- existing-schema->api-error-message
  "Error messages for various schemas already defined in `schema.core`. These are used as a fallback by API param
  validation if no value for `:api-error-message` is present."
  [existing-schema]
  (cond
    (= existing-schema s/Int)                           (deferred-tru "value must be an integer.")
    (= existing-schema s/Str)                           (deferred-tru "value must be a string.")
    (= existing-schema s/Bool)                          (deferred-tru "value must be a boolean.")
    (instance? java.util.regex.Pattern existing-schema) (deferred-tru
                                                          "value must be a string that matches the regex `{0}`."
                                                          existing-schema)))

(declare api-error-message)

(defn- create-cond-schema-message [child-schemas]
  (str (deferred-tru "value must satisfy one of the following requirements: ")
       (str/join " " (for [[i child-schema] (m/indexed child-schemas)]
                       (format "%d) %s" (inc i) (api-error-message child-schema))))))

(defn api-error-message
  "Extract the API error messages attached to a schema, if any. This functionality is fairly sophisticated:

    (api-error-message (s/maybe (non-empty [NonBlankString])))
    ;; -> \"value may be nil, or if non-nil, value must be an array. Each value must be a non-blank string.
            The array cannot be empty.\""

  ([schema] (api-error-message schema 0))
  ([schema indent-depth]
   (or (:api-error-message schema)
       (existing-schema->api-error-message schema)
       ;; for schemas wrapped by an `s/maybe` we can generate a nice error message like
       ;; "value may be nil, or if non-nil, value must be ..."
       (when (instance? schema.core.Maybe schema)
         (when-let [message (api-error-message (:schema schema))]
           (deferred-tru "value may be nil, or if non-nil, {0}" message)))

       ;; we can do something similar for enum schemas which are also likely to be defined inline
       (when (instance? schema.core.EnumSchema schema)
         (deferred-tru "value must be one of: {0}." (str/join ", " (for [v (sort (map str (:vs schema)))]
                                                                     (str "`" v "`")))))
       ;; For cond-pre schemas we'll generate something like
       ;; value must satisfy one of the following requirements:
       ;; 1) value must be a boolean.
       ;; 2) value must be a valid boolean string ('true' or 'false').
       (when (instance? schema.core.CondPre schema)
         (create-cond-schema-message (:schemas schema)))

       ;; For conditional schemas we'll generate a string similar to `cond-pre` above
       (when (instance? schema.core.ConditionalSchema schema)
         (create-cond-schema-message (map second (:preds-and-schemas schema))))

       ;; do the same for sequences of a schema
       (when (vector? schema)
         (str (deferred-tru "value must be an array.")
              (when (= (count schema) 1)
                (when-let [message (api-error-message (first schema))]
                  (str " " (deferred-tru "Each {0}" message))))))

       ;; Optional map keys
       (when (instance? schema.core.OptionalKey schema)
         (deferred-tru "{0} (optional)" (api-error-message (:k schema))))

       ;; schema map keys
       (when (instance? clojure.lang.Keyword schema)
         (name schema))

       ;; for maps of a schema, write out what keys and values
       ;; this keeps track of indentation because the message is very difficult to read without it.
       (when (map? schema)
         (let [spaces (str/join (repeat indent-depth "  "))]
           (str (deferred-tru "value must be a map with schema: (\n{0}{1}{2}{3}{4}{5}"
                  spaces
                  "  "
                  (str/join
                   (str "\n" spaces "  ")
                   (for [k (sort-by pr-str (keys schema))] ;; keep order of keys deterministic
                     (str
                      (api-error-message k (inc indent-depth))
                      " : "
                      (api-error-message (get schema k) (inc indent-depth)))))
                  "\n"
                  spaces
                  ")")))))))

(defn non-empty
  "Add an addditonal constraint to `schema` (presumably an array) that requires it to be non-empty
   (i.e., it must satisfy `seq`)."
  [schema]
  (with-api-error-message (s/constrained schema seq "Non-empty")
    (str (api-error-message schema) " " (deferred-tru "The array cannot be empty."))))

(defn empty-or-distinct?
  "True if `coll` is either empty or distinct."
  [coll]
  (if (seq coll)
    (apply distinct? coll)
    true))

(defn distinct
  "Add an additional constraint to `schema` (presumably an array) that requires all elements to be distinct."
  [schema]
  (with-api-error-message (s/constrained schema empty-or-distinct? "distinct")
    (str (api-error-message schema) " " (deferred-tru "All elements must be distinct."))))

(defn open-schema
  "Allow for extra keys (recursively) in a schema.
  For instance:

  {(s/optional-key :thing) s/Int
   (s/optional-key :sub)   {(s/optional-key :key) s/Int}}

  can validate a map with extra keys:

  {:thing     3
   :extra-key 5
   :sub       {:key 3 :another-extra 5}}

  https://github.com/plumatic/schema/issues/120"
  [m]
  (walk/prewalk (fn [x]
                  (if (and (map? x) (not (record? x)))
                    (assoc (dissoc x (s/find-extra-keys-schema x)) s/Any s/Any)
                    x))
                m))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 USEFUL SCHEMAS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def NonBlankString
  "Schema for a string that cannot be blank."
  (with-api-error-message (s/constrained s/Str (complement str/blank?) "Non-blank string")
    (deferred-tru "value must be a non-blank string.")))

(def IntGreaterThanOrEqualToZero
  "Schema representing an integer than must also be greater than or equal to zero."
  (with-api-error-message
    (s/constrained s/Int (partial <= 0) (deferred-tru "Integer greater than or equal to zero"))
    (deferred-tru "value must be an integer greater than or equal to zero.")))

;; TODO - rename this to `PositiveInt`?
(def IntGreaterThanZero
  "Schema representing an integer than must also be greater than zero."
  (with-api-error-message
    (s/constrained s/Int (partial < 0) (deferred-tru "Integer greater than zero"))
    (deferred-tru "value must be an integer greater than zero.")))

(def PositiveNum
  "Schema representing a numeric value greater than zero. This allows floating point numbers and integers."
  (with-api-error-message
    (s/constrained s/Num (partial < 0) (deferred-tru "Number greater than zero"))
    (deferred-tru "value must be a number greater than zero.")))

(def KeywordOrString
  "Schema for something that can be either a `Keyword` or a `String`."
  (with-api-error-message (s/named (s/cond-pre s/Keyword s/Str) (deferred-tru "Keyword or string"))
    (deferred-tru "value must be a keyword or string.")))

(def FieldType
  "Schema for a valid Field base or effective (data) type (does it derive from `:type/*`)?"
  (with-api-error-message (s/pred #(isa? % :type/*) (deferred-tru "Valid field type"))
    (deferred-tru "value must be a valid field type.")))

(def FieldSemanticType
  "Schema for a valid Field semantic type deriving from `:Semantic/*`."
  (with-api-error-message (s/pred #(isa? % :Semantic/*)
                                  (deferred-tru "Valid field semantic type"))
    (deferred-tru "value must be a valid field semantic type.")))

(def FieldRelationType
  "Schema for a valid Field relation type deriving from `:Relation/*`"
  (with-api-error-message (s/pred #(isa? % :Relation/*)
                                  (deferred-tru "Valid field relation type"))
    (deferred-tru "value must be a valid field relation type.")))

(def FieldSemanticOrRelationType
  "Schema for a valid Field semantic *or* Relation type. This is currently needed because the `semantic_column` is used
  to store either the semantic type or relation type info. When this is changed in the future we can get rid of this
  schema. See #15486."
  (with-api-error-message (s/pred (fn [k]
                                    (or (isa? k :Semantic/*)
                                        (isa? k :Relation/*)))
                                  (deferred-tru "Valid field semantic or relation type"))
    (deferred-tru "value must be a valid field semantic or relation type.")))

(def CoercionStrategy
  "Schema for a valid Field coercion strategy (does it derive from `:Coercion/*`)?"
  (with-api-error-message (s/pred #(isa? % :Coercion/*) (deferred-tru "Valid coercion strategy"))
    (deferred-tru "value must be a valid coercion strategy.")))

(def FieldTypeKeywordOrString
  "Like `FieldType` (e.g. a valid derivative of `:type/*`) but allows either a keyword or a string.
   This is useful especially for validating API input or objects coming out of the DB as it is unlikely
   those values will be encoded as keywords at that point."
  (with-api-error-message (s/pred #(isa? (keyword %) :type/*) (deferred-tru "Valid field data type (keyword or string)"))
    (deferred-tru "value must be a valid field data type (keyword or string).")))

(def FieldSemanticTypeKeywordOrString
  "Like `FieldSemanticType` but accepts either a keyword or string."
  (with-api-error-message (s/pred #(isa? (keyword %) :Semantic/*) (deferred-tru "Valid field semantic type (keyword or string)"))
    (deferred-tru "value must be a valid field semantic type (keyword or string).")))

(def FieldSemanticOrRelationTypeKeywordOrString
  "Like `FieldSemanticOrRelationType` but accepts either a keyword or string."
  (with-api-error-message (s/pred (fn [k]
                                    (let [k (keyword k)]
                                      (or (isa? k :Semantic/*)
                                          (isa? k :Relation/*))))
                                  (deferred-tru "Valid field semantic or relation type (keyword or string)"))
    (deferred-tru "value must be a valid field semantic or relation type (keyword or string).")))

(def Field
  "Schema for a valid Field for API usage."
  (with-api-error-message (s/pred
                            (comp (complement (s/checker mbql.s/Field))
                                  mbql.normalize/normalize-tokens))
    (deferred-tru "value must an array with :field id-or-name and an options map")))

(def CoercionStrategyKeywordOrString
  "Like `CoercionStrategy` but accepts either a keyword or string."
  (with-api-error-message (s/pred #(isa? (keyword %) :Coercion/*) (deferred-tru "Valid coercion strategy"))
    (deferred-tru "value must be a valid coercion strategy (keyword or string).")))

(def EntityTypeKeywordOrString
  "Validates entity type derivatives of `:entity/*`. Allows strings or keywords"
  (with-api-error-message (s/pred #(isa? (keyword %) :entity/*) (deferred-tru "Valid entity type (keyword or string)"))
    (deferred-tru "value must be a valid entity type (keyword or string).")))

(def Map
  "Schema for a valid map."
  (with-api-error-message (s/named clojure.lang.IPersistentMap (deferred-tru "Valid map"))
    (deferred-tru "value must be a map.")))

(def Email
  "Schema for a valid email string."
  (with-api-error-message (s/constrained s/Str u/email? (deferred-tru "Valid email address"))
    (deferred-tru "value must be a valid email address.")))

(def ValidPassword
  "Schema for a valid password of sufficient complexity which is not found on a common password list."
  (with-api-error-message (s/constrained s/Str u.password/is-valid?)
    (deferred-tru "password is too common.")))

(def IntString
  "Schema for a string that can be parsed as an integer.
   Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (Integer/parseInt %)))
    (deferred-tru "value must be a valid integer.")))

(def IntStringGreaterThanZero
  "Schema for a string that can be parsed as an integer, and is greater than zero.
   Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (< 0 (Integer/parseInt %))))
    (deferred-tru "value must be a valid integer greater than zero.")))

(defn- boolean-string? ^Boolean [s]
  (boolean (when (string? s)
             (let [s (u/lower-case-en s)]
               (contains? #{"true" "false"} s)))))

(def BooleanString
  "Schema for a string that is a valid representation of a boolean (either `true` or `false`).
   Something that adheres to this schema is guaranteed to work with `Boolean/parseBoolean`."
  (with-api-error-message (s/constrained s/Str boolean-string?)
    (deferred-tru "value must be a valid boolean string (''true'' or ''false'').")))

(def TemporalString
  "Schema for a string that can be parsed by date2/parse."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (boolean (u.date/parse %))))
    (deferred-tru "value must be a valid date string")))

(def JSONString
  "Schema for a string that is valid serialized JSON."
  (with-api-error-message (s/constrained s/Str #(try
                                                  (json/parse-string %)
                                                  true
                                                  (catch Throwable _
                                                    false)))
    (deferred-tru "value must be a valid JSON string.")))

(def ^:private keyword-or-non-blank-str
  (s/conditional
    string?  NonBlankString
    keyword? s/Keyword))

(def ValuesSourceConfig
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  {;; for source_type = 'static-list'
   (s/optional-key :values)      (s/cond-pre [s/Any])

   ;; for source_type = 'card'
   (s/optional-key :card_id)     IntGreaterThanZero
   (s/optional-key :value_field) Field
   ;; label_field is optional
   (s/optional-key :label_field) Field})

(def Parameter
  "Schema for a valid Parameter.
  We're not using [metabase.mbql.schema/Parameter] here because this Parameter is meant to be used for
  Parameters we store on dashboard/card, and it has some difference with Parameter in MBQL."
  (with-api-error-message {:id                                    NonBlankString
                           :type                                  keyword-or-non-blank-str
                           (s/optional-key :values_source_type)   (s/enum "static-list" "card" nil)
                           (s/optional-key :values_source_config) ValuesSourceConfig
                           ;; Allow blank name and slug #15279
                           (s/optional-key :slug)                 s/Str
                           (s/optional-key :name)                 s/Str
                           (s/optional-key :default)              s/Any
                           (s/optional-key :sectionId)            NonBlankString
                           s/Keyword                              s/Any}
    (deferred-tru "parameter must be a map with :id and :type keys")))

(def ParameterMapping
  "Schema for a valid Parameter Mapping"
  (with-api-error-message {:parameter_id             NonBlankString
                           :target                   s/Any
                           (s/optional-key :card_id) IntGreaterThanZero
                           s/Keyword                 s/Any}
    (deferred-tru "parameter_mapping must be a map with :parameter_id and :target keys")))

(def EmbeddingParams
  "Schema for a valid map of embedding params."
  (with-api-error-message (s/maybe {s/Keyword (s/enum "disabled" "enabled" "locked")})
    (deferred-tru "value must be a valid embedding params map.")))

(def ValidLocale
  "Schema for a valid ISO Locale code e.g. `en` or `en-US`. Case-insensitive and allows dashes or underscores."
  (with-api-error-message (s/constrained NonBlankString i18n/available-locale?)
    (deferred-tru "String must be a valid two-letter ISO language or language-country code e.g. 'en' or 'en_US'.")))

(def NanoIdString
  "Schema for a 21-character NanoID string, like \"FReCLx5hSWTBU7kjCWfuu\"."
  (with-api-error-message #"^[A-Za-z0-9_\-]{21}$"
    (deferred-tru "String must be a valid 21-character NanoID string.")))

(def UUIDString
  "Schema for a UUID string"
  (with-api-error-message u/uuid-regex
    (deferred-tru "String must be a valid 21-character NanoID string.")))
