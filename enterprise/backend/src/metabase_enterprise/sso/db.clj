(ns metabase-enterprise.sso.db
  "Application database queries for the sso module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [toucan2.core :as t2]))

(defn session-user-email-and-source
  "The email and SSO source of the User owning the Session with `session-key-hashed`, or nil."
  [session-key-hashed]
  (t2/query-one {:select [:u.email :u.sso_source]
                 :from   [[:core_user :u]]
                 :join   [[:core_session :session] [:= :u.id :session.user_id]]
                 :where  [:= :key_hashed session-key-hashed]}))

(defn delete-session!
  "Delete the Session with `session-key-hashed`."
  [session-key-hashed]
  (t2/delete! :model/Session :key_hashed session-key-hashed))

(defn group-ids-by-name
  "The IDs of the PermissionsGroups named one of `group-names`."
  [group-names]
  (t2/select-pks-set :model/PermissionsGroup :name [:in group-names]))

(defn insert-relay-state!
  "Insert the SsoRelayState `row`."
  [row]
  (t2/insert! :model/SsoRelayState row))

(defn unexpired-relay-state
  "The SsoRelayState with `hashed-key` expiring after `now`, or nil."
  [hashed-key now]
  (t2/select-one :model/SsoRelayState :id hashed-key :expires_at [:> now]))

(defn delete-relay-state!
  "Delete the SsoRelayState with `hashed-key`."
  [hashed-key]
  (t2/delete! :model/SsoRelayState :id hashed-key))

(defn delete-relay-states-expired-at!
  "Delete the SsoRelayStates expired at or before `now`, returning the number deleted."
  [now]
  (t2/delete! :model/SsoRelayState :expires_at [:<= now]))
