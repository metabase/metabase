(ns metabase.models.interface
  (:require [cheshire.core :as json]
            [clojure.core.memoize :as memoize]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.db.connection :as mdb.connection]
            [metabase.mbql.normalize :as normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.cron :as cron-util]
            [metabase.util.encryption :as encryption]
            [metabase.util.i18n :refer [trs tru]]
            [potemkin.types :as p.types]
            [schema.core :as s]
            [taoensso.nippy :as nippy]
            [toucan.models :as models])
  (:import [java.io BufferedInputStream ByteArrayInputStream DataInputStream]
           java.sql.Blob
           java.util.zip.GZIPInputStream))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Toucan Extensions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(models/set-root-namespace! 'metabase.models)


;;; types

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
        (log/error e (str (trs "Error parsing JSON")))
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

(models/add-type! :json
  :in  json-in
  :out json-out-with-keywordization)

(models/add-type! :json-no-keywordization
  :in  json-in
  :out json-out-without-keywordization)

;; `metabase-query` type is for *outer* queries like Card.dataset_query. Normalizes them on the way in & out
(defn- maybe-normalize [query]
  (cond-> query
    (seq query) normalize/normalize))

(defn- catch-normalization-exceptions
  "Wraps normalization fn `f` and returns a version that gracefully handles Exceptions during normalization. When
  invalid queries (etc.) come out of the Database, it's best we handle normalization failures gracefully rather than
  letting the Exception cause the entire API call to fail because of one bad object. (See #8914 for more details.)"
  [f]
  (fn [query]
    (try
      (doall (f query))
      (catch Throwable e
        (log/error e (tru "Unable to normalize:") "\n"
                   (u/pprint-to-str 'red query))
        nil))))

(models/add-type! :metabase-query
  :in  (comp json-in maybe-normalize)
  :out (comp (catch-normalization-exceptions maybe-normalize) json-out-with-keywordization))

(def ^:private MetricSegmentDefinition
  {(s/optional-key :filter)      (s/maybe mbql.s/Filter)
   (s/optional-key :aggregation) (s/maybe [mbql.s/Aggregation])
   s/Keyword                     s/Any})

(def ^:private ^{:arglists '([definition])} validate-metric-segment-definition
  (s/validator MetricSegmentDefinition))

;; `metric-segment-definition` is, predictably, for Metric/Segment `:definition`s, which are just the inner MBQL query
(defn- normalize-metric-segment-definition [definition]
  (when (seq definition)
    (u/prog1 (normalize/normalize-fragment [:query] definition)
      (validate-metric-segment-definition <>))))

;; For inner queries like those in Metric definitions
(models/add-type! :metric-segment-definition
  :in  (comp json-in normalize-metric-segment-definition)
  :out (comp (catch-normalization-exceptions normalize-metric-segment-definition) json-out-with-keywordization))

(defn- normalize-visualization-settings [viz-settings]
  ;; frontend uses JSON-serialized versions of MBQL clauses as keys in `:column_settings`; we need to normalize them
  ;; to modern MBQL clauses so things work correctly
  (letfn [(normalize-column-settings-key [k]
            (some-> k u/qualified-name json/parse-string normalize/normalize json/generate-string))
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
               (cond-> form
                 (mbql-field-clause? form) normalize/normalize))
             form))]
    (cond-> (walk/keywordize-keys (dissoc viz-settings "column_settings"))
      (get viz-settings "column_settings") (assoc :column_settings (normalize-column-settings (get viz-settings "column_settings")))
      true                                 normalize-mbql-clauses)))

(models/add-type! :visualization-settings
  :in  json-in
  :out (comp normalize-visualization-settings json-out-without-keywordization))

;; For DashCard parameter lists
(defn- normalize-parameter-mapping-targets [parameter-mappings]
  (or (normalize/normalize-fragment [:parameters] parameter-mappings)
      []))

(models/add-type! :parameter-mappings
  :in  (comp json-in normalize-parameter-mapping-targets)
  :out (comp (catch-normalization-exceptions normalize-parameter-mapping-targets) json-out-with-keywordization))


;; json-set is just like json but calls `set` on it when coming out of the DB. Intended for storing things like a
;; permissions set
(models/add-type! :json-set
  :in  json-in
  :out #(some-> % json-out-with-keywordization set))

(def ^:private encrypted-json-in  (comp encryption/maybe-encrypt json-in))
(def ^:private encrypted-json-out (comp json-out-with-keywordization encryption/maybe-decrypt))

;; cache the decryption/JSON parsing because it's somewhat slow (~500µs vs ~100µs on a *fast* computer)
;; cache the decrypted JSON for one hour
(def ^:private cached-encrypted-json-out (memoize/ttl encrypted-json-out :ttl/threshold (* 60 60 1000)))

(models/add-type! :encrypted-json
  :in  encrypted-json-in
  :out cached-encrypted-json-out)

(models/add-type! :encrypted-text
  :in  encryption/maybe-encrypt
  :out encryption/maybe-decrypt)

(defn decompress
  "Decompress `compressed-bytes`."
  [compressed-bytes]
  (if (instance? Blob compressed-bytes)
    (recur (.getBytes ^Blob compressed-bytes 0 (.length ^Blob compressed-bytes)))
    (with-open [bis     (ByteArrayInputStream. compressed-bytes)
                bif     (BufferedInputStream. bis)
                gz-in   (GZIPInputStream. bif)
                data-in (DataInputStream. gz-in)]
      (nippy/thaw-from-in! data-in))))

(models/add-type! :compressed
  :in  identity
  :out decompress)

(defn- validate-cron-string [s]
  (s/validate (s/maybe cron-util/CronScheduleString) s))

(models/add-type! :cron-string
  :in  validate-cron-string
  :out identity)

;; Toucan ships with a Keyword type, but on columns that are marked 'TEXT' it doesn't work properly since the values
;; might need to get de-CLOB-bered first. So replace the default Toucan `:keyword` implementation with one that
;; handles those cases.
(models/add-type! :keyword
  :in  u/qualified-name
  :out keyword)

;;; properties

;; use now() for Postgres and H2. now() for MySQL/MariaDB only returns second resolution. So use now(6) which uses the
;; max (nanosecond) resolution.
(defn- now []
  (classloader/require 'metabase.driver.sql.query-processor)
  ((resolve 'metabase.driver.sql.query-processor/current-datetime-honeysql-form) (mdb.connection/db-type)))

(defn- add-created-at-timestamp [obj & _]
  (assoc obj :created_at (now)))

(defn- add-updated-at-timestamp [obj & _]
  (assoc obj :updated_at (now)))

(models/add-property! :timestamped?
  :insert (comp add-created-at-timestamp add-updated-at-timestamp)
  :update add-updated-at-timestamp)

;; like `timestamped?`, but for models that only have an `:updated_at` column
(models/add-property! :updated-at-timestamped?
  :insert add-updated-at-timestamp
  :update add-updated-at-timestamp)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             New Permissions Stuff                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(p.types/defprotocol+ IObjectPermissions
  "Methods for determining whether the current user has read/write permissions for a given object."

  (perms-objects-set [instance ^clojure.lang.Keyword read-or-write]
    "Return a set of permissions object paths that a user must have access to in order to access this object. This
    should be something like #{\"/db/1/schema/public/table/20/\"}. `read-or-write` will be either `:read` or `:write`,
    depending on which permissions set we're fetching (these will be the same sets for most models; they can ignore
    this param).")

  (can-read? [instance] [entity ^Integer id]
    "Return whether `*current-user*` has *read* permissions for an object. You should use one of these implmentations:

  *  `(constantly true)`
  *  `superuser?`
  *  `(partial current-user-has-full-permissions? :read)` (you must also implement `perms-objects-set` to use this)
  *  `(partial current-user-has-partial-permissions? :read)` (you must also implement `perms-objects-set` to use
     this)")

  (^{:hydrate :can_write} can-write? [instance] [entity ^Integer id]
   "Return whether `*current-user*` has *write* permissions for an object. You should use one of these implmentations:

  *  `(constantly true)`
  *  `superuser?`
  *  `(partial current-user-has-full-permissions? :write)` (you must also implement `perms-objects-set` to use this)
  *  `(partial current-user-has-partial-permissions? :write)` (you must also implement `perms-objects-set` to use
      this)")

  (^{:added "0.32.0"} can-create? [entity m]
    "NEW! Check whether or not current user is allowed to CREATE a new instance of `entity` with properties in map
    `m`.

  Because this method was added YEARS after `can-read?` and `can-write?`, most models do not have an implementation
  for this method, and instead `POST` API endpoints themselves contain the appropriate permissions logic (ick).
  Implement this method as you come across models that are missing it.")

  (^{:added "0.36.0"} can-update? [instance changes]
   "NEW! Check whether or not the current user is allowed to update an object and by updating properties to values in
   the `changes` map. This is equivalent to checking whether you're allowed to perform `(toucan.db/update! entity id
   changes)`.

  This method is appropriate for powering `PUT` API endpoints. Like `can-create?` this method was added YEARS after
  most of the current API endpoints were written, so it is used in very few places, and this logic is determined
  ad-hoc in the API endpoints themselves. Use this method going forward!"))

(def IObjectPermissionsDefaults
  "Default implementations for `IObjectPermissions`."
  {:perms-objects-set
   (constantly nil)

   :can-create?
   (fn [entity _]
     (throw
      (NoSuchMethodException.
       (str (format "%s does not yet have an implementation for `can-create?`. " (name entity))
            "Please consider adding one. See dox for `can-create?` for more details."))))

   :can-update?
   (fn
     [instance _]
     (throw
      (NoSuchMethodException.
       (str (format "%s does not yet have an implementation for `can-update?`. " (name instance))
            "Please consider adding one. See dox for `can-update?` for more details."))))})

(defn superuser?
  "Is `*current-user*` is a superuser? Ignores args.
   Intended for use as an implementation of `can-read?` and/or `can-write?`."
  [& _]
  @(requiring-resolve 'metabase.api.common/*is-superuser?*))

(defn- current-user-permissions-set []
  @@(requiring-resolve 'metabase.api.common/*current-user-permissions-set*))

(defn- current-user-has-root-permissions? []
  (contains? (current-user-permissions-set) "/"))

(defn- check-perms-with-fn
  ([fn-symb read-or-write entity object-id]
   (or (current-user-has-root-permissions?)
       (check-perms-with-fn fn-symb read-or-write (entity object-id))))

  ([fn-symb read-or-write object]
   (and object
        (check-perms-with-fn fn-symb (perms-objects-set object read-or-write))))

  ([fn-symb perms-set]
   (let [f (requiring-resolve fn-symb)]
     (assert f)
     (u/prog1 (f (current-user-permissions-set) perms-set)
       (log/tracef "Perms check: %s -> %s" (pr-str (list fn-symb (current-user-permissions-set) perms-set)) <>)))))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object] [perms-set])}
  current-user-has-full-permissions?
  "Implementation of `can-read?`/`can-write?` for the old permissions system. `true` if the current user has *full*
  permissions for the paths returned by its implementation of `perms-objects-set`. (`read-or-write` is either `:read` or
  `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (partial check-perms-with-fn 'metabase.models.permissions/set-has-full-permissions-for-set?))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object] [perms-set])}
  current-user-has-partial-permissions?
  "Implementation of `can-read?`/`can-write?` for the old permissions system. `true` if the current user has *partial*
  permissions for the paths returned by its implementation of `perms-objects-set`. (`read-or-write` is either `:read` or
  `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (partial check-perms-with-fn 'metabase.models.permissions/set-has-partial-permissions-for-set?))
