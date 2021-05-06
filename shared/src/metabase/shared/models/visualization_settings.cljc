(ns metabase.shared.models.visualization-settings
  "Utility code for dealing with visualization settings, from cards, dashboard cards, etc.

  There are two ways of representing the same data, DB form and normalized form.  DB form is the \"legacy\" form, which
  uses unqualified keywords, which map directly to column names via Toucan.  Normalized form, on the other hand, uses
  namespaced keywords and generally \"unwraps\" the semantic structures as much as possible.

  In general, operations/manipulations should happen on the normalized form, and when the DB form is needed again (ex:
  for updating the database), the map can be converted back."
  #?@
      (:clj
       [(:require [cheshire.core :as json]
                  [clojure.set :as set]
                  [clojure.spec.alpha :as s]
                  [medley.core :as m]
                  [metabase.mbql.normalize :as mbql.normalize])]
       :cljs
       [(:require [cljs.js :as js]
                  [cljs.reader :as cljs-reader]
                  [clojure.set :as set]
                  [clojure.spec.alpha :as s]
                  [medley.core :as m]
                  [metabase.mbql.normalize :as mbql.normalize])]))

(defn visualization-settings
  "Creates an empty visualization settings map. Intended for use in the context of a threading macro (ex: with
  `click-action` or a similar function following as the next form)."
  {:added "0.40.0"}
  []
  {})

(defn column-ref-for-id
  "Creates a normalized column ref map for the given field ID. This becomes a key in the `::column-settings` map."
  {:added "0.40.0"}
  [field-id]
  {::field-id field-id})

(s/def ::field-id integer?)

(defn column-ref-for-column-name
  "Creates a normalized column ref map for the given `col-name`. This becomes a key in the `::column-settings` map."
  {:added "0.40.0"}
  [col-name]
  {::column-name col-name})

(s/def ::column-name string?)

(defn column-ref-for-qualified-name
  "Creates a normalized column ref map for the given fully qualified name (string). This becomes the key in the
  `::column-settings` map."
  {:added "0.40.0"}
  [field-qualified-name]
  {::field-qualified-name field-qualified-name})

(s/def ::field-id string?)

(defn keyname
  "Returns the full string name of the keyword `kw`, including any \"namespace\" portion followed by forward slash.

  From https://clojuredocs.org/clojure.core/name#example-58264f85e4b0782b632278bf
  Clojure interprets slashes as keyword/name separators, so we need to do something hacky to get the \"full\" name here
  because our \"keyword value\" (as parsed from JSON/YAML/etc.) might actually look like the string version of a
  Clojure vector, which itself can contain a fully qualified name for serialization"
  {:added "0.40.0"}
  [kw]
  (str (if-let [kw-ns (namespace kw)] (str kw-ns "/")) (name kw)))

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
  (let [parts           ((comp vec parse-json-string) (if (keyword? col-ref) (keyname col-ref) col-ref))
        [kind & params] parts]
    (case kind
      "ref"  (let [[[t id & _]] params]
               (case t "field" (cond (int? id)    {::field-id id}
                                     (string? id) {::field-qualified-name id})))
      "name" {::column-name (first params)})))

(defn- with-col-settings [settings]
  (if (contains? settings ::column-settings)
    settings
    (assoc settings ::column-settings {})))

(defn crossfilter-click-action
  "Creates a crossfilter click action with the given `param-mapping`, in the normalized form."
  {:added "0.40.0"}
  [param-mapping]
  {::click-behavior-type ::cross-filter
   ::parameter-mapping   param-mapping})

(defn url-click-action
  "Creates a URL click action linking to a `url-template`, in the normalized form."
  {:added "0.40.0"}
  [url-template]
  {::click-behavior-type ::link
   ::link-type           ::url
   ::link-template       url-template})

(defn entity-click-action
  "Creates a click action linking to an entity having `entity-type` with ID `entity-id`, in the normalized form.
  `parameter-mapping` is an optional argument."
  {:added "0.40.0"}
  [entity-type entity-id & [parameter-mapping]]
  (cond-> {::click-behavior-type ::link
           ::link-type           entity-type
           ::link-target-id      entity-id}
          (some? parameter-mapping) (assoc ::parameter-mapping parameter-mapping)))

(defn with-click-action
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`, and adds it to the given `settings`. This happens in the normalized form, and hence this should be
  passed the output of another fn (including, currently, `visualization-settings`). If the given `from-field-id`
  already has a click action, it will be replaced."
  {:added "0.40.0"}
  [settings col-key action]
  (-> settings
      with-col-settings
      (update-in [::column-settings] #(assoc % col-key {::click-behavior action}))))

(defn with-entity-click-action
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`. This happens in the normalized form, and hence this should be passed the output of another fn
  (including, currently, `visualization-settings`). If the given `from-field-id` already has a click action, it will
  be replaced."
  {:added "0.40.0"}
  [settings from-field-id to-entity-type to-entity-id & [parameter-mapping]]
  (with-click-action settings (column-ref-for-id from-field-id) (entity-click-action
                                                                 to-entity-type
                                                                 to-entity-id
                                                                 parameter-mapping)))

(defn fk-parameter-mapping
  "Creates a parameter mapping for `source-col-name` (`source-field-id`) to `target-field-id` in normalized form."
  {:added "0.40.0"}
  [source-col-name source-field-id target-field-id]
  (let [id         [:dimension [:fk-> [:field-id source-field-id] [:field-id target-field-id]]]
        dimension  {:dimension [:field target-field-id {:source-field source-field-id}]}]
    {id #::{:param-mapping-id     id
            :param-mapping-source #::{:param-ref-type "column"
                                      :param-ref-id   source-col-name
                                      :param-ref-name source-col-name}
            :param-mapping-target #::{:param-ref-type "dimension"
                                      :param-ref-id    id
                                      :param-dimension dimension}}}))

(def ^:private db-to-normalized-click-action-type
  {"link"        ::link
   "crossfilter" ::cross-filter})

(def ^:private normalized-to-db-click-action-type
  (set/map-invert db-to-normalized-click-action-type))

(def ^:private db-to-normalized-link-type
  {"question"    ::card
   "dashboard"   ::dashboard
   "url"         ::url})

(def ^:private normalized-to-db-link-type
  (set/map-invert db-to-normalized-link-type))

(def ^:private db->norm-click-behavior-keys
  {:targetId         ::link-target-id
   :linkTemplate     ::link-template
   :linkTextTemplate ::link-text-template
   :type             ::click-behavior-type
   :linkType         ::link-type})

;; target ID can be the auto generated ID or fully qualified name for serialization
(s/def ::link-target-id (s/or :int int? :fully-qualified-name string?))
(s/def ::link-template string?)
(s/def ::link-text-template string?)

(def ^:private norm->db-click-behavior-keys
  (set/map-invert db->norm-click-behavior-keys))

(def ^:private db->norm-column-settings-keys
  {:column_title      ::column-title
   :date_style        ::date-style
   :date_abbreviate   ::date-abbreviate
   :time_style        ::time-style
   :time_enabled      ::time-enabled
   :decimals          ::decimals
   :number_separators ::number-separators
   :number_style      ::number-style
   :prefix            ::prefix
   :suffix            ::suffix
   :view_as           ::view-as
   :link_text         ::link-text})

(s/def ::column-title string?)
(s/def ::date-style #{"M/D/YYYY" "D/M/YYYY" "YYYY/M/D" "MMMM D, YYYY" "D MMMM, YYYY" "dddd, MMMM D, YYYY"})
(s/def ::date-abbreviate boolean?)
(s/def ::time-style #{"h:mm A" "k:mm" "h A"})
(s/def ::time-enabled #{nil "minutes" "seconds" "milliseconds"})
(s/def ::decimals pos-int?)
(s/def ::number-separators #(or nil? (and string? (= 2 (count %)))))
(s/def ::number-style #{"decimal" "percent" "scientific" "currency"})
(s/def ::prefix string?)
(s/def ::suffix string?)
(s/def ::view-as string?)
(s/def ::link-text string?)

(def ^:private norm->db-column-settings-keys
  (set/map-invert db->norm-column-settings-keys))

(def ^:private db->norm-param-mapping-val-keys
  {:id      ::param-mapping-id
   :source  ::param-mapping-source
   :target  ::param-mapping-target})

(s/def ::param-mapping-id string?)

(def ^:private norm->db-param-mapping-val-keys
  (set/map-invert db->norm-param-mapping-val-keys))

(def ^:private db->norm-param-ref-keys
  {:type      ::param-ref-type
   :id        ::param-ref-id
   :name      ::param-ref-name
   :dimension ::param-dimension})

(s/def ::param-ref-type #{"column" "dimension" "variable" "parameter"})
(s/def ::param-ref-id string?)
(s/def ::param-ref-name string?)

(s/def ::param-mapping-source (s/keys :req [::param-ref-id ::param-ref-type] :opt [::param-ref-name]))
(s/def ::param-mapping-target ::param-mapping-source)

(def ^:private norm->db-param-ref-keys
  (set/map-invert db->norm-param-ref-keys))

(defn- db->norm-param-ref [parsed-id param-ref]
  (cond-> (set/rename-keys param-ref db->norm-param-ref-keys)
    (= "dimension" (:type param-ref)) (assoc ::param-ref-id parsed-id)))

(defn- norm->db-param-ref [id-str param-ref]
  (cond-> (set/rename-keys param-ref norm->db-param-ref-keys)
    (= "dimension" (::param-ref-type param-ref)) (assoc :id id-str)))

(defn db->norm-param-mapping
  "Converts a `parameter-mapping` (i.e. value of `:parameterMapping`) from DB to normalized form"
  {:added "0.40.0"}
  [parameter-mapping]
  (if (nil? parameter-mapping)
    nil
    ;; k is "[\"dimension\",[\"fk->\",[\"field-id\",%d],[\"field-id\",%d]]]"
    ;; v is {:id <same long string> :source <param-ref> :target <param-ref>}
    (reduce-kv (fn [acc k v]
                 (let [[new-k new-v]
                       (if (= "dimension" (get-in v [:target :type]))
                         (let [parsed-id (-> (if (keyword? k) (keyname k) k)
                                             parse-json-string
                                             mbql.normalize/normalize-tokens)]
                           [parsed-id (cond-> v
                                        (:source v) (assoc ::param-mapping-source
                                                           (db->norm-param-ref parsed-id (:source v)))
                                        (:target v) (assoc ::param-mapping-target
                                                           (db->norm-param-ref parsed-id (:target v)))
                                        :always     (-> ; from outer cond->
                                                        (assoc ::param-mapping-id parsed-id)
                                                        (dissoc :source :target :id)))])
                         [k (-> v
                                (m/update-existing :source (partial db->norm-param-ref nil))
                                (m/update-existing :target (partial db->norm-param-ref nil))
                                (set/rename-keys db->norm-param-mapping-val-keys))])]
                   (assoc acc new-k new-v))) {} parameter-mapping)))

(defn- norm->db-dimension-param-mapping [k v]
  (let [str-id (encode-json-string k)]
    [str-id (cond-> v
                    (::param-mapping-source v) (assoc :source
                                                      (norm->db-param-ref
                                                       str-id
                                                       (::param-mapping-source v)))
                    (::param-mapping-target v) (assoc :target
                                                      (norm->db-param-ref
                                                       str-id
                                                       (::param-mapping-target v)))
                    :always                    (->
                                                (assoc :id str-id)
                                                (dissoc ::param-mapping-id
                                                        ::param-mapping-source
                                                        ::param-mapping-target)))]))

(defn- norm->db-generic-param-mapping [pm-k pm-v]
  (let [new-v (into {} (remove (fn [[k v]]
                                 ;; don't keep source or target unless not nil
                                 (and (nil? v)
                                      (contains? #{::param-mapping-source ::param-mapping-target} k)))) pm-v)]
    [pm-k (-> new-v
              (m/update-existing ::param-mapping-source (partial norm->db-param-ref nil))
              (m/update-existing ::param-mapping-target (partial norm->db-param-ref nil))
              (set/rename-keys norm->db-param-mapping-val-keys))]))

(defn norm->db-param-mapping
  "Converts a `parameter-mapping` (i.e. value of `::parameter-mapping`) from normalized to DB form."
  {:added "0.40.0"}
  [parameter-mapping]
  (if (nil? parameter-mapping)
    nil
    (reduce-kv (fn [acc k v]
                 (let [[new-k new-v]
                       (if (= "dimension" (get-in v [::param-mapping-target ::param-ref-type]))
                         (norm->db-dimension-param-mapping k v)
                         (norm->db-generic-param-mapping k v))]
                   (assoc acc new-k new-v))) {} parameter-mapping)))

(defn- db->norm-click-behavior [v]
  (-> v
      (assoc
        ::click-behavior-type
        (db-to-normalized-click-action-type (:type v)))
      (dissoc :type)
      (assoc ::link-type (db-to-normalized-link-type (:linkType v)))
      (dissoc :linkType)
      (cond-> ; from outer ->
        (some? (:parameterMapping v)) (assoc ::parameter-mapping (db->norm-param-mapping (:parameterMapping v))))
      (dissoc :parameterMapping)
      (set/rename-keys db->norm-click-behavior-keys)))

(defn- db-form-entry-to-normalized
  "Converts a :column_settings DB form to qualified form. Does the opposite of
  `db-normalized-entry-to-db-form-entry-to-normalized`."
  [m k v]
  (case k
    :click_behavior (assoc m ::click-behavior (db->norm-click-behavior v))
    (assoc m (db->norm-column-settings-keys k) v)))

(defn from-db-form
  "Converts a DB form of visualization settings (i.e. map with key `:visualization_settings`) into the equivalent
  normalized form (i.e. map with key `::visualization-settings`."
  {:added "0.40.0"}
  [vs]
  (cond-> vs
          ;; column_settings at top level; ex: table card
          (:column_settings vs)
          (assoc ::column-settings (->> (:column_settings vs)
                                        (m/map-kv (fn [k v]
                                                    (let [k1 (parse-column-ref k)
                                                          v1 (reduce-kv db-form-entry-to-normalized {} v)]
                                                      [k1 v1])))))

          ;; click behavior key at top level; ex: non-table card
          (:click_behavior vs)
          (assoc ::click-behavior (db->norm-click-behavior (:click_behavior vs)))

          :always
          (dissoc :column_settings :click_behavior)))

(defn- norm->db-click-behavior-value [v]
  (-> v
      (assoc
        :type
        (normalized-to-db-click-action-type (::click-behavior-type v)))
      (dissoc ::click-behavior-type)
      (cond-> ; from outer ->
        (some? (::parameter-mapping v)) (assoc :parameterMapping (norm->db-param-mapping (::parameter-mapping v))))
      (dissoc ::parameter-mapping)
      (assoc :linkType (normalized-to-db-link-type (::link-type v)))
      (dissoc ::link-type)
      (set/rename-keys norm->db-click-behavior-keys)))

(defn- norm->db-click-behavior [click-behavior]
  (cond-> click-behavior
    (some? (::parameter-mapping click-behavior))
    (-> (assoc :parameterMapping (norm->db-param-mapping (::parameter-mapping click-behavior)))
        (dissoc ::parameter-mapping))

    :always (-> (assoc :type (normalized-to-db-click-action-type (::click-behavior-type click-behavior)))
                (m/assoc-some :linkType (normalized-to-db-link-type (::link-type click-behavior)))
                (dissoc ::link-type ::click-behavior-type ::parameter-mapping)
                (set/rename-keys norm->db-click-behavior-keys))))

(defn- normalized-entry-to-db-form
  "Converts a ::column-settings entry from qualified form to DB form. Does the opposite of
  `db-form-entry-to-normalized`."
  [m k v]
  (case k
    ::click-behavior (assoc m :click_behavior (norm->db-click-behavior v))
    (assoc m (norm->db-column-settings-keys k) v)))

(defn db-form-column-ref
  "Creates the DB form of a column ref (i.e. the key in the column settings map) for the given normalized args. Either
  `::field-id` or `::field-qualified-name` keys will be checked in the arg map to build the corresponding column ref
  map."
  {:added "0.40.0"}
  [{:keys [::field-id ::field-qualified-name ::column-name]}]
  (-> (cond
        (some? field-id)             ["ref" ["field" field-id nil]]
        (some? field-qualified-name) ["ref" ["field" field-qualified-name nil]]
        (some? column-name)          ["name" column-name])
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
  (cond-> settings
    (::column-settings settings) (-> ; from cond->
                                     (assoc :column_settings (db-form-column-settings (::column-settings settings)))
                                     (dissoc ::column-settings))
    (::click-behavior settings)  (-> ; from cond->
                                     (assoc :click_behavior (norm->db-click-behavior-value (::click-behavior settings)))
                                     (dissoc ::click-behavior))))
