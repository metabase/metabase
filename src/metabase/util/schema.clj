(ns metabase.util.schema
  "Various schemas that are useful throughout the app."
  (:refer-clojure :exclude [distinct])
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [deferred-tru]]
             [password :as password]]
            [schema
             [core :as s]
             [macros :as s.macros]
             [utils :as s.utils]]))

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

(intern 'schema.core 'validator schema-core-validator)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     API Schema Validation & Error Messages                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn with-api-error-message
  "Return `schema` with an additional `api-error-message` that will be used to explain the error if a parameter fails
  validation."
  {:style/indent 1}
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
  [schema]
  (or (:api-error-message schema)
      (existing-schema->api-error-message schema)
      ;; for schemas wrapped by an `s/maybe` we can generate a nice error message like
      ;; "value may be nil, or if non-nil, value must be ..."
      (when (instance? schema.core.Maybe schema)
        (when-let [message (api-error-message (:schema schema))]
          (deferred-tru "value may be nil, or if non-nil, {0}" message)))
      ;; we can do something similar for enum schemas which are also likely to be defined inline
      (when (instance? schema.core.EnumSchema schema)
        (deferred-tru "value must be one of: {0}." (str/join ", " (for [v (sort (:vs schema))]
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
        (str (deferred-tru "value must be an array.") (when (= (count schema) 1)
                                                        (when-let [message (api-error-message (first schema))]
                                                          (str " " (deferred-tru "Each {0}" message))))))))


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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 USEFUL `schema`S                                                 |
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

(def NonNegativeInt
  "Schema representing an integer 0 or greater"
  (with-api-error-message
      (s/constrained s/Int (partial <= 0) (deferred-tru "Integer greater than or equal to zero"))
    (deferred-tru "value must be an integer zero or greater.")))

(def PositiveNum
  "Schema representing a numeric value greater than zero. This allows floating point numbers and integers."
  (with-api-error-message
      (s/constrained s/Num (partial < 0) (deferred-tru "Number greater than zero"))
    (deferred-tru "value must be a number greater than zero.")))

(def KeywordOrString
  "Schema for something that can be either a `Keyword` or a `String`."
  (s/named (s/cond-pre s/Keyword s/Str) (deferred-tru "Keyword or string")))

(def FieldType
  "Schema for a valid Field type (does it derive from `:type/*`)?"
  (with-api-error-message (s/pred (u/rpartial isa? :type/*) (deferred-tru "Valid field type"))
    (deferred-tru "value must be a valid field type.")))

(def FieldTypeKeywordOrString
  "Like `FieldType` (e.g. a valid derivative of `:type/*`) but allows either a keyword or a string.
   This is useful especially for validating API input or objects coming out of the DB as it is unlikely
   those values will be encoded as keywords at that point."
  (with-api-error-message (s/pred #(isa? (keyword %) :type/*) (deferred-tru "Valid field type (keyword or string)"))
    (deferred-tru "value must be a valid field type (keyword or string).")))

(def EntityTypeKeywordOrString
  "Validates entity type derivatives of `:entity/*`. Allows strings or keywords"
  (with-api-error-message (s/pred #(isa? (keyword %) :entity/*) (deferred-tru "Valid entity type (keyword or string)"))
   (deferred-tru "value must be a valid entity type (keyword or string).")))

(def Map
  "Schema for a valid map."
  (with-api-error-message (s/pred map? (deferred-tru "Valid map"))
    (deferred-tru "value must be a map.")))

(def Email
  "Schema for a valid email string."
  (with-api-error-message (s/constrained s/Str u/email? (deferred-tru "Valid email address"))
    (deferred-tru "value must be a valid email address.")))

(def ComplexPassword
  "Schema for a valid password of sufficient complexity."
  (with-api-error-message (s/constrained s/Str password/is-complex?)
    (deferred-tru "Insufficient password strength")))

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

(def IntStringGreaterThanOrEqualToZero
  "Schema for a string that can be parsed as an integer, and is greater than or equal to zero.
   Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (<= 0 (Integer/parseInt %))))
    (deferred-tru "value must be a valid integer greater than or equal to zero.")))

(defn- boolean-string? ^Boolean [s]
  (boolean (when (string? s)
             (let [s (str/lower-case s)]
               (contains? #{"true" "false"} s)))))

(def BooleanString
  "Schema for a string that is a valid representation of a boolean (either `true` or `false`).
   Something that adheres to this schema is guaranteed to to work with `Boolean/parseBoolean`."
  (with-api-error-message (s/constrained s/Str boolean-string?)
    (deferred-tru "value must be a valid boolean string (''true'' or ''false'').")))

(def JSONString
  "Schema for a string that is valid serialized JSON."
  (with-api-error-message (s/constrained s/Str #(try
                                                  (json/parse-string %)
                                                  true
                                                  (catch Throwable _
                                                    false)))
    (deferred-tru "value must be a valid JSON string.")))

(def EmbeddingParams
  "Schema for a valid map of embedding params."
  (with-api-error-message (s/maybe {s/Keyword (s/enum "disabled" "enabled" "locked")})
    (deferred-tru "value must be a valid embedding params map.")))
