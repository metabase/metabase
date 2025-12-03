(ns metabase.models.visualization-settings
  "Utility code for dealing with visualization settings, from cards, dashboard cards, etc.

  There are two ways of representing the same data, DB form and normalized form.  DB form is the \"legacy\" form, which
  uses unqualified keywords, which map directly to column names via Toucan.  Normalized form, on the other hand, uses
  namespaced keywords and generally \"unwraps\" the semantic structures as much as possible.

  In general, operations/manipulations should happen on the normalized form, and when the DB form is needed again (ex:
  for updating the database), the map can be converted back.  This can be done fairly easily with the threading macro,
  ex:

  ```
  (-> (mb.viz/db->norm (:visualization_settings my-card))
      tweak-viz-settings
      tweak-more-viz-settings
      mb.viz/norm->db)
  ```

  In general, conversion functions in this namespace (i.e. those that convert various pieces from one form to the other)
  will be prefixed with either `db->norm` or `norm->db`, depending on which direction they implement.
  "
  (:require
   #?@(:clj [[metabase.util.json :as json]])
   [clojure.set :as set]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Main API --------------------------------------------------

;;; -------------------------------------------------- Specs --------------------------------------------------

(def ^:private field-metadata-schema [:maybe map?])
;; field-str - a field reference that is a string, which could be a reference to some named field (ex: output of an
;; aggregation) or to a fully qualified field name (in the context of serialization); we won't attempt to interpret it
;; here, only report that it's a string and set it in the ref map appropriately
(def ^:private column-ref-schema
  [:map
   [::field-id {:optional true} ::lib.schema.id/field]
   [::column-name {:optional true} string?]
   [::field-str {:optional true} string?]
   [::field-metadata {:optional true} field-metadata-schema]])

(def ^:private db-column-ref-vec-schema
  [:orn
   [:field [:tuple
            [:= "ref"]
            [:tuple
             [:= "field"]
             [:orn [:field-id ::lib.schema.id/field] [:field-str string?]]
             [:orn [:field-metadata map?] [:nil nil?]]]]]
   [:expression [:tuple [:= "ref"] [:tuple [:= "expression"] string?]]]
   [:column-name [:tuple [:= "name"] string?]]])

;; TODO: add more specific shape for this one
(def ^:private parameter-mapping-schema [:maybe map?])

(def ^:private click-behavior-schema
  [:map
   [::click-behavior-type {:optional true} keyword?]
   [::link-type {:optional true} :any]
   [::parameter-mapping {:optional true} parameter-mapping-schema]
   [::link-template {:optional true} string?]
   [::link-text {:optional true} string?]
   ;; target ID can be the auto generated ID or fully qualified name for serialization
   [::link-target-id {:optional true} [:or ::lib.schema.id/field string?]]])

(def ^:private db-column-ref-schema
  [:orn [:string? string?] [:vector? vector?] [:keyword? keyword?]])

(def ^:private entity-type-schema [:or [:= ::card] [:= ::dashboard]])

;;; ----------------------------------------------- Parsing fns -----------------------------------------------

(mu/defn field-id->column-ref :- column-ref-schema
  "Creates a normalized column ref map for the given field ID. This becomes a key in the `::column-settings` map.

  If passed, `field-metadata` is also included in the map (but not interpreted)."
  {:added "0.40.0"}
  ([field-id :- ::lib.schema.id/field]
   {::field-id field-id})
  ([field-id :- ::lib.schema.id/field
    field-metadata :- [:maybe field-metadata-schema]]
   (cond-> {::field-id field-id}
     (some? field-metadata) (assoc ::field-metadata field-metadata))))

(mu/defn column-name->column-ref :- column-ref-schema
  "Creates a normalized column ref map for the given `col-name`. This becomes a key in the `::column-settings` map."
  {:added "0.40.0"}
  [col-name :- :string]
  {::column-name col-name})

(mu/defn field-str->column-ref :- column-ref-schema
  "Creates a normalized column ref map for the given field string (which could be the name of a \"synthetic\" field,
  such as the output of an aggregation, or a fully qualified field name in the context of serialization. The
  visualization settings code will not make any attempt to interpret this string. It becomes the
  key in the `::column-settings` map.

  If passed, `field-metadata` is also included in the map (but not interpreted)."
  {:added "0.40.0"}
  ([field-qualified-name :- :string]
   {::field-str field-qualified-name})
  ([field-qualified-name :- :string, field-metadata :- [:maybe field-metadata-schema]]
   (cond-> {::field-str field-qualified-name}
     (some? field-metadata) (assoc ::field-metadata field-metadata))))

(mu/defn- keyname :- :string
  "Returns the full string name of the keyword `kw`, including any \"namespace\" portion followed by forward slash.

  From https://clojuredocs.org/clojure.core/name#example-58264f85e4b0782b632278bf
  Clojure interprets slashes as keyword/name separators, so we need to do something hacky to get the \"full\" name here
  because our \"keyword value\" (as parsed from JSON/YAML/etc.) might actually look like the string version of a
  Clojure vector, which itself can contain a fully qualified name for serialization"
  {:added "0.40.0"}
  [kw :- keyword?]
  (str (when-let [kw-ns (namespace kw)] (str kw-ns "/")) (name kw)))

(defn- parse-json-string
  "Parse the given `json-str` to a map. In Clojure, this uses Cheshire. In Clojurescript, it calls `.parse` with
  `js/JSON` and threads that to `js->clj`."
  [json-str]
  #?(:clj  (json/decode json-str)
     :cljs (-> (.parse js/JSON json-str)
               js->clj)))

(defn- encode-json-string
  "Encode the given `obj` map as a JSON string. In Clojure, this uses Cheshire. In Clojurescript, it uses
  `cljs.core.clj->js` in conjunction with `cljs.js`."
  [obj]
  #?(:clj  (json/encode obj)
     :cljs (.stringify js/JSON (clj->js obj))))

(mu/defn db->norm-column-ref :- column-ref-schema
  "Converts a (parsed, vectorized) DB-form column ref to the equivalent normal form.

  Does the opposite of `norm->db-column-ref`"
  [column-ref-vec :- db-column-ref-vec-schema]
  (let [parsed (mc/parse db-column-ref-vec-schema column-ref-vec)]
    (if (= parsed ::mc/invalid)
      (throw (ex-info "Invalid input" (mr/explain db-column-ref-vec-schema column-ref-vec)))
      (let [{m :key, parts :value} parsed]
        (case m
          :field
          (let [[_ [_ {id-or-str :key, v :value} {field-md :value}]] parts]
            (cond-> (case id-or-str
                      :field-id {::field-id v}
                      :field-str {::field-str v})
              (some? field-md) (assoc ::field-metadata field-md)))
          :column-name
          {::column-name (nth parts 1)}
          :expression
          (let [[_ref [_expression column-name]] parts]
            {::column-name column-name}))))))

(mu/defn parse-db-column-ref :- column-ref-schema
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
  [column-ref :- db-column-ref-schema]
  (let [parsed (mc/parse db-column-ref-schema column-ref)]
    (if (= parsed ::mc/invalid)
      (throw (ex-info "Invalid input" (mr/explain db-column-ref-schema column-ref)))
      (let [{k :key, v :value} parsed
            ref->vec           (case k
                                 :string?  (comp vec parse-json-string)
                                 :keyword? (comp vec parse-json-string keyname)
                                 :vector?  identity)]
        (db->norm-column-ref (ref->vec v))))))

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

(mu/defn crossfilter-click-action :- click-behavior-schema
  "Creates a crossfilter click action with the given `param-mapping`, in the normalized form."
  {:added "0.40.0"}
  [param-mapping :- parameter-mapping-schema]
  {::click-behavior-type ::cross-filter
   ::parameter-mapping   param-mapping})

(mu/defn url-click-action :- click-behavior-schema
  "Creates a URL click action linking to a `url-template`, in the normalized form."
  {:added "0.40.0"}
  [url-template :- :string]
  {::click-behavior-type ::link
   ::link-type           ::url
   ::link-template       url-template})

(mu/defn entity-click-action :- click-behavior-schema
  "Creates a click action linking to an entity having `entity-type` with ID `entity-id`, in the normalized form.
  `parameter-mapping` is an optional argument."
  {:added "0.40.0"}
  [entity-type :- entity-type-schema
   entity-id :- pos-int?
   parameter-mapping :- [:maybe parameter-mapping-schema]]
  (cond-> {::click-behavior-type ::link
           ::link-type           entity-type
           ::link-target-id      entity-id}
    (some? parameter-mapping) (assoc ::parameter-mapping parameter-mapping)))

(mu/defn with-click-action :- click-behavior-schema
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`, and adds it to the given `settings`. This happens in the normalized form, and hence this should be
  passed the output of another fn (including, currently, `visualization-settings`). If the given `from-field-id`
  already has a click action, it will be replaced."
  {:added "0.40.0"}
  [settings :- map?, col-key :- column-ref-schema, action :- click-behavior-schema]
  (-> settings
      with-col-settings
      (update ::column-settings assoc col-key {::click-behavior action})))

(mu/defn with-entity-click-action :- click-behavior-schema
  "Creates a click action from a given `from-field-id` Field identifier to the given `to-entity-type` having ID
  `to-entity-id`. This happens in the normalized form, and hence this should be passed the output of another fn
  (including, currently, `visualization-settings`). If the given `from-field-id` already has a click action, it will
  be replaced."
  {:added "0.40.0"}
  [settings :- map?
   from-field-id :- ::lib.schema.id/field
   to-entity-type :- entity-type-schema
   to-entity-id :- pos-int?
   parameter-mapping :- [:maybe parameter-mapping-schema]]
  (with-click-action settings (field-id->column-ref from-field-id) (entity-click-action
                                                                    to-entity-type
                                                                    to-entity-id
                                                                    parameter-mapping)))

(mu/defn fk-parameter-mapping :- map?
  "Creates a parameter mapping for `source-col-name` (`source-field-id`) to `target-field-id` in normalized form."
  {:added "0.40.0"}
  [source-col-name :- :string
   source-field-id :- ::lib.schema.id/field
   target-field-id :- ::lib.schema.id/field]
  (let [id         [:dimension [:fk-> [:field source-field-id nil] [:field target-field-id nil]]]
        dimension  {:dimension [:field target-field-id {:source-field source-field-id}]}]
    {id #::{:param-mapping-id     id
            :param-mapping-source #::{:param-ref-type "column"
                                      :param-ref-id   source-col-name
                                      :param-ref-name source-col-name}
            :param-mapping-target #::{:param-ref-type "dimension"
                                      :param-ref-id    id
                                      :param-dimension dimension}}}))

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
  {:column_title                  ::column-title
   :date_style                    ::date-style
   :date_separator                ::date-separator
   :date_abbreviate               ::date-abbreviate
   :time_enabled                  ::time-enabled
   :time_style                    ::time-style
   :number_style                  ::number-style
   :currency                      ::currency
   :currency_style                ::currency-style
   :currency_in_header            ::currency-in-header
   :number_separators             ::number-separators
   :decimals                      ::decimals
   :scale                         ::scale
   :prefix                        ::prefix
   :suffix                        ::suffix
   :view_as                       ::view-as
   :link_text                     ::link-text
   :link_url                      ::link-url
   :show_mini_bar                 ::show-mini-bar
   :text_wrapping                 ::text-wrapping
   :text_align                    ::text-align
   ;; TODO: keeping these the same for FE/BE consistency
   :pivot_table.column_sort_order  :pivot_table.column_sort_order
   :pivot_table.column_show_totals :pivot_table.column_show_totals})

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

(def ^:private db->norm-table-columns-keys
  {:name      ::table-column-name
   ; for now, do not translate the value of this key (the field vector)
   :fieldref  ::table-column-field-ref
   :field_ref ::table-column-field-ref
   :fieldRef  ::table-column-field-ref
   :enabled   ::table-column-enabled})

(def ^:private norm->db-table-columns-keys
  (set/map-invert db->norm-table-columns-keys))

(defn- db->norm-param-ref [parsed-id param-ref]
  (cond-> (set/rename-keys param-ref db->norm-param-ref-keys)
    (= "dimension" (:type param-ref)) (assoc ::param-ref-id parsed-id)))

(defn- norm->db-param-ref [id-str param-ref]
  (cond-> (set/rename-keys param-ref norm->db-param-ref-keys)
    (= "dimension" (::param-ref-type param-ref)) (assoc :id id-str)))

(defn dimension-param-mapping?
  "Is this a parameter mapping for a dimension? Like when link refers a card getting data from another card."
  [mapping]
  (= "dimension" (get-in mapping [:target :type])))

(defn- normalize [form]
  (walk/postwalk
   (fn [form]
     (if (and (sequential? form)
              (string? (first form)))
       (into [(keyword (first form))] (map normalize) (rest form))
       form))
   form))

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
                       (if (dimension-param-mapping? v)
                         (let [parsed-id (-> (if (keyword? k) (keyname k) k)
                                             parse-json-string
                                             normalize)]
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

(defn- db->norm-time-style
  "Converts the deprecated k:mm format to HH:mm (#18112)"
  [v]
  (if (= v "k:mm")
    "HH:mm"
    v))

(defn- db->norm-table-columns [v]
  (-> v
      (assoc ::table-columns (mapv (fn [tbl-col]
                                     (set/rename-keys tbl-col db->norm-table-columns-keys))
                                   (:table.columns v)))
      (dissoc :table.columns)))

(defn- db->norm-column-settings-entry
  "Converts the DB form of a :column_settings entry value to its normalized form. Does the opposite of
  `norm->db-column-settings-entry`."
  [m k v]
  (case k
    :click_behavior
    (assoc m ::click-behavior (db->norm-click-behavior v))

    :time_style
    (assoc m ::time-style (db->norm-time-style v))

    (assoc m (db->norm-column-settings-keys k) v)))

(defn db->norm-column-settings-entries
  "Converts the DB form of a map of :column_settings entries to its normalized form."
  [entries]
  (reduce-kv db->norm-column-settings-entry {} entries))

(defn db->norm-column-settings
  "Converts a :column_settings DB form to its normalized form. Drops any columns that fail to be parsed."
  [settings]
  (reduce-kv (fn [m k v]
               (try
                 (let [k' (parse-db-column-ref k)
                       v' (db->norm-column-settings-entries v)]
                   (assoc m k' v'))
                 (catch #?(:clj Throwable :cljs js/Error) _e
                   m)))
             {}
             settings))

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
                                  db->norm-column-settings))

          ;; click behavior key at top level; ex: non-table card
    (:click_behavior vs)
    (assoc ::click-behavior (db->norm-click-behavior (:click_behavior vs)))

    (:table.columns vs)
    db->norm-table-columns

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
  [{::keys [field-id field-str column-name field-metadata]}]
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

(defn- norm->db-table-columns [v]
  (cond-> v
    (some? (::table-columns v))
    (assoc :table.columns (mapv (fn [tbl-col]
                                  (set/rename-keys tbl-col norm->db-table-columns-keys))
                                (::table-columns v)))
    :always
    (dissoc ::table-columns)))

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
                                  (dissoc ::click-behavior))
    (::table-columns settings)   norm->db-table-columns))
