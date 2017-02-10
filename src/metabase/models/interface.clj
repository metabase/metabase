(ns metabase.models.interface
  (:require [clojure.core.memoize :as memoize]
            [cheshire.core :as json]
            [toucan.models :as models]
            [metabase.config :as config]
            [metabase.util :as u]
            [metabase.util.encryption :as encryption]))

;;; ------------------------------------------------------------ Toucan Extensions ------------------------------------------------------------

(models/set-root-namespace! 'metabase.models)

(defn- json-in [obj]
  (if (string? obj)
    obj
    (json/generate-string obj)))

(defn- json-out [obj]
  (let [s (u/jdbc-clob->str obj)]
    (if (string? s)
      (json/parse-string s keyword)
      obj)))

(models/add-type! :json
  :in  json-in
  :out json-out)

(models/add-type! :clob
  :in  identity
  :out u/jdbc-clob->str)

(def ^:private encrypted-json-in  (comp encryption/maybe-encrypt json-in))
(def ^:private encrypted-json-out (comp json-out encryption/maybe-decrypt))

;; cache the decryption/JSON parsing because it's somewhat slow (~500µs vs ~100µs on a *fast* computer)
(def ^:private cached-encrypted-json-out (memoize/ttl encrypted-json-out :ttl/threshold (* 60 60 1000))) ; cache decrypted JSON for one hour

(models/add-type! :encrypted-json
  :in  encrypted-json-in
  :out cached-encrypted-json-out)


(defn- add-created-at-timestamp [obj & _]
  (assoc obj :created_at (u/new-sql-timestamp)))

(defn- add-updated-at-timestamp [obj & _]
  (assoc obj :updated_at (u/new-sql-timestamp)))

(models/add-property! :timestamped?
  :insert (comp add-created-at-timestamp add-updated-at-timestamp)
  :update add-updated-at-timestamp)


;;; ------------------------------------------------------------ New Permissions Stuff ------------------------------------------------------------

(defprotocol IObjectPermissions
  "Methods for determining whether the current user has read/write permissions for a given object."

  (perms-objects-set [this, ^clojure.lang.Keyword read-or-write]
    "Return a set of permissions object paths that a user must have access to in order to access this object. This should be something like #{\"/db/1/schema/public/table/20/\"}.
     READ-OR-WRITE will be either `:read` or `:write`, depending on which permissions set we're fetching (these will be the same sets for most models; they can ignore this param).")

  (can-read? ^Boolean [instance], ^Boolean [entity, ^Integer id]
    "Return whether `*current-user*` has *read* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?`
     *  `(partial current-user-has-full-permissions? :read)` (you must also implement `perms-objects-set` to use this)
     *  `(partial current-user-has-partial-permissions? :read)` (you must also implement `perms-objects-set` to use this)")

  (^{:hydrate :can_write} can-write? ^Boolean [instance], ^Boolean [entity, ^Integer id]
   "Return whether `*current-user*` has *write* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?`
     *  `(partial current-user-has-full-permissions? :write)` (you must also implement `perms-objects-set` to use this)
     *  `(partial current-user-has-partial-permissions? :write)` (you must also implement `perms-objects-set` to use this)"))

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
          ((resolve perms-check-fn-symb) (current-user-permissions-set) (perms-objects-set object read-or-write))))))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object])}
  ^Boolean current-user-has-full-permissions?
  "Implementation of `can-read?`/`can-write?` for the new permissions system.
   `true` if the current user has *full* permissions for the paths returned by its implementation of `perms-objects-set`.
   (READ-OR-WRITE is either `:read` or `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (make-perms-check-fn 'metabase.models.permissions/set-has-full-permissions-for-set?))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object])}
  ^Boolean current-user-has-partial-permissions?
  "Implementation of `can-read?`/`can-write?` for the new permissions system.
   `true` if the current user has *partial* permissions for the paths returned by its implementation of `perms-objects-set`.
   (READ-OR-WRITE is either `:read` or `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (make-perms-check-fn 'metabase.models.permissions/set-has-partial-permissions-for-set?))
