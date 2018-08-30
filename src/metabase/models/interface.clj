(ns metabase.models.interface
  (:require [cheshire.core :as json]
            [clojure.core.memoize :as memoize]
            [metabase.util :as u]
            [metabase.util
             [cron :as cron-util]
             [date :as du]
             [encryption :as encryption]]
            [schema.core :as s]
            [taoensso.nippy :as nippy]
            [toucan
             [models :as models]
             [util :as toucan-util]])
  (:import java.sql.Blob))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Toucan Extensions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(models/set-root-namespace! 'metabase.models)


;;; types

(defn- json-in [obj]
  (if (string? obj)
    obj
    (json/generate-string obj)))

(defn- json-out [obj keywordize-keys?]
  (let [s (u/jdbc-clob->str obj)]
    (if (string? s)
      (json/parse-string s keywordize-keys?)
      obj)))

(defn- json-out-with-keywordization [obj]
  (json-out obj true))

(defn- json-out-without-keywordization [obj]
  (json-out obj false))

(models/add-type! :json
  :in  json-in
  :out json-out-with-keywordization)

(models/add-type! :json-no-keywordization
  :in  json-in
  :out json-out-without-keywordization)

;; json-set is just like json but calls `set` on it when coming out of the DB. Intended for storing things like a
;; permissions set
(models/add-type! :json-set
  :in  json-in
  :out #(when % (set (json-out-with-keywordization %))))

(models/add-type! :clob
  :in  identity
  :out u/jdbc-clob->str)

(def ^:private encrypted-json-in  (comp encryption/maybe-encrypt json-in))
(def ^:private encrypted-json-out (comp json-out-with-keywordization encryption/maybe-decrypt))

;; cache the decryption/JSON parsing because it's somewhat slow (~500µs vs ~100µs on a *fast* computer)
;; cache the decrypted JSON for one hour
(def ^:private cached-encrypted-json-out (memoize/ttl encrypted-json-out :ttl/threshold (* 60 60 1000)))

(models/add-type! :encrypted-json
  :in  encrypted-json-in
  :out (comp cached-encrypted-json-out u/jdbc-clob->str))

(models/add-type! :encrypted-text
  :in  encryption/maybe-encrypt
  :out (comp encryption/maybe-decrypt u/jdbc-clob->str))

(defn compress
  "Compress OBJ, returning a byte array."
  [obj]
  (nippy/freeze obj {:compressor nippy/snappy-compressor}))

(defn decompress
  "Decompress COMPRESSED-BYTES."
  [compressed-bytes]
  (if (instance? Blob compressed-bytes)
    (recur (.getBytes ^Blob compressed-bytes 0 (.length ^Blob compressed-bytes)))
    (nippy/thaw compressed-bytes {:compressor nippy/snappy-compressor})))

(models/add-type! :compressed
  :in  compress
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
  :in  toucan-util/keyword->qualified-name
  :out (comp keyword u/jdbc-clob->str))


;;; properties

(defn- add-created-at-timestamp [obj & _]
  (assoc obj :created_at (du/new-sql-timestamp)))

(defn- add-updated-at-timestamp [obj & _]
  (assoc obj :updated_at (du/new-sql-timestamp)))

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

(defprotocol IObjectPermissions
  "Methods for determining whether the current user has read/write permissions for a given object."

  (perms-objects-set [this, ^clojure.lang.Keyword read-or-write]
    "Return a set of permissions object paths that a user must have access to in order to access this object. This
    should be something like #{\"/db/1/schema/public/table/20/\"}. READ-OR-WRITE will be either `:read` or `:write`,
    depending on which permissions set we're fetching (these will be the same sets for most models; they can ignore
    this param).")

  (can-read? ^Boolean [instance], ^Boolean [entity, ^Integer id]
    "Return whether `*current-user*` has *read* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?`
     *  `(partial current-user-has-full-permissions? :read)` (you must also implement `perms-objects-set` to use this)
     *  `(partial current-user-has-partial-permissions? :read)` (you must also implement `perms-objects-set` to use
        this)")

  (^{:hydrate :can_write} can-write? ^Boolean [instance], ^Boolean [entity, ^Integer id]
   "Return whether `*current-user*` has *write* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?`
     *  `(partial current-user-has-full-permissions? :write)` (you must also implement `perms-objects-set` to use this)
     *  `(partial current-user-has-partial-permissions? :write)` (you must also implement `perms-objects-set` to use
        this)"))

(def IObjectPermissionsDefaults
  "Default implementations for `IObjectPermissions`."
  {:perms-objects-set (constantly nil)})

(defn superuser?
  "Is `*current-user*` is a superuser? Ignores args.
   Intended for use as an implementation of `can-read?` and/or `can-write?`."
  [& _]
  @(resolve 'metabase.api.common/*is-superuser?*))


(defn- current-user-permissions-set []
  @@(resolve 'metabase.api.common/*current-user-permissions-set*))

(defn- current-user-has-root-permissions? ^Boolean []
  (contains? (current-user-permissions-set) "/"))

(defn- make-perms-check-fn [perms-check-fn-symb]
  (fn -has-perms?
    ([read-or-write entity object-id]
     (or (current-user-has-root-permissions?)
         (-has-perms? read-or-write (entity object-id))))
    ([read-or-write object]
     (and object
          (-has-perms? (perms-objects-set object read-or-write))))
    ([perms-set]
     ((resolve perms-check-fn-symb) (current-user-permissions-set) perms-set))))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object] [perms-set])}
  ^Boolean current-user-has-full-permissions?
  "Implementation of `can-read?`/`can-write?` for the old permissions system. `true` if the current user has *full*
  permissions for the paths returned by its implementation of `perms-objects-set`. (READ-OR-WRITE is either `:read` or
  `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (make-perms-check-fn 'metabase.models.permissions/set-has-full-permissions-for-set?))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object] [perms-set])}
  ^Boolean current-user-has-partial-permissions?
  "Implementation of `can-read?`/`can-write?` for the old permissions system. `true` if the current user has *partial*
  permissions for the paths returned by its implementation of `perms-objects-set`. (READ-OR-WRITE is either `:read` or
  `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (make-perms-check-fn 'metabase.models.permissions/set-has-partial-permissions-for-set?))
