(ns metabase-enterprise.data-apps.access
  "Read access through group assignments, with an administrator bypass."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]))

(defn- read-scope
  [{:keys [user-id superuser?]}]
  (if superuser? :all {:user-id user-id}))

(defn readable-apps
  "Apps visible to the actor, without bundles. Optionally restrict to available apps."
  [actor available?]
  (data-apps.db/non-blob-data-apps (read-scope actor) available?))

(defn can-read?
  "Whether the actor can read the app through an assignment or administrator access."
  [actor app-id]
  (let [scope (read-scope actor)]
    (or (= scope :all)
        (data-apps.db/readable-data-app? scope app-id))))
