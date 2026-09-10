(ns metabase-enterprise.sso.db
  "Application database queries for the sso module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn session-user-email-and-source
  "The email and SSO source of the User owning the Session with `session-key-hashed`, or nil."
  [session-key-hashed :- :string]
  (t2/query-one {:select [:u.email :u.sso_source]
                 :from   [[:core_user :u]]
                 :join   [[:core_session :session] [:= :u.id :session.user_id]]
                 :where  [:= :key_hashed session-key-hashed]}))

(mu/defn delete-session!
  "Delete the Session with `session-key-hashed`, returning the number deleted."
  [session-key-hashed :- :string]
  (t2/delete! :model/Session :key_hashed session-key-hashed))

(mu/defn group-ids-by-name
  "The IDs of the PermissionsGroups named one of `group-names`."
  [group-names :- [:set :string]]
  (t2/select-pks-set :model/PermissionsGroup :name [:in group-names]))

(mu/defn insert-relay-state!
  "Insert the SsoRelayState `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:id           :string]
           [:continue_url [:maybe :string]]
           [:origin       [:maybe :string]]
           [:embedding    :boolean]
           [:expires_at   ms/TemporalInstant]]]
  (t2/insert! :model/SsoRelayState row))

(mu/defn unexpired-relay-state
  "The SsoRelayState with `hashed-key` expiring after `now`, or nil."
  [hashed-key :- :string
   now        :- ms/TemporalInstant]
  (t2/select-one :model/SsoRelayState :id hashed-key :expires_at [:> now]))

(mu/defn delete-relay-state!
  "Delete the SsoRelayState with `hashed-key`, returning the number deleted."
  [hashed-key :- :string]
  (t2/delete! :model/SsoRelayState :id hashed-key))

(mu/defn delete-relay-states-expired-at!
  "Delete the SsoRelayStates expired at or before `now`, returning the number deleted."
  [now :- ms/TemporalInstant]
  (t2/delete! :model/SsoRelayState :expires_at [:<= now]))
