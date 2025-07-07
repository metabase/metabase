(ns metabase.permissions.config
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private permissions-config-path "/app/config/permissions.json")

(defonce ^:private permissions-config-cache (atom nil))

(defn- load-permissions-config-from-file []
  (try
    (when (.exists (io/file permissions-config-path))
      (with-open [reader (io/reader permissions-config-path)]
        (json/decode+kw reader)))
    (catch Exception e
      (log/warn e "Failed to load permissions config from" permissions-config-path)
      nil)))

(defn get-permissions-config
  "Get the current permissions configuration. Returns nil if no config file exists."
  []
  (or @permissions-config-cache
      (when-let [config (load-permissions-config-from-file)]
        (reset! permissions-config-cache config)
        config)))

(defn permissions-enabled?
  "Check if custom permissions are enabled by checking if permissions.json exists."
  []
  (some? (get-permissions-config)))

(defn reload-permissions-config!
  "Reload permissions configuration from file. Used for development/testing."
  []
  (reset! permissions-config-cache (load-permissions-config-from-file)))

(defn get-user-permissions
  "Get permissions for a specific user by email."
  [user-email]
  (when-let [config (get-permissions-config)]
    (get-in config [:users user-email])))

(defn get-group-permissions
  "Get permissions for a specific group by name."
  [group-name]
  (when-let [config (get-permissions-config)]
    (get-in config [:groups group-name])))

(defn get-user-groups
  "Get the groups a user belongs to."
  [user-id]
  (when user-id
    (map :name (t2/select :model/PermissionsGroup
                          {:join [[:permissions_group_membership :pgm] [:= :permissions_group.id :pgm.group_id]]
                           :where [:= :pgm.user_id user-id]}))))

(defn resolve-user-permissions
  "Resolve effective permissions for a user combining user-specific and group-based permissions."
  [user-email user-id]
  (when (permissions-enabled?)
    (let [user-perms (get-user-permissions user-email)
          user-groups (get-user-groups user-id)
          group-perms (mapcat #(vals (get-group-permissions %)) user-groups)
          
          ;; Combine all view permissions
          view-perms (set (concat (:view user-perms [])
                                  (mapcat :view group-perms)))
          
          ;; Combine all edit permissions  
          edit-perms (set (concat (:edit user-perms [])
                                  (mapcat :edit group-perms)))]
      
      {:view (vec view-perms)
       :edit (vec edit-perms)})))

(defn has-view-permission?
  "Check if user has view permission for a specific resource."
  [user-email user-id resource-name]
  (if-not (permissions-enabled?)
    true ; If permissions not configured, allow everything
    (let [perms (resolve-user-permissions user-email user-id)
          view-perms (:view perms [])]
      (or (some #{"All"} view-perms)
          (some #{resource-name} view-perms)))))

(defn has-edit-permission?
  "Check if user has edit permission for a specific resource."
  [user-email user-id resource-name]
  (if-not (permissions-enabled?)
    true ; If permissions not configured, allow everything
    (let [perms (resolve-user-permissions user-email user-id)
          edit-perms (:edit perms [])]
      (or (some #{"All"} edit-perms)
          (some #{resource-name} edit-perms)))))

(defn filter-by-view-permissions
  "Filter a collection of resources based on user's view permissions."
  [user-email user-id resources name-fn]
  (if-not (permissions-enabled?)
    resources ; If permissions not configured, return all
    (let [perms (resolve-user-permissions user-email user-id)
          view-perms (set (:view perms []))]
      (if (contains? view-perms "All")
        resources
        (filter #(contains? view-perms (name-fn %)) resources)))))

(defn filter-by-edit-permissions
  "Filter a collection of resources based on user's edit permissions."
  [user-email user-id resources name-fn]
  (if-not (permissions-enabled?)
    resources ; If permissions not configured, return all
    (let [perms (resolve-user-permissions user-email user-id)
          edit-perms (set (:edit perms []))]
      (if (contains? edit-perms "All")
        resources
        (filter #(contains? edit-perms (name-fn %)) resources)))))