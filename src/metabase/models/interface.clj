(ns metabase.models.interface
  (:require
   [buddy.core.codecs :as codecs]
   [cheshire.core :as json]
   [cheshire.generate :as json.generate]
   [clojure.core.memoize :as memoize]
   [clojure.spec.alpha :as s]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.json-migration :as jm]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [potemkin :as p]
   [taoensso.nippy :as nippy]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.protocols :as t2.protocols]
   [toucan2.tools.before-insert :as t2.before-insert]
   [toucan2.tools.hydrate :as t2.hydrate]
   [toucan2.tools.identity-query :as t2.identity-query]
   [toucan2.util :as t2.u])
  (:import
   (java.io BufferedInputStream ByteArrayInputStream DataInputStream)
   (java.sql Blob)
   (java.util.zip GZIPInputStream)
   (toucan2.instance Instance)))

(set! *warn-on-reflection* true)

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
        (throw (ex-info (format "Hydration key %s already exists at %s" hydration-key existing-fn-symb)
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
    (json/generate-string obj)))

(defn- json-out [s keywordize-keys?]
  (if (string? s)
    (try
      (json/parse-string s keywordize-keys?)
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

(def transform-json
  "Transform for json."
  {:in  json-in
   :out json-out-with-keywordization})

(defn- serialize-mlv2-query
  "Saving MLv2 queries​ we can assume MLv2 queries are normalized enough already, but remove the metadata provider before
  saving it, because it's not something that lends itself well to serialization."
  [query]
  (dissoc query :lib/metadata))

(defn- deserialize-mlv2-query
  "Reading MLv2 queries​: normalize them, then attach a MetadataProvider based on their Database."
  [query]
  (let [metadata-provider (if (lib.metadata.protocols/metadata-provider? (:lib/metadata query))
                            ;; in case someone passes in an already-normalized query to [[maybe-normalize-query]] below,
                            ;; preserve the existing metadata provider.
                            (:lib/metadata query)
                            ((requiring-resolve 'metabase.lib.metadata.jvm/application-database-metadata-provider)
                             (u/the-id (some #(get query %) [:database "database"]))))]
    (lib/query metadata-provider query)))

(mu/defn maybe-normalize-query
  "For top-level query maps like `Card.dataset_query`. Normalizes them on the way in & out."
  [in-or-out :- [:enum :in :out]
   query]
  (letfn [(normalize [query]
            (let [f (if (= (lib/normalized-query-type query) :mbql/query)
                      ;; MLv2 queries
                      (case in-or-out
                        :in  serialize-mlv2-query
                        :out deserialize-mlv2-query)
                      ;; legacy queries: just normalize them with the legacy normalization code for now... in the near
                      ;; future we'll probably convert to MLv2 before saving so everything in the app DB is MLv2
                      (case in-or-out
                        :in  mbql.normalize/normalize
                        :out mbql.normalize/normalize))]
              (f query)))]
    (cond-> query
      (and (map? query) (seq query))
      normalize)))

(defn catch-normalization-exceptions
  "Wraps normalization fn `f` and returns a version that gracefully handles Exceptions during normalization. When
  invalid queries (etc.) come out of the Database, it's best we handle normalization failures gracefully rather than
  letting the Exception cause the entire API call to fail because of one bad object. (See #8914 for more details.)"
  [f]
  (fn [query]
    (try
      (doall (f query))
      (catch Throwable e
        (log/errorf e "Unable to normalize:\n%s" (u/pprint-to-str 'red query))
        nil))))

(defn normalize-parameters-list
  "Normalize `parameters` or `parameter-mappings` when coming out of the application database or in via an API request."
  [parameters]
  (or (mbql.normalize/normalize-fragment [:parameters] parameters)
      []))

(def transform-metabase-query
  "Transform for metabase-query."
  {:in  (comp json-in (partial maybe-normalize-query :in))
   :out (comp (catch-normalization-exceptions (partial maybe-normalize-query :out)) json-out-without-keywordization)})

(def transform-parameters-list
  "Transform for parameters list."
  {:in  (comp json-in normalize-parameters-list)
   :out (comp (catch-normalization-exceptions normalize-parameters-list) json-out-with-keywordization)})

(def transform-field-ref
  "Transform field refs"
  {:in  json-in
   :out (comp (catch-normalization-exceptions mbql.normalize/normalize-field-ref) json-out-with-keywordization)})

(defn- result-metadata-out
  "Transform the Card result metadata as it comes out of the DB. Convert columns to keywords where appropriate."
  [metadata]
  ;; TODO -- can we make this whole thing a lazy seq?
  (when-let [metadata (not-empty (json-out-with-keywordization metadata))]
    (seq (map mbql.normalize/normalize-source-metadata metadata))))

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

(def encrypted-json-in
  "Serialize encrypted json."
  (comp encryption/maybe-encrypt json-in))

(defn encrypted-json-out
  "Deserialize encrypted json."
  [v]
  (let [decrypted (encryption/maybe-decrypt v)]
    (try
      (json/parse-string decrypted true)
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

(defn normalize-visualization-settings
  "The frontend uses JSON-serialized versions of MBQL clauses as keys in `:column_settings`. This normalizes them
   to modern MBQL clauses so things work correctly."
  [viz-settings]
  (letfn [(normalize-column-settings-key [k]
            (some-> k u/qualified-name json/parse-string mbql.normalize/normalize json/generate-string))
          (normalize-column-settings [column-settings]
            (into {} (for [[k v] column-settings]
                       [(normalize-column-settings-key k) (walk/keywordize-keys v)])))
          (mbql-field-clause? [form]
            (and (vector? form)
                 (#{"field-id" "fk->" "datetime-field" "joined-field" "binning-strategy" "field"
                    "aggregation" "expression"}
                  (first form))))
          (normalize-mbql-clauses [form]
            (walk/postwalk
             (fn [form]
               (try
                 (cond-> form
                   (mbql-field-clause? form) mbql.normalize/normalize)
                 (catch Exception e
                   (log/warnf "Unable to normalize visualization-settings part %s: %s"
                              (u/pprint-to-str 'red form)
                              (ex-message e))
                   form)))
             form))]
    (cond-> (walk/keywordize-keys (dissoc viz-settings "column_settings" "graph.metrics"))
      (get viz-settings "column_settings") (assoc :column_settings (normalize-column-settings (get viz-settings "column_settings")))
      true                                 normalize-mbql-clauses
      ;; exclude graph.metrics from normalization as it may start with
      ;; the word "expression" but it is not MBQL (metabase#15882)
      (get viz-settings "graph.metrics")   (assoc :graph.metrics (get viz-settings "graph.metrics")))))

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
  (let [validator (mc/validator u.cron/CronScheduleString)]
    (partial mu/validate-throw validator)))

(def transform-cron-string
  "Transform for encrypted json."
  {:in  validate-cron-string
   :out identity})

(def ^:private LegacyMetricSegmentDefinition
  [:map
   [:filter      {:optional true} [:maybe mbql.s/Filter]]
   [:aggregation {:optional true} [:maybe [:sequential ::mbql.s/Aggregation]]]])

(def ^:private ^{:arglists '([definition])} validate-legacy-metric-segment-definition
  (let [explainer (mr/explainer LegacyMetricSegmentDefinition)]
    (fn [definition]
      (if-let [error (explainer definition)]
        (let [humanized (me/humanize error)]
          (throw (ex-info (tru "Invalid Metric or Segment: {0}" (pr-str humanized))
                          {:error     error
                           :humanized humanized})))
        definition))))

;; `metric-segment-definition` is, predictably, for Metric/Segment `:definition`s, which are just the inner MBQL query
(defn- normalize-legacy-metric-segment-definition [definition]
  (when (seq definition)
    (u/prog1 (mbql.normalize/normalize-fragment [:query] definition)
      (validate-legacy-metric-segment-definition <>))))


(def transform-legacy-metric-segment-definition
  "Transform for inner queries like those in Metric definitions."
  {:in  (comp json-in normalize-legacy-metric-segment-definition)
   :out (comp (catch-normalization-exceptions normalize-legacy-metric-segment-definition) json-out-with-keywordization)})

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

(defn decompress
  "Decompress `compressed-bytes`."
  [compressed-bytes]
  (if (instance? Blob compressed-bytes)
    (recur (blob->bytes compressed-bytes))
    (with-open [bis     (ByteArrayInputStream. compressed-bytes)
                bif     (BufferedInputStream. bis)
                gz-in   (GZIPInputStream. bif)
                data-in (DataInputStream. gz-in)]
      (nippy/thaw-from-in! data-in))))

#_{:clj-kondo/ignore [:unused-public-var]}
(def transform-compressed
  "Transform for compressed fields."
  {:in identity
   :out decompress})

;; --- predefined hooks

(defn now
  "Return a HoneySQL form for a SQL function call to get current moment in time. Currently this is `now()` for Postgres
  and H2 and `now(6)` for MySQL/MariaDB (`now()` for MySQL only return second resolution; `now(6)` uses the
  max (nanosecond) resolution)."
  []
  (classloader/require 'metabase.driver.sql.query-processor)
  (let [db-type ((requiring-resolve 'metabase.db/db-type))]
   ((resolve 'metabase.driver.sql.query-processor/current-datetime-honeysql-form) db-type)))

(defn- add-created-at-timestamp [obj & _]
  (cond-> obj
    (not (:created_at obj)) (assoc :created_at (now))))

(defn- add-updated-at-timestamp [obj]
  ;; don't stomp on `:updated_at` if it's already explicitly specified.
  (let [changes-already-include-updated-at? (if (t2/instance? obj)
                                              (:updated_at (t2/changes obj))
                                              (:updated_at obj))]
    (cond-> obj
      (not changes-already-include-updated-at?) (assoc :updated_at (now)))))


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
(def ^{:arglists '([x & _args])} dispatch-on-model
  "Helper dispatch function for multimethods. Dispatches on the first arg, using [[models.dispatch/model]]."
  ;; make sure model namespace gets loaded e.g. `:model/Database` should load `metabase.model.database` if needed.
  (comp t2/resolve-model t2.u/dispatch-on-first-arg))

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

(defn superuser?
  "Is [[metabase.api.common/*current-user*]] is a superuser? Ignores args. Intended for use as an implementation
  of [[can-read?]] and/or [[can-write?]]."
  [& _]
  @(requiring-resolve 'metabase.api.common/*is-superuser?*))

(defn- current-user-permissions-set []
  @@(requiring-resolve 'metabase.api.common/*current-user-permissions-set*))

(defn- current-user-has-root-permissions? []
  (contains? (current-user-permissions-set) "/"))

(defn- check-perms-with-fn
  ([fn-symb read-or-write a-model object-id]
   (or (current-user-has-root-permissions?)
       (check-perms-with-fn fn-symb read-or-write (t2/select-one a-model (first (t2/primary-keys a-model)) object-id))))

  ([fn-symb read-or-write object]
   (and object
        (check-perms-with-fn fn-symb (perms-objects-set object read-or-write))))

  ([fn-symb perms-set]
   (let [f (requiring-resolve fn-symb)]
     (assert f)
     (u/prog1 (f (current-user-permissions-set) perms-set)
       (log/tracef "Perms check: %s -> %s" (pr-str (list fn-symb (current-user-permissions-set) perms-set)) <>)))))

(def ^{:arglists '([read-or-write model object-id] [read-or-write object] [perms-set])}
  current-user-has-full-permissions?
  "Implementation of [[can-read?]]/[[can-write?]] for the old permissions system. `true` if the current user has *full*
  permissions for the paths returned by its implementation of [[perms-objects-set]]. (`read-or-write` is either `:read` or
  `:write` and passed to [[perms-objects-set]]; you'll usually want to partially bind it in the implementation map)."
  (partial check-perms-with-fn 'metabase.models.permissions/set-has-full-permissions-for-set?))

(def ^{:arglists '([read-or-write model object-id] [read-or-write object] [perms-set])}
  current-user-has-partial-permissions?
  "Implementation of [[can-read?]]/[[can-write?]] for the old permissions system. `true` if the current user has *partial*
  permissions for the paths returned by its implementation of [[perms-objects-set]]. (`read-or-write` is either `:read` or
  `:write` and passed to [[perms-objects-set]]; you'll usually want to partially bind it in the implementation map)."
  (partial check-perms-with-fn 'metabase.models.permissions/set-has-partial-permissions-for-set?))

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

(defmethod can-read? ::read-policy.partial-perms-for-perms-set
  ([instance]
   (current-user-has-partial-permissions? :read instance))
  ([model pk]
   (current-user-has-partial-permissions? :read model pk)))

(defmethod can-read? ::read-policy.full-perms-for-perms-set
  ([instance]
   (current-user-has-full-permissions? :read instance))
  ([model pk]
   (current-user-has-full-permissions? :read model pk)))

(defmethod can-write? ::write-policy.partial-perms-for-perms-set
  ([instance]
   (current-user-has-partial-permissions? :write instance))
  ([model pk]
   (current-user-has-partial-permissions? :write model pk)))

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
  (json.generate/encode-map instance json-generator))

(json.generate/add-encoder
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
