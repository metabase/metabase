(ns metabase.permissions.middleware
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.config :as perms.config]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- get-resource-name-from-path
  "Extract resource name from API path for permission checking."
  [uri]
  (cond
    (re-find #"/api/dashboard/(\d+)" uri)
    (when-let [id (second (re-find #"/api/dashboard/(\d+)" uri))]
      (:name (t2/select-one :model/Dashboard :id (Integer/parseInt id))))
    
    (re-find #"/api/card/(\d+)" uri)
    (when-let [id (second (re-find #"/api/card/(\d+)" uri))]
      (:name (t2/select-one :model/Card :id (Integer/parseInt id))))
    
    (re-find #"/api/collection/(\d+)" uri)
    (when-let [id (second (re-find #"/api/collection/(\d+)" uri))]
      (:name (t2/select-one :model/Collection :id (Integer/parseInt id))))
    
    :else nil))

(defn- requires-view-permission?
  "Check if the request requires view permission."
  [method uri]
  (and (= method :get)
       (or (re-find #"/api/dashboard/\d+" uri)
           (re-find #"/api/card/\d+" uri)
           (re-find #"/api/collection/\d+" uri))))

(defn- requires-edit-permission?
  "Check if the request requires edit permission."
  [method uri]
  (and (#{:put :post :delete} method)
       (or (re-find #"/api/dashboard" uri)
           (re-find #"/api/card" uri)
           (re-find #"/api/collection" uri))))

(defn wrap-permissions-check
  "Middleware to check fine-grained permissions before processing API requests."
  [handler]
  (fn [request]
    (if-not (perms.config/permissions-enabled?)
      ;; If permissions not configured, proceed normally
      (handler request)
      
      ;; Check permissions if configured
      (let [method (keyword (:request-method request))
            uri (:uri request)
            user-id (api/*current-user-id*)
            user-email (:email @api/*current-user*)]
        
        (cond
          ;; Skip permission check for non-API routes
          (not (re-find #"^/api/" uri))
          (handler request)
          
          ;; Skip permission check if no user (public access, etc.)
          (not user-id)
          (handler request)
          
          ;; Check view permissions
          (requires-view-permission? method uri)
          (if-let [resource-name (get-resource-name-from-path uri)]
            (if (perms.config/has-view-permission? user-email user-id resource-name)
              (handler request)
              {:status 403
               :body {:message (tru "You don't have permission to view this resource.")}})
            (handler request)) ; If we can't determine resource name, allow
          
          ;; Check edit permissions
          (requires-edit-permission? method uri)
          (if-let [resource-name (get-resource-name-from-path uri)]
            (if (perms.config/has-edit-permission? user-email user-id resource-name)
              (handler request)
              {:status 403
               :body {:message (tru "You don't have permission to edit this resource.")}})
            (handler request)) ; If we can't determine resource name, allow
          
          ;; Default: allow the request
          :else
          (handler request))))))

(defn filter-dashboards-by-permissions
  "Filter dashboards based on user permissions."
  [dashboards user-email user-id]
  (perms.config/filter-by-view-permissions user-email user-id dashboards :name))

(defn filter-cards-by-permissions
  "Filter cards/questions based on user permissions."
  [cards user-email user-id]
  (perms.config/filter-by-view-permissions user-email user-id cards :name))

(defn filter-collections-by-permissions
  "Filter collections based on user permissions."
  [collections user-email user-id]
  (perms.config/filter-by-view-permissions user-email user-id collections :name))