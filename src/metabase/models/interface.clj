(ns metabase.models.interface
  "Stuff useful to ALL models.

    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    !!!                                                                                             !!!
    !!! PLEASE DON'T ADD NEW TRANSFORMS HERE, GO PUT THEM IN RELEVANT MODULES THAT USE THEM INSTEAD !!!
    !!!                                                                                             !!!
    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.json-migration :as jm]
   [metabase.models.resolution]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.protocols :as t2.protocols]
   [toucan2.tools.before-insert :as t2.before-insert]
   [toucan2.tools.hydrate :as t2.hydrate]
   [toucan2.tools.identity-query :as t2.identity-query]
   [toucan2.util :as t2.u])
  (:import
   (java.sql Blob)
   (toucan2.instance Instance)))

(set! *warn-on-reflection* true)

;;; even tho this gets loaded by `.init`, it's important for REPL usage it gets loaded ASAP so other model namespaces
;;; work correctly so I'm including it here as well to make the REPL work nicer -- Cam
(comment metabase.models.resolution/keep-me)

(p/import-vars
 [models.dispatch
  toucan-instance?
  instance-of?
  model
  instance])

(def ^:dynamic *deserializing?*
  "This is dynamically bound to true when deserializing. A few pieces of the Toucan magic are undesirable for
  deserialization. Most notably, we don't want to generate an `:entity_id`, as that would lead to duplicated entities
  on a future deserialization."
  false)

(def ^{:arglists '([x & _args])} dispatch-on-model
  "Helper dispatch function for multimethods. Dispatches on the first arg, using [[models.dispatch/model]]."
  ;; make sure model namespace gets loaded e.g. `:model/Database` should load `metabase.model.database` if needed.
  (comp t2/resolve-model t2.u/dispatch-on-first-arg))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Toucan Extensions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;;;; [[define-simple-hydration-method]] and [[define-batched-hydration-method]]

(s/def ::define-hydration-method
  (s/cat :fn-name       symbol?
         :hydration-key keyword?
         :docstring     string?
         :fn-tail       (s/alt :arity-1 :clojure.core.specs.alpha/params+body
                               :arity-n (s/+ (s/spec :clojure.core.specs.alpha/params+body)))))

(defonce ^:private defined-hydration-methods
  (atom {}))

(defn- define-hydration-method [hydration-type fn-name hydration-key fn-tail]
  {:pre [(#{:hydrate :batched-hydrate} hydration-type)]}
  ;; Let's be EXTRA nice and make sure there are no duplicate hydration keys!
  (let [fn-symb (symbol (str (ns-name *ns*)) (name fn-name))]
    (when-let [existing-fn-symb (get @defined-hydration-methods hydration-key)]
      (when (not= fn-symb existing-fn-symb)
        (throw (ex-info (str (format "Hydration key %s already exists at %s" hydration-key existing-fn-symb)
                             "\n\n"
                             "You can remove it with"
                             "\n"
                             (pr-str (list 'swap! `(deref ~#'defined-hydration-methods) 'dissoc hydration-key)))
                        {:hydration-key       hydration-key
                         :existing-definition existing-fn-symb}))))
    (swap! defined-hydration-methods assoc hydration-key fn-symb))
  `(do
     (defn ~fn-name
       ~@fn-tail)
     ~(case hydration-type
        :hydrate
        `(methodical/defmethod t2.hydrate/simple-hydrate
           [:default ~hydration-key]
           [~'_model k# row#]
           (assoc row# k# (~fn-name row#)))

        :batched-hydrate
        `(methodical/defmethod t2.hydrate/batched-hydrate
           [:default ~hydration-key]
           [~'_model ~'_k rows#]
           (~fn-name rows#)))))

(defmacro define-simple-hydration-method
  "Define a Toucan hydration function (Toucan 1) or method (Toucan 2) to do 'simple' hydration (this function is called
  for each individual object that gets hydrated). This helper is in place to make the switch to Toucan 2 easier to
  accomplish. Toucan 2 uses multimethods instead of regular functions with `:hydrate` metadata. When we switch to
  Toucan 2, we won't need to rewrite all of our hydration methods at once -- we can just change the implementation of
  this function, and eventually remove it entirely."
  {:style/indent :defn}
  [fn-name hydration-key & fn-tail]
  (define-hydration-method :hydrate fn-name hydration-key fn-tail))

(s/fdef define-simple-hydration-method
  :args ::define-hydration-method
  :ret  any?)

(defmacro define-batched-hydration-method
  "Like [[define-simple-hydration-method]], but defines a Toucan 'batched' hydration function (Toucan 1) or
  method (Toucan 2). 'Batched' hydration means this function can be used to hydrate a sequence of objects in one call.

  See docstring for [[define-simple-hydration-method]] for more information as to why this macro exists."
  {:style/indent :defn}
  [fn-name hydration-key & fn-tail]
  (define-hydration-method :batched-hydrate fn-name hydration-key fn-tail))

(s/fdef define-batched-hydration-method
  :args ::define-hydration-method
  :ret  any?)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Toucan 2 Extensions                                              |
;;; +----------------------------------------------------------------------------------------------------------------+
;; --- transforms methods

(defn json-in
  "Default in function for columns given a Toucan type `:json`. Serializes object as JSON."
  [obj]
  (if (string? obj)
    obj
    (json/encode obj)))

(defn- json-out [s keywordize-keys?]
  (if (string? s)
    (try
      (json/decode s keywordize-keys?)
      (catch Throwable e
        (log/error e "Error parsing JSON")
        s))
    s))

(defn json-out-with-keywordization
  "Default out function for columns given a Toucan type `:json`. Parses serialized JSON string and keywordizes keys."
  [obj]
  (json-out obj true))

(defn json-out-without-keywordization
  "Out function for columns given a Toucan type `:json-no-keywordization`. Similar to `:json-out` but does leaves keys
  as strings."
  [obj]
  (json-out obj false))

(defn- elide-data [obj]
  (walk/postwalk (fn [x] (cond
                           (string? x) (string/elide x 250)
                           (and (sequential? x) (> (count x) 50)) (take 50 x)
                           :else x)) obj))

(defn- json-in-with-eliding
  [obj]
  (if (string? obj)
    obj
    (json/encode (elide-data obj))))

(def transform-json
  "Transform for json."
  {:in  json-in
   :out json-out-with-keywordization})

(def transform-json-eliding
  "Serializes object as JSON, but:
    - elides any long strings to a max of 250 chars
    - limits sequences to the first 50 entries
   Useful for debugging/human-consuming information which can be unbounded-ly large"
  {:in  json-in-with-eliding
   :out json-out-with-keywordization})

(defn catch-normalization-exceptions
  "Wraps normalization fn `f` and returns a version that gracefully handles Exceptions during normalization. When
  invalid queries (etc.) come out of the Database, it's best we handle normalization failures gracefully rather than
  letting the Exception cause the entire API call to fail because of one bad object. (See #8914 for more details.)"
  [f]
  (fn [x]
    (try
      (doall (f x))
      (catch Throwable e
        (log/errorf e "Unable to normalize:\n%s" (u/pprint-to-str 'red x))
        nil))))

(def ^{:deprecated "0.57.0"} transform-legacy-field-ref
  "Transform field refs"
  {:in  json-in
   :out (comp (catch-normalization-exceptions #_{:clj-kondo/ignore [:deprecated-var]} mbql.normalize/normalize-field-ref)
              json-out-with-keywordization)})

(defn- normalize-result-metadata-column [col]
  (if (:lib/type col)
    (lib.normalize/normalize ::lib.schema.metadata/column col)
    ;; legacy usages -- do not use these going forward
    #_{:clj-kondo/ignore [:deprecated-var]}
    (-> col
        (->> (lib/normalize :metabase.query-processor.schema/result-metadata.column))
        ;; This is necessary, because in the wild, there may be cards created prior to this change.
        lib.temporal-bucket/ensure-temporal-unit-in-display-name
        lib.binning/ensure-binning-in-display-name)))

(defn- result-metadata-out
  "Transform the Card result metadata as it comes out of the DB. Convert columns to keywords where appropriate."
  [metadata]
  ;; TODO -- can we make this whole thing a lazy seq?
  (when-let [metadata (not-empty (json-out-with-keywordization metadata))]
    (not-empty (mapv normalize-result-metadata-column metadata))))

(def transform-result-metadata
  "Transform for card.result_metadata like columns."
  {:in  json-in
   :out result-metadata-out})

(def transform-keyword
  "Transform for keywords."
  {:in  u/qualified-name
   :out keyword})

(def transform-json-no-keywordization
  "Transform for json-no-keywordization"
  {:in  json-in
   :out json-out-without-keywordization})

(mu/defn assert-enum
  "Assert that a value is one of the values in `enum`."
  [enum :- [:set :any]
   value]
  (when-not (contains? enum value)
    (throw (ex-info (format "Invalid value %s. Must be one of %s" value (str/join ", " enum)) {:status-code 400
                                                                                               :value       value}))))

(mu/defn assert-optional-enum
  "Assert that a value is one of the values in `enum` or `nil`."
  [enum :- [:set :any]
   value :- :any]
  (when (some? value)
    (assert-enum enum value)))

(mu/defn assert-namespaced
  "Assert that a value is a namespaced keyword under `qualified-ns`."
  [qualified-ns :- string?
   value]
  (when-not (= qualified-ns (-> value keyword namespace))
    (throw (ex-info (format "Must be a namespaced keyword under :%s, got: %s" qualified-ns value) {:status-code 400
                                                                                                   :value       value}))))

(defn transform-validator
  "Given a transform, returns a transform that call `assert-fn` on the \"out\" value.

  E.g: A keyword transformer that throw an error if the value is not namespaced
    (transform-validator
      transform-keyword (fn [x]
      (when-not (-> x namespace some?)
        (throw (ex-info \"Value is not namespaced\")))))"
  [tf assert-fn]
  (-> tf
      ;; deserialization
      (update :out (fn [f]
                     (fn [x]
                       (let [out (f x)]
                         (assert-fn out)
                         out))))
      ;; serialization
      (update :in (fn [f]
                    (fn [x]
                      (assert-fn x)
                      (f x))))))

(def encrypted-json-in
  "Serialize encrypted json."
  (comp encryption/maybe-encrypt json-in))

(defn encrypted-json-out
  "Deserialize encrypted json."
  [v]
  (let [decrypted (encryption/maybe-decrypt v)]
    (try
      (json/decode+kw decrypted)
      (catch Throwable e
        (if (or (encryption/possibly-encrypted-string? decrypted)
                (encryption/possibly-encrypted-bytes? decrypted))
          (log/error e "Could not decrypt encrypted field! Have you forgot to set MB_ENCRYPTION_SECRET_KEY?")
          (log/error e "Error parsing JSON"))  ; same message as in `json-out`
        v))))

;; cache the decryption/JSON parsing because it's somewhat slow (~500µs vs ~100µs on a *fast* computer)
;; cache the decrypted JSON for one hour
(def ^:private cached-encrypted-json-out (memoize/ttl encrypted-json-out :ttl/threshold (* 60 60 1000)))

(def transform-encrypted-json
  "Transform for encrypted json."
  {:in  encrypted-json-in
   :out cached-encrypted-json-out})

;;; TODO (Cam 10/27/25) -- this stuff should be moved into a different module instead of the general models interface,
;;; either `queries` or a new module along with [[metabase.models.visualization-settings]].
(mr/def ::viz-settings-ref
  "Apparently in some cases legacy viz settings keys can be wrapped in `[:ref ...]` e.g.

    [:ref [:field 1 nil]]"
  [:tuple
   {:decode/normalize vec}
   [:= {:decode/normalize keyword} :ref]
   [:ref ::mbql.s/Reference]])

(mr/def ::viz-settings-name
  "Apparently in some cases legacy viz settings keys can be wrapped in `[:ref ...]` e.g.

    [:ref [:field 1 nil]]"
  [:tuple
   {:decode/normalize vec}
   [:= {:decode/normalize keyword} :name]
   :string])

(defn normalize-visualization-settings
  "The frontend uses JSON-serialized versions of MBQL clauses as keys in `:column_settings`. This normalizes them
   to MBQL 4 clauses so things work correctly."
  [viz-settings]
  (letfn [(normalize-column-settings-key [k]
            (some-> k
                    u/qualified-name
                    json/decode
                    ((fn [x]
                       (cond
                         (not (sequential? x)) x
                         (= (first x) "ref")   (lib/normalize ::viz-settings-ref x)
                         (= (first x) "name")  (lib/normalize ::viz-settings-name x)
                         :else                 (mbql.normalize/normalize x))))
                    json/encode))
          (normalize-column-settings [column-settings]
            (into {} (for [[k v] column-settings]
                       [(normalize-column-settings-key k) (walk/keywordize-keys v)])))
          (mbql-field-clause? [form]
            (and (vector? form)
                 (#{"field-id"
                    "fk->"
                    "datetime-field"
                    "joined-field"
                    "binning-strategy"
                    "field"
                    "aggregation"
                    "expression"}
                  (first form))))
          (normalize-mbql-clauses [form]
            (cond
              (mbql-field-clause? form)
              (try
                (mbql.normalize/normalize form)
                (catch Exception e
                  (log/warnf "Unable to normalize visualization-settings part %s: %s"
                             (u/pprint-to-str 'red form)
                             (ex-message e))
                  form))

              (sequential? form)
              (into (empty form) (map normalize-mbql-clauses) form)

              (map? form)
              (into (empty form)
                    (map (fn [[k v]]
                           ;; don't recurse into `:columns` if they are COLUMN NAMES! -- if the first column name is
                           ;; something like "expression" then we don't want to accidentally treat it as an
                           ;; `:expression` ref. Some `:columns` lists is viz settings do contain MBQL clauses
                           ;; tho :unamused:
                           (let [column-names? (and (= k :columns)
                                                    (sequential? v)
                                                    (every? (complement mbql-field-clause?) v))]
                             [k (cond-> v
                                  (not column-names?) normalize-mbql-clauses)])))
                    form)

              :else
              form))]
    (->
     viz-settings
     (dissoc "column_settings" "graph.metrics")
     walk/keywordize-keys
     ;; "key" is an old unused value
     (m/update-existing :table.columns (fn [cols] (mapv #(dissoc % :key) cols)))
     (cond-> (get viz-settings "column_settings")
       (assoc :column_settings (normalize-column-settings (get viz-settings "column_settings"))))
     normalize-mbql-clauses
     ;; exclude graph.metrics from normalization as it may start with the word "expression" but it is not
     ;; MBQL (metabase#15882)
     (cond-> (get viz-settings "graph.metrics")
       (assoc :graph.metrics (get viz-settings "graph.metrics"))))))

(jm/def-json-migration migrate-viz-settings*)

(def ^:private viz-settings-current-version 2)

(defmethod ^:private migrate-viz-settings* [1 2] [viz-settings _]
  (let [{percent? :pie.show_legend_perecent ;; [sic]
         legend?  :pie.show_legend} viz-settings
        new-visibility              (cond
                                      legend?  "inside"
                                      percent? "legend")
        new-linktype                (when (= "page" (-> viz-settings :click_behavior :linkType))
                                      "dashboard")]
    (cond-> viz-settings
      ;; if nothing was explicitly set don't default to "off", let the FE deal with it
      new-visibility (assoc :pie.percent_visibility new-visibility)
      new-linktype   (assoc-in [:click_behavior :linkType] new-linktype))))

(defn- migrate-viz-settings
  [viz-settings]
  (let [new-viz-settings (migrate-viz-settings* viz-settings viz-settings-current-version)]
    (cond-> new-viz-settings
      (not= new-viz-settings viz-settings) (jm/update-version viz-settings-current-version))))

;; migrate-viz settings was introduced with v. 2, so we'll never be in a situation where we can downgrade from 2 to 1.
;; See sample code in SHA d597b445333f681ddd7e52b2e30a431668d35da8

(def transform-visualization-settings
  "Transform for viz-settings."
  {:in  (comp json-in migrate-viz-settings)
   :out (comp migrate-viz-settings normalize-visualization-settings json-out-without-keywordization)})

(def ^{:arglists '([s])} ^:private validate-cron-string
  (let [validator (mr/validator u.cron/CronScheduleString)]
    (partial mu/validate-throw validator)))

(def transform-cron-string
  "Transform for encrypted json."
  {:in  validate-cron-string
   :out identity})

(defn- blob->bytes [^Blob b]
  (.getBytes ^Blob b 0 (.length ^Blob b)))

(defn- maybe-blob->bytes [v]
  (if (instance? Blob v)
    (blob->bytes v)
    v))

(def transform-secret-value
  "Transform for secret value."
  {:in  (comp encryption/maybe-encrypt-bytes codecs/to-bytes)
   :out (comp encryption/maybe-decrypt maybe-blob->bytes)})

#_(defn decompress
    "Decompress `compressed-bytes`."
    [compressed-bytes]
    (if (instance? Blob compressed-bytes)
      (recur (blob->bytes compressed-bytes))
      (with-open [bis     (ByteArrayInputStream. compressed-bytes)
                  bif     (BufferedInputStream. bis)
                  gz-in   (GZIPInputStream. bif)
                  data-in (DataInputStream. gz-in)]
        (nippy/thaw-from-in! data-in))))

#_(def transform-compressed
    "Transform for compressed fields."
    {:in identity
     :out decompress})

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!!                                                                                             !!!
;;; !!! PLEASE DON'T ADD NEW TRANSFORMS HERE, GO PUT THEM IN RELEVANT MODULES THAT USE THEM INSTEAD !!!
;;; !!!                                                                                             !!!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

;; --- predefined hooks

(defmulti non-timestamped-fields
  "Return a set of fields that should not affect the timestamp of a model."
  {:arglists '([instance])}
  dispatch-on-model)

(defmethod non-timestamped-fields :default
  [_]
  #{})

(defn now
  "Return a HoneySQL form for a SQL function call to get current moment in time. Currently this is `now()` for Postgres
  and H2 and `now(6)` for MySQL/MariaDB (`now()` for MySQL only return second resolution; `now(6)` uses the
  max (nanosecond) resolution)."
  []
  (h2x/current-datetime-honeysql-form ((requiring-resolve 'metabase.app-db.core/db-type))))

(defn- add-created-at-timestamp [obj & _]
  (cond-> obj
    (not (:created_at obj)) (assoc :created_at (now))))

(defn- add-updated-at-timestamp [obj]
  (let [changed-fields (set (keys (if (t2/instance obj)
                                    (t2/changes obj)
                                    obj)))
        ; don't stomp on `:updated_at` if it's already explicitly specified.
        changes-already-include-updated-at? (some #{:updated_at} changed-fields)
        has-non-ignored-fields? (seq (set/difference changed-fields (non-timestamped-fields obj)))
        should-set-updated-at? (and has-non-ignored-fields? (not changes-already-include-updated-at?))]
    (cond-> obj
      should-set-updated-at? (assoc :updated_at (now)))))

(t2/define-before-insert :hook/timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp
      add-created-at-timestamp))

(t2/define-before-update :hook/timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp))

(t2/define-before-insert :hook/created-at-timestamped?
  [instance]
  (-> instance
      add-created-at-timestamp))

(t2/define-before-insert :hook/updated-at-timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp))

(t2/define-before-update :hook/updated-at-timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp))

(defn- add-entity-id [obj & _]
  (if (or (contains? obj :entity_id)
          *deserializing?*)
    ;; Don't generate a new entity_id if either: (a) there's already one set; or (b) we're deserializing.
    ;; Generating them at deserialization time can lead to duplicated entities if they're deserialized again.
    obj
    (assoc obj :entity_id (u/generate-nano-id))))

(t2/define-before-insert :hook/entity-id
  [instance]
  (-> instance
      add-entity-id))

(methodical/prefer-method! #'t2.before-insert/before-insert :hook/timestamped? :hook/entity-id)
(methodical/prefer-method! #'t2.before-insert/before-insert :hook/updated-at-timestamped? :hook/entity-id)
(methodical/prefer-method! #'t2.before-insert/before-insert :hook/created-at-timestamped? :hook/entity-id)
;; --- helper fns
(defn changes-with-pk
  "The row merged with the changes in pre-update hooks.
  This is to match the input of pre-update for toucan1 methods"
  [row]
  (t2.protocols/with-current row (merge (t2.model/primary-key-values-map row)
                                        (t2.protocols/changes row))))

(defn do-after-select
  "Do [[toucan2.tools.after-select]] stuff for row map `object` using methods for `modelable`."
  [modelable row-map]
  {:pre [(map? row-map)]}
  (let [model (t2/resolve-model modelable)]
    (try
      (t2/select-one model (t2.identity-query/identity-query [row-map]))
      (catch Throwable e
        (throw (ex-info (format "Error doing after-select for model %s: %s" model (ex-message e))
                        {:model model}
                        e))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             New Permissions Stuff                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; TODO -- consider moving all this stuff into the `permissions` module

(defmulti perms-objects-set
  "Return a set of permissions object paths that a user must have access to in order to access this object. This should
  be something like

    #{\"/db/1/schema/public/table/20/\"}

  `read-or-write` will be either `:read` or `:write`, depending on which permissions set we're fetching (these will be
  the same sets for most models; they can ignore this param)."
  {:arglists '([instance read-or-write])}
  dispatch-on-model)

(defmethod perms-objects-set :default
  [_instance _read-or-write]
  nil)

(defmulti can-read?
  "Return whether [[metabase.api.common/*current-user*]] has *read* permissions for an object. You should typically use
  one of these implementations:

  *  `(constantly true)`
  *  `superuser?`
  *  `(partial current-user-has-full-permissions? :read)` (you must also implement [[perms-objects-set]] to use this)
  *  `(partial current-user-has-partial-permissions? :read)` (you must also implement [[perms-objects-set]] to use
     this)"
  {:arglists '([instance] [model pk])}
  dispatch-on-model)

(defmulti can-write?
  "Return whether [[metabase.api.common/*current-user*]] has *write* permissions for an object. You should typically use
  one of these implementations:

  *  `(constantly true)`
  *  `superuser?`
  *  `(partial current-user-has-full-permissions? :write)` (you must also implement [[perms-objects-set]] to use this)
  *  `(partial current-user-has-partial-permissions? :write)` (you must also implement [[perms-objects-set]] to use
      this)"
  {:arglists '([instance] [model pk])}
  dispatch-on-model)

#_{:clj-kondo/ignore [:unused-private-var]}
(define-simple-hydration-method ^:private hydrate-can-write
  :can_write
  "Hydration method for `:can_write`."
  [instance]
  (can-write? instance))

(defmulti can-create?
  "NEW! Check whether or not current user is allowed to CREATE a new instance of `model` with properties in map
    `m`.

  Because this method was added YEARS after [[can-read?]] and [[can-write?]], most models do not have an implementation
  for this method, and instead `POST` API endpoints themselves contain the appropriate permissions logic (ick).
  Implement this method as you come across models that are missing it."
  {:added "0.32.0", :arglists '([model m])}
  dispatch-on-model)

(defmethod can-create? :default
  [model _m]
  (throw
   (NoSuchMethodException.
    (str (format "%s does not yet have an implementation for [[can-create?]]. " (name model))
         "Please consider adding one. See dox for [[can-create?]] for more details."))))

(defmulti can-update?
  "NEW! Check whether or not the current user is allowed to update an object and by updating properties to values in
   the `changes` map. This is equivalent to checking whether you're allowed to perform

    (toucan2.core/update! model id changes)

  This method is appropriate for powering `PUT` API endpoints. Like [[can-create?]] this method was added YEARS after
  most of the current API endpoints were written, so it is used in very few places, and this logic is determined ad-hoc
  in the API endpoints themselves. Use this method going forward!"
  {:added "0.36.0", :arglists '([instance changes])}
  dispatch-on-model)

(defmethod can-update? :default
  [instance _changes]
  (throw
   (NoSuchMethodException.
    (str (format "%s does not yet have an implementation for `can-update?`. " (name (models.dispatch/model instance)))
         "Please consider adding one. See dox for `can-update?` for more details."))))

(defmulti visible-filter-clause
  "Return a map with:
   - :clause - honey SQL WHERE clause fragment to filter records visible to the user
   - :with - optional vector of CTE definitions [[name query] ...] to be merged into the query

  Uses the map of permission type->minimum permission-level for filtering.
  Defaults to returning a no-op false statement {:clause [:= 0 1]}."
  {:arglists '([model column-or-exp user-info perm-type->perm-level])}
  dispatch-on-model)

(defn superuser?
  "Is [[metabase.api.common/*current-user*]] is a superuser? Ignores args. Intended for use as an implementation
  of [[can-read?]] and/or [[can-write?]]."
  [& _]
  @(requiring-resolve 'metabase.api.common/*is-superuser?*))

(defn current-user-id
  "Return the ID of the current user."
  []
  @(requiring-resolve 'metabase.api.common/*current-user-id*))

(defn- current-user-permissions-set []
  @@(requiring-resolve 'metabase.api.common/*current-user-permissions-set*))

(defn- current-user-has-root-permissions? []
  (contains? (current-user-permissions-set) "/"))

(mu/defn- check-perms-with-fn
  ([fn-symb       :- qualified-symbol?
    read-or-write :- [:enum :read :write]
    a-model       :- qualified-keyword?
    object-id     :- [:or pos-int? string?]]
   (or (current-user-has-root-permissions?)
       (check-perms-with-fn fn-symb read-or-write (t2/select-one a-model (first (t2/primary-keys a-model)) object-id))))

  ([fn-symb       :- qualified-symbol?
    read-or-write :- [:enum :read :write]
    object        :- :map]
   (and object
        (check-perms-with-fn fn-symb (perms-objects-set object read-or-write))))

  ([fn-symb   :- qualified-symbol?
    perms-set :- [:set :string]]
   (let [f (requiring-resolve fn-symb)]
     (assert f)
     (u/prog1 (f (current-user-permissions-set) perms-set)
       (log/tracef "Perms check: %s -> %s" (pr-str (list fn-symb (current-user-permissions-set) perms-set)) <>)))))

(def ^{:arglists '([read-or-write model object-id] [read-or-write object] [perms-set])}
  current-user-has-full-permissions?
  "Implementation of [[can-read?]]/[[can-write?]] for the old permissions system. `true` if the current user has *full*
  permissions for the paths returned by its implementation of [[perms-objects-set]]. (`read-or-write` is either `:read` or
  `:write` and passed to [[perms-objects-set]]; you'll usually want to partially bind it in the implementation map)."
  (partial check-perms-with-fn 'metabase.permissions.models.permissions/set-has-full-permissions-for-set?))

(defmethod can-read? ::read-policy.always-allow
  ([_instance]
   true)
  ([_model _pk]
   true))

(defmethod can-write? ::write-policy.always-allow
  ([_instance]
   true)
  ([_model _pk]
   true))

(defmethod can-read? ::read-policy.full-perms-for-perms-set
  ([instance]
   (current-user-has-full-permissions? :read instance))
  ([model pk]
   (current-user-has-full-permissions? :read model pk)))

(defmethod can-write? ::write-policy.full-perms-for-perms-set
  ([instance]
   (current-user-has-full-permissions? :write instance))
  ([model pk]
   (current-user-has-full-permissions? :write model pk)))

(defmethod can-read? ::read-policy.superuser
  ([_instance]
   (superuser?))
  ([_model _pk]
   (superuser?)))

(defmethod can-write? ::write-policy.superuser
  ([_instance]
   (superuser?))
  ([_model _pk]
   (superuser?)))

(defmethod can-create? ::create-policy.superuser
  [_model _m]
  (superuser?))

(defmethod visible-filter-clause :default
  [_m _column-or-expression _user-info _perm-type->perm-level]
  {:clause [:= [:inline 0] [:inline 1]]})

;;;; [[to-json]]

(methodical/defmulti to-json
  "Serialize an `instance` to JSON."
  {:arglists            '([instance json-generator])
   :defmethod-arities   #{2}
   :dispatch-value-spec (some-fn keyword? symbol?)} ; dispatch value should be either keyword model name or symbol
  t2.u/dispatch-on-first-arg)

(methodical/defmethod to-json :default
  "Default method for encoding instances of a Toucan model to JSON."
  [instance json-generator]
  (json/generate-map instance json-generator))

(json/add-encoder
 Instance
 #'to-json)

;;;; etc

;;; Trigger errors when hydrate encounters a key that has no corresponding method defined.
(reset! t2.hydrate/global-error-on-unknown-key true)

(methodical/defmethod t2.hydrate/fk-keys-for-automagic-hydration :default
  "In Metabase the FK key used for automagic hydration should use underscores (work around upstream Toucan 2 issue)."
  [_original-model dest-key _hydrated-key]
  [(u/->snake_case_en (keyword (str (name dest-key) "_id")))])

(mu/defn instances-with-hydrated-data
  ;; TODO: this example is wrong, we don't get a vector of tables
  "Helper function to write batched hydrations.
  Assoc to each `instances` a key `hydration-key` with data from calling `instance-key->hydrated-data-fn` by `instance-key`.

    (instances-with-hydrated-data
      (t2/select :model/Database)
      :tables
      #(t2/select-fn->fn :db_id identity :model/Table)
      :id)
    ;; => [{:id 1 :tables [...tables-from-db-1]}
           {:id 2 :tables [...tables-from-db-2]}]

  - key->hydrated-items-fn: is a function that returns a map with key is `instance-key` and value is the hydrated data of that instance."
  [instances                      :- [:sequential :any]
   hydration-key                  :- :keyword
   instance-key->hydrated-data-fn :- fn?
   instance-key                   :- :keyword
   & [{:keys [default] :as _options}]]
  (when (seq instances)
    (let [key->hydrated-items (instance-key->hydrated-data-fn)]
      (for [item instances]
        (when item
          (assoc item hydration-key (get key->hydrated-items (get item instance-key) default)))))))

(defmulti exclude-internal-content-hsql
  "Returns a HoneySQL expression to exclude instances of the model that were created automatically as part of internally
   used content, such as Metabase Analytics, the sample database, or the sample dashboard. If a `table-alias` (string
   or keyword) is provided any columns will have a table alias in the returned expression."
  {:arglists '([model & {:keys [table-alias]}])}
  dispatch-on-model)

(defmethod exclude-internal-content-hsql :default
  [_model & _]
  [:= [:inline 1] [:inline 1]])
