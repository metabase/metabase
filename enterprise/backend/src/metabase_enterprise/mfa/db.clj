(ns metabase-enterprise.mfa.db
  "Application database queries for the mfa module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions."
  (:require
   [malli.util :as mut]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def totp-provider
  "The AuthIdentity provider of TOTP enrollments."
  "totp")

(mu/defn insert-auth-identity!
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:id           {:optional true} ms/PositiveInt]
           [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
           [:provider     {:optional true} [:maybe [:or :keyword :string]]]
           [:credentials  {:optional true} [:maybe ::auth-identity.schema/auth-identity.credentials.totp]]
           [:metadata     {:optional true} [:maybe [:map {:closed true}]]]
           [:provider_id  {:optional true} [:maybe :string]]
           [:last_used_at {:optional true} [:maybe ms/TemporalInstant]]
           [:expires_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]
           [:confirmed_at {:optional true} [:maybe ms/TemporalInstant]]]]
  (t2/insert! :model/AuthIdentity row))

(mu/defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `auth-identity-id`, returning the number updated."
  [auth-identity-id :- ms/PositiveInt
   changes          :- (mut/select-keys ::auth-identity.schema/auth-identity.update [:credentials :confirmed_at])]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(mu/defn delete-totp-identity!
  "Delete the TOTP AuthIdentity of the User with `user-id`, returning the number deleted."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/AuthIdentity :user_id user-id :provider totp-provider))
