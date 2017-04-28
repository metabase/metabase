(ns metabase.util.schema
  "Various schemas that are useful throughout the app."
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase.util :as u]
            [metabase.util.password :as password]
            [schema.core :as s]))

(defn with-api-error-message
  "Return SCHEMA with an additional API-ERROR-MESSAGE that will be used to explain the error if a parameter fails validation."
  {:style/indent 1}
  [schema api-error-message]
  {:pre [(map? schema)]}
  (assoc schema :api-error-message api-error-message))

(defn- existing-schema->api-error-message
  "Error messages for various schemas already defined in `schema.core`.
   These are used as a fallback by API param validation if no value for `:api-error-message` is present."
  [existing-schema]
  (cond
    (= existing-schema s/Int)                           "value must be an integer."
    (= existing-schema s/Str)                           "value must be a string."
    (= existing-schema s/Bool)                          "value must be a boolean."
    (instance? java.util.regex.Pattern existing-schema) (format "value must be a string that matches the regex `%s`." existing-schema)))

(defn api-error-message
  "Extract the API error messages attached to a schema, if any.
   This functionality is fairly sophisticated:

    (api-error-message (s/maybe (non-empty [NonBlankString])))
    ;; -> \"value may be nil, or if non-nil, value must be an array. Each value must be a non-blank string. The array cannot be empty.\""
  [schema]
  (or (:api-error-message schema)
      (existing-schema->api-error-message schema)
      ;; for schemas wrapped by an `s/maybe` we can generate a nice error message like "value may be nil, or if non-nil, value must be ..."
      (when (instance? schema.core.Maybe schema)
        (when-let [message (api-error-message (:schema schema))]
          (str "value may be nil, or if non-nil, " message)))
      ;; we can do something similar for enum schemas which are also likely to be defined inline
      (when (instance? schema.core.EnumSchema schema)
        (format "value must be one of: %s." (str/join ", " (for [v (sort (:vs schema))]
                                                             (str "`" v "`")))))
      ;; For cond-pre schemas we'll generate something like
      ;; value must satisfy one of the following requirements: 1) value must be a boolean. 2) value must be a valid boolean string ('true' or 'false').
      (when (instance? schema.core.CondPre schema)
        (str "value must satisfy one of the following requirements: "
             (str/join " " (for [[i child-schema] (m/indexed (:schemas schema))]
                             (format "%d) %s" (inc i) (api-error-message child-schema))))))
      ;; do the same for sequences of a schema
      (when (vector? schema)
        (str "value must be an array." (when (= (count schema) 1)
                                         (when-let [message (:api-error-message (first schema))]
                                           (str " Each " message)))))))


(defn non-empty
  "Add an addditonal constraint to SCHEMA (presumably an array) that requires it to be non-empty (i.e., it must satisfy `seq`)."
  [schema]
  (with-api-error-message (s/constrained schema seq "Non-empty")
    (str (api-error-message schema) " The array cannot be empty.")))

;;; ------------------------------------------------------------ Util Schemas ------------------------------------------------------------

(def NonBlankString
  "Schema for a string that cannot be blank."
  (with-api-error-message (s/constrained s/Str (complement str/blank?) "Non-blank string")
    "value must be a non-blank string."))

;; TODO - rename this to `PositiveInt`?
(def IntGreaterThanZero
  "Schema representing an integer than must also be greater than zero."
  (with-api-error-message
      (s/constrained s/Int (partial < 0) "Integer greater than zero")
    "value must be an integer greater than zero."))

(def KeywordOrString
  "Schema for something that can be either a `Keyword` or a `String`."
  (s/named (s/cond-pre s/Keyword s/Str) "Keyword or string"))

(def FieldType
  "Schema for a valid Field type (does it derive from `:type/*`?"
  (with-api-error-message (s/pred (u/rpartial isa? :type/*) "Valid field type")
    "value must be a valid field type."))

(def Map
  "Schema for a valid map."
  (with-api-error-message (s/pred map? "Valid map")
    "value must be a map."))

(def Email
  "Schema for a valid email string."
  (with-api-error-message (s/constrained s/Str u/is-email? "Valid email address")
    "value must be a valid email address."))

(def ComplexPassword
  "Schema for a valid password of sufficient complexity."
  (with-api-error-message (s/constrained s/Str password/is-complex?)
    "Insufficient password strength"))

(def IntString
  "Schema for a string that can be parsed as an integer.
   Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (Integer/parseInt %)))
    "value must be a valid integer."))

(def IntStringGreaterThanZero
  "Schema for a string that can be parsed as an integer, and is greater than zero.
   Something that adheres to this schema is guaranteed to to work with `Integer/parseInt`."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (< 0 (Integer/parseInt %))))
    "value must be a valid integer greater than zero."))

(defn- boolean-string? ^Boolean [s]
  (boolean (when (string? s)
             (let [s (str/lower-case s)]
               (contains? #{"true" "false"} s)))))

(def BooleanString
  "Schema for a string that is a valid representation of a boolean (either `true` or `false`).
   Something that adheres to this schema is guaranteed to to work with `Boolean/parseBoolean`."
  (with-api-error-message (s/constrained s/Str boolean-string?)
    "value must be a valid boolean string ('true' or 'false')."))

(def JSONString
  "Schema for a string that is valid serialized JSON."
  (with-api-error-message (s/constrained s/Str #(u/ignore-exceptions (json/parse-string %)))
    "value must be a valid JSON string."))

(def EmbeddingParams
  "Schema for a valid map of embedding params."
  (with-api-error-message (s/maybe {s/Keyword (s/enum "disabled" "enabled" "locked")})
    "value must be a valid embedding params map."))
