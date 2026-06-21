(ns metabase.permissions.schema
  (:require
   [metabase.util.malli.registry :as mr]))

;;; ---------------------------------------- Permission definitions ---------------------------------------------------

;; IMPORTANT: If you add a new permission type, `:values` must be ordered from *most* permissive to *least* permissive.
;;
;;  - When fetching a user's permissions, the default behavior is to return the *most* permissive value from any group the
;;    user is in. This can be overridden by defining a custom implementation of `coalesce`.
;;
;;  - If a user does not have any value for the permission when it is fetched, the *least* permissive value is used as a
;;    fallback.

(def data-permissions
  "Permissions which apply to individual databases or tables."
  ;; `legacy-no-self-service` is a deprecated permission which behaves the same as `:unrestricted` but does not override
  ;; `:blocked` in other groups
  {:perms/view-data             {:model :model/Table,    :values [:unrestricted :legacy-no-self-service :blocked]}
   :perms/create-queries        {:model :model/Table,    :values [:query-builder-and-native :query-builder :no]}
   :perms/download-results      {:model :model/Table,    :values [:one-million-rows :ten-thousand-rows :no]}
   :perms/manage-table-metadata {:model :model/Table,    :values [:yes :no]}
   :perms/manage-database       {:model :model/Database, :values [:yes :no]}
   :perms/transforms            {:model :model/Database, :values [:yes :no]}})

(mr/def ::data-permission-type
  "Malli spec for valid permission types."
  (into [:enum {:error/message "Invalid permission type"}]
        (keys data-permissions)))

(mr/def ::data-permission-value
  "Malli spec for a keyword that matches any value in [[Permissions]]."
  (into [:enum {:error/message "Invalid permission value"}]
        (distinct (mapcat :values (vals data-permissions)))))
