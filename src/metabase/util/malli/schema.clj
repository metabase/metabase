(ns metabase.util.malli.schema
  "TODO: Consider refacor this namespace by defining custom schema with [[mr/def]] instead.

  For example the PositiveInt can be defined as (mr/def ::positive-int pos-int?)"
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Utils --------------------------------------------------

;;; TODO -- consider renaming this to `InstanceOfModel` to differentiate it from [[InstanceOfClass]]
;;;
;;; TODO (Cam 9/29/25) -- maybe we should just automatically generate schemas for all the known models
;;; in [[metabase.models.resolution]] e.g. `:model/Card` that way you can just do
;;;
;;;    [card :- :model/Card]
;;;
;;; instead of
;;;
;;;    [card :- (ms/InstanceOf :model/Card)]
(def ^{:arglists '([model-or-models])} InstanceOf
  "Helper for creating a schema to check whether something is an instance of `model`.

    (ms/defn my-fn
      [user :- (ms/InstanceOf User)]
      ...)"
  (memoize
   (mu/fn [model-or-models :- [:or
                               :keyword
                               [:sequential {:min 1} :keyword]
                               [:set {:min 1} :keyword]]]
     (mu/with-api-error-message
      [:fn
       {:error/message (format "value must be an instance of %s" (pr-str model-or-models))}
       (if (keyword? model-or-models)
         #(t2/instance-of? model-or-models %)
         (fn [instance]
           (some (fn [model]
                   (t2/instance-of? model instance))
                 model-or-models)))]
      (deferred-tru "value must be an instance of {0}" (pr-str model-or-models))))))

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

#_{:clj-kondo/ignore [:unused-private-var]}
(def ^{:arglists '([map-schema])
       :private  true}
  ->kebab-keys-map
  "Transform all keys of a map schema to kebab keys."
  (memoize
   (fn [map-schema]
     (mut/transform-entries map-schema
                            (partial map (fn [[k opts s]]
                                           [(u/->kebab-case-en k) opts s]))))))

(defn enum-keywords-and-strings
  "Returns an enum schema that accept both keywords and strings.
    (enum-keywords-and-strings :foo :bar)
    ;; => [:enum :foo :bar \"foo\" \"bar\"]"
  [& keywords]
  (assert (every? keyword? keywords))
  (vec (concat [:enum] keywords (map u/qualified-name keywords))))

(defn enum-decode-keyword
  "Returns an enum schema that decodes strings to keywords.
    (enum-decode-keyword :foo :bar)
    ;; => [:enum {:decode/json keyword} :foo :bar]"
  [keywords]
  (into [:enum {:decode/json keyword}] keywords))

;;; -------------------------------------------------- Schemas --------------------------------------------------

(def NonBlankString
  "Schema for a string that cannot be blank."
  (mu/with-api-error-message
   ;; this is directly copied from [[:metabase.lib.schema.common/non-blank-string]] -- unfortunately using it here would
   ;; mean we need a dependency of `util` on `lib` -- not worth it to save ~6 duplicate LoC. At some point in the future
   ;; maybe we can get everyone to use one or the other or better yet make more specific schemas that describe their
   ;; purpose like `:metabase.warehouses.schema/database-description`. Who knows?
   [:and
    {:error/message "non-blank string"
     :json-schema   {:type "string" :minLength 1}
     :api/regex     #".+"}
    [:string {:min 1}]
    [:fn
     {:error/message "non-blank string"}
     (complement str/blank?)]]
   (deferred-tru "value must be a non-blank string.")))

(def IntGreaterThanOrEqualToZero
  "Schema representing an integer than must also be greater than or equal to zero."
  (let [message (deferred-tru "value must be an integer greater or equal to than zero.")]
    [:int
     {:min         0
      :description (str message)
      :error/fn    (fn [_ _]
                     (str message))
      :api/regex   #"\d+"}]))

(def Int
  "Schema representing an integer."
  (let [message (deferred-tru "value must be an integer.")]
    [:int
     {:description (str message)
      :error/fn    (fn [_ _]
                     (str message))
      :api/regex   #"-?\d+"}]))

(def PositiveInt
  "Schema representing an integer than must also be greater than zero."
  (let [message (deferred-tru "value must be an integer greater than zero.")]
    [:int
     {:min         1
      :description (str message)
      :error/fn    (fn [_ _]
                     (str message))
      :api/regex   #"[1-9]\d*"}]))

(def NegativeInt
  "Schema representing an integer than must be less than 0"
  (let [message (deferred-tru "value must be an integer less than zero.")]
    [:int
     {:max         -1
      :description (str message)
      :error/fn    (fn [_ _]
                     (str message))
      :api/regex   #"-[1-9]\d*"}]))

(def LocalizedString
  "Schema that is a localized string."
  [:fn i18n/localized-string?])

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

(def FieldSemanticOrRelationTypeKeywordOrString
  "Like `FieldSemanticOrRelationType` but accepts either a keyword or string."
  (mu/with-api-error-message
   [:fn (fn [k]
          (let [k (keyword k)]
            (or (isa? k :Semantic/*)
                (isa? k :Relation/*))))]
   (deferred-tru "value must be a valid field semantic or relation type (keyword or string).")))

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
    [:fn {:error/message "valid email address"} u/email?]]
   (deferred-tru "value must be a valid email address.")))

(def Url
  "Schema for a valid URL string."
  (mu/with-api-error-message
   [:fn u/url?]
   (deferred-tru "value must be a valid URL.")))

(def ValidPassword
  "Schema for a valid password of sufficient complexity which is not found on a common password list."
  (mu/with-api-error-message
   [:and
    :string
    [:fn {:error/message "valid password that is not too common"} (every-pred string? #'u.password/is-valid?)]]
   (deferred-tru "password is too common.")))

(def TemporalInstant
  "Schema for temporal values (java.time objects) that serialize to ISO-8601 strings in JSON responses."
  (mu/with-api-error-message
   [:fn {:json-schema {:type "string" :format "date-time"}
         :description "ISO-8601 date-time string"}
    #(instance? java.time.temporal.Temporal %)]
   (deferred-tru "value must be a valid date/time/datetime")))

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
            (json/decode %)
            true
            (catch Throwable _
              false))]]
   (deferred-tru "value must be a valid JSON string.")))

(def BooleanValue
  "Schema for a valid representation of a boolean
  (one of `\"true\"` or `true` or `\"false\"` or `false`.).
  Used by [[metabase.api.common/defendpoint]] to coerce the value for this schema to a boolean.
   Guaranteed to evaluate to `true` or `false` when passed through a json decoder."
  (-> [:enum {:decode/json (fn [b] (contains? #{"true" true} b))
              :json-schema {:type "boolean"}}
       "true" "false" true false]
      (mu/with-api-error-message
       (deferred-tru "value must be a valid boolean string (''true'' or ''false'')."))))

(def MaybeBooleanValue
  "Same as above, but allows distinguishing between `nil` (the user did not specify a value)
  and `false` (the user specified `false`)."
  (-> [:enum {:decode/json (fn [b] (some->> b (contains? #{"true" true})))
              :json-schema {:type "boolean" :optional true}}
       "true" "false" true false nil]
      (mu/with-api-error-message
       (deferred-tru "value must be a valid boolean string (''true'' or ''false'')."))))

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

;;; TODO -- move to `embedding`
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
    [:fn
     {:error/message "valid locale"}
     i18n/available-locale?]]
   (deferred-tru "String must be a valid two-letter ISO language or language-country code e.g. ''en'' or ''en_US''.")))

(def NanoIdString
  "Schema for a 21-character NanoID string, like \"FReCLx5hSWTBU7kjCWfuu\"."
  (mu/with-api-error-message
   [:re {:api/regex #"[A-Za-z0-9_\-]{21}"} #"^[A-Za-z0-9_\-]{21}$"]
   (deferred-tru "String must be a valid 21-character NanoID string.")))

(def UUIDString
  "Schema for a UUID string"
  (mu/with-api-error-message
   [:re u/uuid-regex]
   (deferred-tru "value must be a valid UUID.")))

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

(def File
  "Schema for a file coming in HTTP request from multipart/form-data"
  [:map {:closed true}
   [:content-type string?]
   [:filename string?]
   [:size int?]
   [:tempfile (InstanceOfClass java.io.File)]])
