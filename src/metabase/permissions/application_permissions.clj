(ns metabase.permissions.application-permissions
  "Application permissions of a user, settings, monitoring and subscriptions, read from the permission rows of their
  groups every time they are asked."
  (:require
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private permission-types
  "The application permission types."
  [:setting :monitoring :subscription])

(mu/defn application-permissions-for-user :- [:set [:enum :setting :monitoring :subscription]]
  "The application permission types the user of `user-info` has, in one query: all of them for a superuser, and
  otherwise those a group of theirs holds a row for, the type's own or one for every application permission."
  [{:keys [user-id is-superuser?]} :- ::permissions.schema/collection-user-info]
  (cond
    is-superuser?  (set permission-types)
    (nil? user-id) #{}
    :else
    (let [type->object (into {} (map (juxt identity permissions.path/application-perms-path)) permission-types)
          held         (permissions.db/user-permission-objects user-id (into ["/" "/application/"] (vals type->object)))]
      (if (some held ["/" "/application/"])
        (set permission-types)
        (into #{} (filter #(contains? held (type->object %))) permission-types)))))
