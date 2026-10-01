(ns metabase-enterprise.data-apps.access
  "Read access through group assignments."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]))

(defn- read-scope
  [{:keys [user-id superuser?]}]
  (if superuser? :all {:user-id user-id}))

(defn readable-apps
  "List of apps the user can view."
  [user available?]
  (data-apps.db/non-blob-data-apps (read-scope user) available?))

(defn can-read?
  "Whether the user can view the app through an assignment or admin access."
  [user app-id]
  (let [scope (read-scope user)]
    (or (= scope :all)
        (data-apps.db/readable-data-app? scope app-id))))
