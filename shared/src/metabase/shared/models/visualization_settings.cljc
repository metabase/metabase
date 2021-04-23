(ns metabase.shared.models.visualization-settings
  "Utility code for dealing with visualization settings, from cards, dashboard cards, etc.

  There are two ways of representing the same data, DB form and normalized form.  DB form is the \"legacy\" form, which
  uses unqualified keywords, which map directly to column names via Toucan.  Normalized form, on the other hand, uses
  namespaced keywords and generally \"unwraps\" the semantic structures as much as possible.

  In general, operations/manipulations should happen on the normalized form, and when the DB form is needed again (ex:
  for updating the database), the map can be converted back."
  (:require #?(:clj  [cheshire.core :as json]
               :cljs [cljs.reader :as cljs-reader]
                     [cljs.js :as js])
            [clojure.set :as set]
            [clojure.spec.alpha :as s]
            [medley.core :as m]))

(defn visualization-settings
  "Creates an empty visualization settings map. Intended for use in the context of a threading macro (ex: with
  `click-action` or a similar function following as the next form)."
  {:added "0.40.0"}
  []
  {})

(defn column-ref-for-id
  "Creates a normalized column ref map for the given field ID. This becomes the key in the `::column-settings` map."
  {:added "0.40.0"}
  [field-id]
  {::field-id field-id})

(s/def ::field-id integer?)

(defn column-ref-for-qualified-name
  "Creates a normalized column ref map for the given fully qualified name (string). This becomes the key in the
  `::column-settings` map."
  {:added "0.40.0"}
  [field-qualified-name]
  {::field-qualified-name field-qualified-name})

(s/def ::field-id string?)

(defn- keyname
  "Returns the full string value of the key name, including any \"namespace\" portion followed by forward slash."
  ;; from https://clojuredocs.org/clojure.core/name#example-58264f85e4b0782b632278bf
  ;; Clojure interprets slashes as keyword/name separators, so we need to do something hacky to get the "full" name here
  ;; because our "keyword value" (as parsed from JSON/YAML/etc.) might actually look like the string version of a
  ;; Clojure vector, which itself can contain a fully qualified name for serialization
  [key]
  (str (namespace key) "/" (name key)))

(defn- parse-json-string
  "Parse the given `json-str` to a map. In Clojure, this uses Cheshire. In Clojurescript, it uses `cljs.reader`."
  [json-str]
  #?(:clj  (json/parse-string json-str)
     :cljs (cljs-reader/read-string json-str)))

(defn- encode-json-string
  "Encode the given `obj` map as a JSON string. In Clojure, this uses Cheshire. In Clojurescript, it uses
  `cljs.core.clj->js` in conjunction with `cljs.js`."
  [obj]
  #?(:clj  (json/encode obj)
     :cljs (.stringify js/JSON (clj->js obj))))

(defn parse-column-ref
  "Opposite of the `column-ref-for-*` fns. Converts the given string representation of a column settings key into its
  normalized form. The `col-ref` argument can be a string or keyword (which is produced by YAML parsing, for instance).
  In case it is a keyword, it will be converted to its full name. \"Full\" means that the portions before and after any
  slashes will be included verbatim (via the `keyname` helper fn). This is necessary because our serialization code
  considers a forward slash to be a legitimate portion of a fully qualified name, whereas Clojure considers it to be a
  namespace/local name separator."
  {:added "0.40.0"}
  [col-ref]
  (let [[_ [t id _]] ((comp vec parse-json-string) (if (keyword? col-ref) (keyname col-ref) col-ref))]
    (case t "field" (cond (int? id)    {::field-id id}
                          (string? id) {::field-qualified-name id}))))

(defn- with-col-settings [settings]
  (if (contains? settings ::column-settings)
    settings
    (assoc settings ::column-settings {})))

(defn- click-action* [entity-type entity-id]
  {::click-behavior-type    ::link
   ::link-type              entity-type
   ::link-parameter-mapping {}
   ::link-target-id         entity-id})

(defn click-action
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`. This happens in the normalized form, and hence this should be passed the output of another fn
  (including, currently, `visualization-settings`). If the given `from-field-id` already has a click action, it will
  be replaced."
  {:added "0.40.0"}
  [settings from-field-id to-entity-type to-entity-id]
  (-> settings
      with-col-settings
      (update-in [::column-settings] #(assoc % (column-ref-for-id from-field-id)
                                               {::click-behavior (click-action* to-entity-type to-entity-id)}))))

(def ^:private db-to-normalized-click-action-type
  {"link" ::link})

(def ^:private normalized-to-db-click-action-type
  (set/map-invert db-to-normalized-click-action-type))

(def ^:private db-to-normalized-link-type
  {"question" ::card})

(def ^:private normalized-to-db-link-type
  (set/map-invert db-to-normalized-link-type))

(defn- db-form-entry-to-normalized
  "Converts a :column_settings DB form to qualified form. Does the opposite of
  `db-normalized-entry-to-db-form-entry-to-normalized`."
  [m k v]
  (case k
    :click_behavior (assoc m ::click-behavior (-> v
                                                  (assoc
                                                   ::click-behavior-type
                                                   (db-to-normalized-click-action-type (:type v)))
                                                  (dissoc :type)
                                                  (assoc ::link-type (db-to-normalized-link-type (:linkType v)))
                                                  (dissoc :linkType)
                                                  (set/rename-keys {:parameterMapping ::link-parameter-mapping
                                                                    :targetId         ::link-target-id})))
    (assoc m k v)))

(defn from-db-form
  "Converts a DB form of visualization settings (i.e. map with key `:visualization_settings`) into the equivalent
  normalized form (i.e. map with key `::visualization-settings`."
  {:added "0.40.0"}
  [visualization_settings]
  (if-let [col-settings (:column_settings visualization_settings)]
    {::column-settings (->> col-settings
                            (m/map-kv (fn [k v]
                                        (let [k1 (parse-column-ref k)
                                              v1 (reduce-kv db-form-entry-to-normalized {} v)]
                                          [k1 v1]))))}
    {}))

(defn- normalized-entry-to-db-form
  "Converts a ::column-settings entry from qualified form to DB form. Does the opposite of
  `db-form-entry-to-normalized`."
  [m k v]
  (case k
    ::click-behavior (assoc m :click_behavior (-> v
                                                  (assoc
                                                   :type
                                                   (normalized-to-db-click-action-type (::click-behavior-type v)))
                                                  (dissoc ::click-behavior-type)
                                                  (assoc :linkType (normalized-to-db-link-type (::link-type v)))
                                                  (dissoc ::link-type)
                                                  (set/rename-keys {::link-parameter-mapping :parameterMapping
                                                                    ::link-target-id         :targetId})))))

(defn db-form-column-ref
  "Creates the DB form of a column ref (i.e. the key in the column settings map) for the given normalized args. Either
  `::field-id` or `::field-qualified-name` keys will be checked in the arg map to build the corresponding column ref
  map."
  {:added "0.40.0"}
  [{:keys [::field-id ::field-qualified-name]}]
  (-> (cond
        (some? field-id)             ["ref" ["field" field-id nil]]
        (some? field-qualified-name) ["ref" ["field" field-qualified-name nil]])
      encode-json-string))

(defn- db-form-column-settings [col-settings]
  (->> col-settings
       (m/map-kv (fn [k v]
                   [(db-form-column-ref k) (reduce-kv normalized-entry-to-db-form {} v)]))))

(defn db-form
  "The opposite of `from-db-form`. Converts the normalized form of visualization settings (i.e. a map having
  `::visualization-settings` into the equivalent DB form (i.e. a map having `:visualization_settings`)."
  {:added "0.40.0"}
  [settings]
  (if-let [col-settings (::column-settings settings)]
    (if (empty? col-settings)
      {}
      {:column_settings (db-form-column-settings col-settings)})
    {}))

