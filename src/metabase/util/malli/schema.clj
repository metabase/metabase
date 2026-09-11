(ns metabase.util.malli.schema
  "TODO: Consider refacor this namespace by defining custom schema with [[mr/def]] instead.

  For example the PositiveInt can be defined as (mr/def ::positive-int pos-int?)"
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Utils --------------------------------------------------

(defn- stringify-keys
  "Turn the keyword keys of `x`, if it is a map, into strings, keeping their namespaces -- and, when `recursive?`, the
  keys of every map nested inside it too. Request decoding keywordizes every JSON object key; this undoes that for the
  objects we do not type."
  ([x]
   (stringify-keys x false))
  ([x recursive?]
   (if recursive?
     (walk/postwalk stringify-keys x)
     (cond-> x
       (map? x) (update-keys #(if (keyword? %) (u/qualified-name %) %))))))

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

(defn- open-map
  "A map whose keys are deliberately not ours to declare. The marker property is what lets
  [[metabase.api.macros.defendpoint.closed-schemas]] accept it; nothing outside this namespace should set it."
  [description]
  (mu/with-api-error-message
   [:map {:closed false, ::mr/deliberately-open true, :description description}]
   (deferred-tru "Value must be a map.")))

(def VisualizationSettings
  "Chart-rendering settings authored by the frontend. The backend stores and echoes them and reads no fixed key set, so
  the keys are whatever the visualization the user picked needs."
  (open-map "visualization settings"))

(def DatabaseDetails
  "Connection details for a Database. The keys are the driver's `connection-properties`, so they differ per driver and
  are not knowable here."
  (open-map "database connection details"))

(def DatabaseSettings
  "A Database's `:settings`: database-local settings, whose keys are owned by the settings registry rather than by this
  schema. Not for any other bag of settings."
  (open-map "database settings"))

(defn string-keyed-map
  "Schema for a JSON object whose keys are not ours to declare, as a `:map-of` string keys to `value-schema`.
  Normalizing stringifies its keys -- a request on its way in, or a keywordized JSON column read back from the
  application database -- so the value looks the way it did on the wire and nothing can quietly start reading it by
  keyword. Only the keys of the map itself, unless `recursive?`, which stringifies the keys of every map nested inside
  it as well. Dispatching on `map?` keeps a value that is not a map out of the `:map-of`, whose request-decoding strip
  step would otherwise throw on it instead of leaving it to validation."
  ([value-schema]
   (string-keyed-map value-schema false))
  ([value-schema recursive?]
   (mu/with-api-error-message
    [:multi {:dispatch map?}
     [true  [:map-of {:decode/normalize {:enter #(stringify-keys % recursive?)}} :string value-schema]]
     [false (mu/with-api-error-message [:fn map?] (deferred-tru "Value must be a map."))]]
    (deferred-tru "Value must be a map."))))

(def OpaqueJSONObject
  "A JSON object this code stores, echoes back or forwards as it arrived, and never reads by key: a
  [[string-keyed-map]] of anything, stringified all the way down. Under no circumstances may its keys be keywords: a
  map this code builds and reads by keyword is not opaque and gets a schema of its own. The marker property is what
  lets [[metabase.api.macros.defendpoint.closed-schemas]] accept the `:any`."
  (mu/with (string-keyed-map :any true) {::mr/deliberately-open true}))

(defn string-keyed-object
  "Schema for a JSON object of which this code reads a few keys and keeps the rest as they arrived: an
  [[OpaqueJSONObject]] whose `entries` declare, with string keys, the keys this code reads and their types.

    (string-keyed-object [\"id\" :int] [\"label\" {:optional true} [:maybe :string]])

  Every key of the object is a string, the declared ones included, so the map never mixes keyword and string keys and
  code reads the declared keys the same way it would any other: `(get attrs \"id\")`. Decoding stringifies the keys of
  the object itself first of all -- a request on its way in, or a keywordized JSON column read back from the
  application database -- so the declared entries, their defaults included, are found under their string keys; the
  values of the undeclared keys are stringified all the way down, the declared ones only as their schemas say. Prefer a
  fully typed map when the keys are known: this is for objects another party owns, like an editor's node attributes."
  [& entries]
  (doseq [[k] entries]
    (assert (string? k) (str "string-keyed-object keys must be strings, got: " (pr-str k))))
  (into [:map
         {:decode/string    {:enter stringify-keys}
          :decode/json      {:enter stringify-keys}
          :decode/normalize {:enter stringify-keys}}
         [::mc/default OpaqueJSONObject]]
        entries))

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

(def FieldValue
  "One value of a Field: a JSON scalar as kept in the `field_values.values` and `human_readable_values` columns, or, on
  the way there, a UUID or `java.time` object as the query returned it."
  [:maybe [:or :string number? :boolean uuid? (InstanceOfClass java.time.temporal.Temporal)]])

(def RemappedFieldValue
  "Has two components:
    1. <value-of-field>
    2. <value-of-remapped-field> (must be a string)"
  [:tuple FieldValue :string])

(def NonRemappedFieldValue
  "Has one component: <value-of-field>"
  [:tuple FieldValue])

(def FieldValuesList
  "Schema for a valid list of values for a field, in contexts where the field can have a remapped field."
  [:sequential [:or RemappedFieldValue NonRemappedFieldValue]])

(def FieldValues
  "The stored values of a Field: the decoded `field_values.values` or `human_readable_values` column."
  [:sequential FieldValue])

(def FieldValuesResult
  "Schema for a value result of fetching the values for a field, in contexts where the field can have a remapped field."
  [:map
   [:has_more_values :boolean]
   [:values FieldValuesList]])

;;; TODO -- move to `embedding`
(def EmbeddingParams
  "Schema for a valid map of embedding params: parameter slug -> how the embed treats that parameter. The slugs are the
  embed author's, so the map is string-keyed on its way in; it is stored as JSON and read back keywordized like every
  other JSON column."
  (mu/with-api-error-message
   [:maybe (string-keyed-map [:enum "disabled" "enabled" "locked"])]
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
