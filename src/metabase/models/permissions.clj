(ns metabase.models.permissions
  (:require [metabase.db :as db]
            (metabase.models [interface :as i]
                             [permissions-group :as groups])
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))


(i/defentity Permissions :permissions)

(def ^:private ^:const valid-object-path-patterns
  [#"^/db/(\d+)/$"                                ; permissions for the entire DB
   #"^/db/(\d+)/native/$"                         ; permissions for native queries for the DB
   #"^/db/(\d+)/schema/$"                         ; permissions for all schemas in the DB
   #"^/db/(\d+)/schema/([^\\/]*)/$"               ; permissions for a specific schema
   #"^/db/(\d+)/schema/([^\\/]*)/table/(\d+)/$"]) ; permissions for a specific table

(defn valid-object-path?
  "Does OBJECT-PATH follow a known, allowed format?"
  ^Boolean [^String object-path]
  (boolean (when (seq object-path)
             (some (u/rpartial re-matches object-path)
                   valid-object-path-patterns))))

;; TOOD - we should *definitiely* consider caching these two functions to avoid TONS OF DB CALLS
(defn group-has-full-access?
  "Does a group have permissions for OBJECT and *all* of its children?"
  ^Boolean [^Integer group-id, ^String object]
  {:pre [(valid-object-path? object)]}
  ;; e.g. WHERE (object || '%') LIKE '/db/1000/'
  (db/exists? Permissions
    :group_id group-id
    object    [:like (hx/concat :object (hx/literal "%"))]))

(defn group-has-partial-access?
  "Does a group have permissions for at least *some* of the children of OBJECT?"
  [^Integer group-id, ^String object]
  {:pre [(valid-object-path? object)]}
  (cond
    (group-has-full-access? group-id object) :full
    (db/exists? Permissions
      :group_id group-id
      :object   [:like (str object "%")])    :partial))


;;; ------------------------------------------------------------ LIFECYCLE ------------------------------------------------------------

(def ^:dynamic ^Boolean *allow-root-entries*
  "Show we allow permissions entries like `/`? By default, this is disallowed, but you can temporarily disable it here when creating the default entry for `Admin`."
  false)

(def ^:dynamic ^Boolean *allow-admin-permissions-changes*
  "Show we allow changes to be made to permissions belonging to the Admin group? By default this is disabled to prevent accidental tragedy, but you can enable it here
   when creating the default entry for `Admin`."
  false)

(defn- assert-not-admin-group [{:keys [group_id]}]
  (when (and (= group_id (:id (groups/admin)))
             (not *allow-admin-permissions-changes*))
    (throw (ex-info "You cannot create or revoke permissions for the 'Admin' group."
             {:status-code 400}))))

(defn- assert-valid-object [{:keys [object]}]
  (when (and object
             (not (valid-object-path? object))
             (or (not= object "/")
                 (not *allow-root-entries*)))
    (throw (ex-info (format "Invalid permissions object path: '%s'." object)
             {:status-code 400}))))

(defn- assert-valid [permissions]
  (assert-not-admin-group permissions)
  (assert-valid-object permissions))

(defn- pre-insert [permissions]
  (u/prog1 permissions
    (assert-valid permissions)))

(defn- pre-update [permissions]
  (u/prog1 permissions
    (assert-valid permissions)))

(defn- pre-cascade-delete [permissions]
  (assert-not-admin-group permissions))


(u/strict-extend (class Permissions)
  i/IEntity (merge i/IEntityDefaults
                   {:pre-insert         pre-insert
                    :pre-update         pre-update
                    :pre-cascade-delete pre-cascade-delete}))
