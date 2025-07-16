(ns metabase.permissions.types
  "Allows permissions to be defined as a a tuple of perm_type, model_type, perm_values and then resolved and tested in a common pattern."
  (:require
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Permission definitions ---------------------------------------------------

;; IMPORTANT: If you add a new permission type, `:values` must be ordered from *most* permissive to *least* permissive.
;;
;;  - When fetching a user's permissions, the default behavior is to return the *most* permissive value from any group the
;;    user is in. This can be overridden by definding a custom implementation of `coalesce`.
;;
;;  - If a user does not have any value for the permission when it is fetched, the *least* permissive value is used as a
;;    fallback.

(def Permissions
  "Permissions which apply to models."
  {:perms/collection-access     {:model :model/Collection :values [:read-and-write :read :none]}
   ;; `legacy-no-self-service` is a deprecated permission which behaves the same as `:unrestricted` but does not override
   ;; `:blocked` in other groups
   :perms/view-data             {:model :model/Table :values [:unrestricted :legacy-no-self-service :blocked]}
   :perms/create-queries        {:model :model/Table :values [:query-builder-and-native :query-builder :no]}
   :perms/download-results      {:model :model/Table :values [:one-million-rows :ten-thousand-rows :no]}
   :perms/manage-table-metadata {:model :model/Table :values [:yes :no]}
   :perms/manage-database       {:model :model/Database :values [:yes :no]}})

(def PermissionType
  "Malli spec for valid permission types."
  (into [:enum {:error/message "Invalid permission type"}]
        (keys Permissions)))

(def PermissionValue
  "Malli spec for a keyword that matches any value in [[Permissions]]."
  (into [:enum {:error/message "Invalid permission value"}]
        (distinct (mapcat :values (vals Permissions)))))

;;; ------------------------------------------- Misc Utils ------------------------------------------------------------

(defn least-permissive-value
  "The *least* permissive value for a given perm type. This value is used as a fallback when a user does not have a
  value for the permission in the database."
  [perm-type]
  (-> Permissions perm-type :values last))

(defn most-permissive-value
  "The *most* permissive value for a given perm type. This is the default value for superusers."
  [perm-type]
  (-> Permissions perm-type :values first))

(mu/defn at-least-as-permissive?
  "Returns true if value1 is at least as permissive as value2 for the given permission type."
  [perm-type :- PermissionType
   value1    :- PermissionValue
   value2    :- PermissionValue]
  (let [^PersistentVector values (-> Permissions perm-type :values)]
    (<= (.indexOf values value1)
        (.indexOf values value2))))

(def model-by-perm-type
  "A map from permission types directly to model identifiers (or `nil`)."
  (update-vals Permissions :model))

(defn assert-value-matches-perm-type
  "Validates that a permission value is valid for the given permission type.
  Throws an exception if the perm-value is not one of the allowed values for perm-type."
  [perm-type perm-value]
  (when-not (contains? (set (get-in Permissions [perm-type :values])) perm-value)
    (throw (ex-info (tru "Permission type {0} cannot be set to {1}" perm-type perm-value)
                    {perm-type (Permissions perm-type)}))))
