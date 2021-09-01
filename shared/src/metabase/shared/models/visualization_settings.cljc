(ns metabase.shared.models.visualization-settings
  "Utility code for dealing with visualization settings, from cards, dashboard cards, etc.

  There are two ways of representing the same data, DB form and normalized form.  DB form is the \"legacy\" form, which
  uses unqualified keywords, which map directly to column names via Toucan.  Normalized form, on the other hand, uses
  namespaced keywords and generally \"unwraps\" the semantic structures as much as possible.

  In general, operations/manipulations should happen on the normalized form, and when the DB form is needed again (ex:
  for updating the database), the map can be converted back.  This can be done fairly easily with the threading macro,
  ex:

  ```
  (-> (mb.viz/from-db-form (:visualization_settings my-card))
      tweak-viz-settings
      tweak-more-viz-settings
      mb.viz/db-form)
  ```

  In general, conversion functions in this namespace (i.e. those that convert various pieces from one form to the other)
  will be prefixed with either `db->norm` or `norm->db`, depending on which direction they implement.
  "
  #?@
      (:clj
       [(:require [cheshire.core :as json]
                  [clojure.set :as set]
                  [clojure.spec.alpha :as s]
                  [medley.core :as m]
                  [metabase.mbql.normalize :as mbql.normalize])]
       :cljs
       [(:require [cljs.js :as js]
                  [clojure.set :as set]
                  [clojure.spec.alpha :as s]
                  [medley.core :as m]
                  [metabase.mbql.normalize :as mbql.normalize])]))

;;; -------------------------------------------------- Main API --------------------------------------------------


;;; -------------------------------------------------- Specs --------------------------------------------------

(s/def ::field-id integer?)
(s/def ::column-name string?)

;; a field reference that is a string, which could be a reference to some named field (ex: output of an aggregation)
;; or to a fully qualified field name (in the context of serialization); we won't attempt to interpret it here, only
;; report that it's a string and set it in the ref map appropriately
(s/def ::field-str string?)

(s/def ::field-metadata (s/or :nil? nil? :map? map?))
(s/def ::column-ref (s/keys :opt [::field-id ::column-name ::field-str ::field-metadata]))

(s/def ::column-settings (s/keys))
(s/def ::click-behavior (s/keys))
(s/def ::visualization-settings (s/keys :opt [::column-settings ::click-behavior]))

(s/def ::db-column-ref-vec (s/or :field (s/tuple (partial = "ref") (s/tuple (partial = "field")
                                                                            (s/or :field-id int? :field-str string?)
                                                                            (s/or :field-metadata map? :nil nil?)))
                                 :column-name (s/tuple (partial = "name") string?)))

(s/def ::click-behavior-type keyword? #_(s/or :cross-filter ::cross-filter
                                              :link         ::link))

(s/def ::click-behavior (s/keys :req [::click-behavior-type]
                                :opt [::link-type ::parameter-mapping ::link-template ::link-text ::link-target-id]))

;; TODO: add more specific shape for this one
(s/def ::parameter-mapping (s/or :nil? nil? :map? map?))

;; target ID can be the auto generated ID or fully qualified name for serialization
(s/def ::link-target-id (s/or :int int? :fully-qualified-name string?))
(s/def ::link-template string?)
(s/def ::link-text-template string?)

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

(s/def ::param-mapping-id string?)

(s/def ::param-ref-type #{"column" "dimension" "variable" "parameter"})
(s/def ::param-ref-id string?)
(s/def ::param-ref-name string?)

(s/def ::param-mapping-source (s/keys :req [::param-ref-id ::param-ref-type] :opt [::param-ref-name]))
(s/def ::param-mapping-target ::param-mapping-source)

(s/def ::db-column-ref (s/or :string? string? :vector? vector? :keyword? keyword?))

(s/def ::entity-type #{::card ::dashboard})

;;; ----------------------------------------------- Parsing fns -----------------------------------------------

(defn field-id->column-ref
  "Creates a normalized column ref map for the given field ID. This becomes a key in the `::column-settings` map.

  If passed, `field-metadata` is also included in the map (but not interpreted)."
  {:added "0.40.0"}
  [field-id & [field-metadata]]
  (cond-> {::field-id field-id}
    (some? field-metadata) (assoc ::field-metadata field-metadata)))

(s/fdef field-id->column-ref
  :args (s/cat :field-id int? :field-metadata (s/? ::field-metadata))
  :ret  ::column-ref)

(defn column-name->column-ref
  "Creates a normalized column ref map for the given `col-name`. This becomes a key in the `::column-settings` map."
  {:added "0.40.0"}
  [col-name]
  {::column-name col-name})

(s/fdef column-name->column-ref
  :args (s/cat :col-name string?)
  :ret  ::column-ref)

(defn field-str->column-ref
  "Creates a normalized column ref map for the given field string (which could be the name of a \"synthetic\" field,
  such as the output of an aggregation, or a fully qualified field name in the context of serialization. The
  visualization settings code will not make any attempt to interpret this string. It becomes the
  key in the `::column-settings` map.

  If passed, `field-metadata` is also included in the map (but not interpreted)."
  {:added "0.40.0"}
  [field-qualified-name & [field-metadata]]
  (cond-> {::field-str field-qualified-name}
    (some? field-metadata) (assoc ::field-metadata field-metadata)))

(s/fdef field-str->column-ref
        :args (s/cat :field-qualified-name string? :field-metadata (s/? ::field-metadata))
        :ret ::column-ref)

(defn- keyname
  "Returns the full string name of the keyword `kw`, including any \"namespace\" portion followed by forward slash.

  From https://clojuredocs.org/clojure.core/name#example-58264f85e4b0782b632278bf
  Clojure interprets slashes as keyword/name separators, so we need to do something hacky to get the \"full\" name here
  because our \"keyword value\" (as parsed from JSON/YAML/etc.) might actually look like the string version of a
  Clojure vector, which itself can contain a fully qualified name for serialization"
  {:added "0.40.0"}
  [kw]
  (str (if-let [kw-ns (namespace kw)] (str kw-ns "/")) (name kw)))

(s/fdef keyname
  :args (s/cat :kw keyword?)
  :ret  string?)

(defn- parse-json-string
  "Parse the given `json-str` to a map. In Clojure, this uses Cheshire. In Clojurescript, it calls `.parse` with
  `js/JSON` and threads that to `js->clj`."
  [json-str]
  #?(:clj  (json/parse-string json-str)
     :cljs (-> (.parse js/JSON json-str)
               js->clj)))

(s/fdef parse-json-string
  :args (s/cat :json-str string?)
  :ret  (s/or :map map? :seq seqable?))

(defn- encode-json-string
  "Encode the given `obj` map as a JSON string. In Clojure, this uses Cheshire. In Clojurescript, it uses
  `cljs.core.clj->js` in conjunction with `cljs.js`."
  [obj]
  #?(:clj  (json/encode obj)
     :cljs (.stringify js/JSON (clj->js obj))))

(s/fdef encode-json-string
  :args (s/cat :obj (s/or :map map? :seq seqable?))
  :ret  string?)

(defn db->norm-column-ref
  "Converts a (parsed, vectorized) DB-form column ref to the equivalent normal form.

  Does the opposite of `norm->db-column-ref`"
  [column-ref-vec]
  (let [parsed (s/conform ::db-column-ref-vec column-ref-vec)]
    (if (s/invalid? parsed)
      (throw (ex-info "Invalid input" (s/explain-data ::db-column-ref-vec column-ref-vec)))
      (let [[m parts] parsed]
        (case m
          :field
          (let [[_ [_ [_ [id-or-str v] [_ field-md]]]] parsed]
            (cond-> (case id-or-str
                      :field-id {::field-id v}
                      :field-str {::field-str v})
                    (some? field-md) (assoc ::field-metadata field-md)))
          :column-name
          {::column-name (nth parts 1)})))))

(s/fdef db->norm-column-ref
  :args (s/cat :column-ref ::db-column-ref-vec)
  :ret  ::column-ref)

(defn parse-db-column-ref
  "Parses the DB representation of a column reference, and returns the equivalent normal form.

  The `column-ref` parameter can be a string, a vector, or keyword.

  If a string, it is parsed as JSON, and the value is passed to `db->norm-column-ref` for conversion.

  If a keyword (which is produced by YAML parsing, for instance), it will first be converted to its full name. \"Full\"
  means that the portions before and after any slashes will be included verbatim (via the `keyname` helper fn). This is
  necessary because our serialization code considers a forward slash to be a legitimate portion of a fully qualified
  name, whereas Clojure considers it to be a namespace/local name separator. Once converted thusly, that resulting
  string value will be passed to `db->norm-column-ref` for conversion, just as in the case above.

  If a vector, it is assumed that vector is already in DB normalized form, so it is passed directly to
  `db->norm-column-ref` for conversion.

  Returns a map representing the column reference (conforming to the normal form `::column-ref` spec), by delegating
  to `db->norm-column-ref`."
  {:added "0.40.0"}
  [column-ref]
  (let [parsed (s/conform ::db-column-ref column-ref)]
    (if (s/invalid? parsed)
      (throw (ex-info "Invalid input" (s/explain-data ::db-column-ref column-ref)))
      (let [[k v]    parsed
            ref->vec (case k
                        :string?  (comp vec parse-json-string)
                        :keyword? (comp vec parse-json-string keyname)
                        :vector?  identity)]
        (db->norm-column-ref (ref->vec v))))))

(s/fdef parse-db-column-ref
  :args (s/cat :column-ref ::db-column-ref)
  :ret ::column-ref)

;;; ------------------------------------------------ Builder fns ------------------------------------------------

(defn visualization-settings
  "Creates an empty visualization settings map. Intended for use in the context of a threading macro (ex: with
  `click-action` or a similar function following as the next form)."
  {:added "0.40.0"}
  []
  {})

(defn- with-col-settings [settings]
  (if (contains? settings ::column-settings)
    settings
    (assoc settings ::column-settings {})))

(s/fdef with-col-settings
  :args (s/cat :settings ::visualization-settings)
  :ret  ::visualization-settings)

(defn crossfilter-click-action
  "Creates a crossfilter click action with the given `param-mapping`, in the normalized form."
  {:added "0.40.0"}
  [param-mapping]
  {::click-behavior-type ::cross-filter
   ::parameter-mapping   param-mapping})

(s/fdef crossfilter-click-action
  :args (s/cat :param-mapping ::parameter-mapping)
  :ret  ::click-behavior)

(defn url-click-action
  "Creates a URL click action linking to a `url-template`, in the normalized form."
  {:added "0.40.0"}
  [url-template]
  {::click-behavior-type ::link
   ::link-type           ::url
   ::link-template       url-template})

(s/fdef url-click-action
  :args (s/cat :url-template string?)
  :ret  ::click-behavior)

(defn entity-click-action
  "Creates a click action linking to an entity having `entity-type` with ID `entity-id`, in the normalized form.
  `parameter-mapping` is an optional argument."
  {:added "0.40.0"}
  [entity-type entity-id & [parameter-mapping]]
  (cond-> {::click-behavior-type ::link
           ::link-type           entity-type
           ::link-target-id      entity-id}
          (some? parameter-mapping) (assoc ::parameter-mapping parameter-mapping)))


(s/fdef entity-click-action
  :args (s/cat :entity-type ::entity-type :entity-id int? :parameter-mapping ::parameter-mapping)
  :ret  ::click-behavior)

(defn with-click-action
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`, and adds it to the given `settings`. This happens in the normalized form, and hence this should be
  passed the output of another fn (including, currently, `visualization-settings`). If the given `from-field-id`
  already has a click action, it will be replaced."
  {:added "0.40.0"}
  [settings col-key action]
  (-> settings
      with-col-settings
      (update-in [::column-settings] assoc col-key {::click-behavior action})))

(s/fdef with-click-action
  :args (s/cat :settings map? :col-key ::column-ref :action ::click-behavior)
  :ret  ::click-behavior)

(defn with-entity-click-action
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`. This happens in the normalized form, and hence this should be passed the output of another fn
  (including, currently, `visualization-settings`). If the given `from-field-id` already has a click action, it will
  be replaced."
  {:added "0.40.0"}
  [settings from-field-id to-entity-type to-entity-id & [parameter-mapping]]
  (with-click-action settings (field-id->column-ref from-field-id) (entity-click-action
                                                                    to-entity-type
                                                                    to-entity-id
                                                                    parameter-mapping)))

(s/fdef with-entity-click-action
  :args (s/cat :settings          map?
               :from-field-id     int?
               :to-entity-type    ::entity-type
               :to-entity-id      int?
               :parameter-mapping (s/? ::parameter-mapping) )
  :ret  ::click-behavior)

(defn fk-parameter-mapping
  "Creates a parameter mapping for `source-col-name` (`source-field-id`) to `target-field-id` in normalized form."
  {:added "0.40.0"}
  [source-col-name source-field-id target-field-id]
  (let [id         [:dimension [:fk-> [:field source-field-id nil] [:field target-field-id nil]]]
        dimension  {:dimension [:field target-field-id {:source-field source-field-id}]}]
    {id #::{:param-mapping-id     id
            :param-mapping-source #::{:param-ref-type "column"
                                      :param-ref-id   source-col-name
                                      :param-ref-name source-col-name}
            :param-mapping-target #::{:param-ref-type "dimension"
                                      :param-ref-id    id
                                      :param-dimension dimension}}}))

(s/fdef fk-parameter-mapping
  :args (s/cat :source-col-name string? :source-field-id int? :target-field-id int?)
  :ret  map?)

;;; ---------------------------------------------- Conversion fns ----------------------------------------------

(def ^:private db->norm-click-action-type
  {"link"        ::link
   "crossfilter" ::cross-filter})

(def ^:private norm->db-click-action-type
  (set/map-invert db->norm-click-action-type))

(def ^:private db->norm-link-type
  {"question"    ::card
   "dashboard"   ::dashboard
   "url"         ::url})

(def ^:private norm->db-link-type
  (set/map-invert db->norm-link-type))

(def ^:private db->norm-click-behavior-keys
  {:targetId         ::link-target-id
   :linkTemplate     ::link-template
   :linkTextTemplate ::link-text-template
   :type             ::click-behavior-type
   :linkType         ::link-type})

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

(def ^:private norm->db-column-settings-keys
  (set/map-invert db->norm-column-settings-keys))

(def ^:private db->norm-param-mapping-val-keys
  {:id      ::param-mapping-id
   :source  ::param-mapping-source
   :target  ::param-mapping-target})

(def ^:private norm->db-param-mapping-val-keys
  (set/map-invert db->norm-param-mapping-val-keys))

(def ^:private db->norm-param-ref-keys
  {:type      ::param-ref-type
   :id        ::param-ref-id
   :name      ::param-ref-name
   :dimension ::param-dimension})

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
        (db->norm-click-action-type (:type v)))
      (dissoc :type)
      (assoc ::link-type (db->norm-link-type (:linkType v)))
      (dissoc :linkType)
      (cond-> ; from outer ->
        (some? (:parameterMapping v)) (assoc ::parameter-mapping (db->norm-param-mapping (:parameterMapping v))))
      (dissoc :parameterMapping)
      (set/rename-keys db->norm-click-behavior-keys)))

(defn- db->norm-column-settings-entry
  "Converts a :column_settings DB form to qualified form. Does the opposite of
  `norm->db-column-settings-entry`."
  [m k v]
  (case k
    :click_behavior (assoc m ::click-behavior (db->norm-click-behavior v))
    (assoc m (db->norm-column-settings-keys k) v)))

(defn db->norm
  "Converts a DB form of visualization settings (i.e. map with key `:visualization_settings`) into the equivalent
  normalized form (i.e. map with keys `::column-settings`, `::click-behavior`, etc.).

  Does the opposite of `norm->db`."
  {:added "0.40.0"}
  [vs]
  (cond-> vs
          ;; column_settings at top level; ex: table card
          (:column_settings vs)
          (assoc ::column-settings (->> (:column_settings vs)
                                        (m/map-kv (fn [k v]
                                                    (let [k1 (parse-db-column-ref k)
                                                          v1 (reduce-kv db->norm-column-settings-entry {} v)]
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
        (norm->db-click-action-type (::click-behavior-type v)))
      (dissoc ::click-behavior-type)
      (cond-> ; from outer ->
        (some? (::parameter-mapping v)) (assoc :parameterMapping (norm->db-param-mapping (::parameter-mapping v))))
      (dissoc ::parameter-mapping)
      (assoc :linkType (norm->db-link-type (::link-type v)))
      (dissoc ::link-type)
      (set/rename-keys norm->db-click-behavior-keys)))

(defn- norm->db-click-behavior [click-behavior]
  (cond-> click-behavior
    (some? (::parameter-mapping click-behavior))
    (-> (assoc :parameterMapping (norm->db-param-mapping (::parameter-mapping click-behavior)))
        (dissoc ::parameter-mapping))

    :always (-> (assoc :type (norm->db-click-action-type (::click-behavior-type click-behavior)))
                (m/assoc-some :linkType (norm->db-link-type (::link-type click-behavior)))
                (dissoc ::link-type ::click-behavior-type ::parameter-mapping)
                (set/rename-keys norm->db-click-behavior-keys))))

(defn- norm->db-column-settings-entry
  "Converts a ::column-settings entry from qualified form to DB form. Does the opposite of
  `db->norm-column-settings-entry`."
  [m k v]
  (case k
    ::click-behavior (assoc m :click_behavior (norm->db-click-behavior v))
    (assoc m (norm->db-column-settings-keys k) v)))

(defn norm->db-column-ref
  "Creates the DB form of a column ref (i.e. the key in the column settings map) for the given normalized args. Either
  `::field-id` or `::field-str` keys will be checked in the arg map to build the corresponding column ref map."
  {:added "0.40.0"}
  [{:keys [::field-id ::field-str ::column-name ::field-metadata]}]
  (-> (cond
        (some? field-id) ["ref" ["field" field-id field-metadata]]
        (some? field-str) ["ref" ["field" field-str field-metadata]]
        (some? column-name) ["name" column-name])
      encode-json-string))

(defn- norm->db-column-settings
  "Converts an entire column settings map from normalized to DB form."
  [col-settings]
  (->> col-settings
       (m/map-kv (fn [k v]
                   [(norm->db-column-ref k) (reduce-kv norm->db-column-settings-entry {} v)]))))

(defn norm->db
  "Converts the normalized form of visualization settings (i.e. a map having
  `::column-settings` into the equivalent DB form (i.e. a map having `:column_settings`).

  Does The opposite of `db->norm`."
  {:added "0.40.0"}
  [settings]
  (cond-> settings
    (::column-settings settings) (-> ; from cond->
                                     (assoc :column_settings (norm->db-column-settings (::column-settings settings)))
                                     (dissoc ::column-settings))
    (::click-behavior settings)  (-> ; from cond->
                                     (assoc :click_behavior (norm->db-click-behavior-value (::click-behavior settings)))
                                     (dissoc ::click-behavior))))
