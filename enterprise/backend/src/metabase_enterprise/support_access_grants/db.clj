(ns metabase-enterprise.support-access-grants.db
  "Application database queries for the support-access-grants module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions.

  The queries on `:model/SupportAccessGrantLog` below follow [[::support-access-grant-log-opts]]; queries that do not
  fit it live in the support-access-grants-only section at the bottom of this namespace."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.support-access-grants.schema :as support-access-grants.schema]
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::support-access-grant-log-filters
  "Which SupportAccessGrantLogs a query applies to. Keys mirror the columns of `support_access_grant_log`: a scalar
  matches that value. `:revoked_at_set` matches rows where `:revoked_at` is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id             {:optional true} ms/PositiveInt]
   [:user_id        {:optional true} ::lib.schema.id/user]
   [:ticket_number  {:optional true} :string]
   [:revoked_at_set {:optional true} :boolean]])

(mr/def ::support-access-grant-log-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::support-access-grant-log-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::support-access-grants.schema/support-access-grant-log.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::support-access-grants.schema/support-access-grant-log.column
                                              [:tuple ::support-access-grants.schema/support-access-grant-log.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private set-columns
  "Maps the `revoked_at_set` filter key to the column whose nullness it tests."
  {:revoked_at_set :revoked_at})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/SupportAccessGrantLog columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts {:set-columns set-columns}))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-support-access-grant-log :- [:maybe ::support-access-grants.schema/support-access-grant-log.partial]
  "The first SupportAccessGrantLog matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::support-access-grant-log-opts]]
  (apply t2/select-one (->model columns) (->args opts)))

(mu/defn select-support-access-grant-logs :- [:sequential ::support-access-grants.schema/support-access-grant-log.partial]
  "The SupportAccessGrantLogs matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::support-access-grant-log-opts]]
  (apply t2/select (->model columns) (->args opts)))

(mu/defn count-support-access-grant-logs :- :int
  "The number of SupportAccessGrantLogs matching `opts`."
  [opts :- [:maybe ::support-access-grant-log-opts]]
  (apply t2/count :model/SupportAccessGrantLog (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-support-access-grant-log! :- ::support-access-grants.schema/support-access-grant-log
  "Insert the SupportAccessGrantLog `row` and return the inserted instance."
  [row :- ::support-access-grants.schema/support-access-grant-log.create]
  (t2/insert-returning-instance! :model/SupportAccessGrantLog row))

(mu/defn update-support-access-grant-logs! :- :int
  "Apply `changes` to every SupportAccessGrantLog matching `opts`, returning the number updated."
  [opts    :- [:maybe ::support-access-grant-log-opts]
   changes :- ::support-access-grants.schema/support-access-grant-log.update]
  (apply t2/update! :model/SupportAccessGrantLog (conj (u.query/opts->kv-args opts {:set-columns set-columns}) changes)))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (users.db/select-one-user {:id user-id}))

(mu/defn user-by-email
  "The User with `email`, or nil."
  [email :- :string]
  (users.db/select-one-user {:email email}))

(mu/defn user-superuser-flag-by-email
  "The `:id` and `:is_superuser` of the User with `email`, or nil."
  [email :- :string]
  (users.db/select-one-user {:email email :columns [:id :is_superuser]}))

(mu/defn user-names-and-emails
  "A map of User ID to first name and email for `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (update-vals (users.db/select-user-pk->instance {:id (set user-ids) :columns [:first_name :email]})
               #(select-keys % [:first_name :email])))

(mu/defn insert-user!
  "Insert `user` and return the new instance."
  [user :- (mut/select-keys ::users.schema/user.create [:email :first_name :last_name :is_superuser])]
  (users.db/insert-user! user))

(mu/defn update-user!
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ::lib.schema.id/user
   changes :- (mut/select-keys ::users.schema/user.update [:is_active :is_superuser])]
  (users.db/update-users! {:id user-id} changes))

(mu/defn session-exists-for-user?
  "Whether the User with `user-id` has a Session."
  [user-id :- ::lib.schema.id/user]
  (t2/exists? :model/Session :user_id user-id))

(mu/defn delete-sessions-of-user!
  "Delete the Sessions of the User with `user-id`, returning the number deleted."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/Session :user_id user-id))

(mu/defn auth-identity-ids-of-user
  "The IDs of the AuthIdentities of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-pks-vec :model/AuthIdentity :user_id user-id))

(mu/defn support-access-auth-identity-id
  "The ID of the support-access-grant AuthIdentity of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-pk :model/AuthIdentity :user_id user-id :provider "support-access-grant"))

(mu/defn insert-auth-identity!
  "Insert the AuthIdentity `row`, returning the number inserted."
  [row :- (mut/select-keys ::auth-identity.schema/auth-identity.update [:user_id :provider :provider_id :expires_at :credentials :metadata])]
  (t2/insert! :model/AuthIdentity row))

(mu/defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `auth-identity-id`, returning the number updated. `changes` may be a
  whole AuthIdentity instance re-saved after a partial edit (e.g. [[metabase.auth-identity.providers.emailed-secret/mark-token-consumed]]
  round-trips the full row it was given), so every column is accepted."
  [auth-identity-id :- ms/PositiveInt
   changes          :- [:map {:closed true}
                        [:id            {:optional true} ms/PositiveInt]
                        [:user_id       {:optional true} ::lib.schema.id/user]
                        [:provider      {:optional true} [:maybe [:or :keyword :string]]]
                        [:provider_id   {:optional true} [:maybe :string]]
                        [:expires_at    {:optional true} [:maybe ms/TemporalInstant]]
                        [:last_used_at  {:optional true} [:maybe ms/TemporalInstant]]
                        [:confirmed_at  {:optional true} [:maybe ms/TemporalInstant]]
                        [:created_at    {:optional true} ms/TemporalInstant]
                        [:updated_at    {:optional true} ms/TemporalInstant]
                        [:credentials   {:optional true}
                         [:maybe [:map {:closed true}
                                  [:token_hash     :string]
                                  [:expires_at     ms/TemporalInstant]
                                  [:grant_ends_at  ms/TemporalInstant]
                                  [:consumed_at    [:maybe ms/TemporalInstant]]]]]
                        [:metadata      {:optional true}
                         [:maybe [:map {:closed true}
                                  [:email           ms/Email]
                                  [:ip_address       {:optional true} [:maybe :string]]
                                  [:request_context  {:optional true}
                                   [:map {:closed true}
                                    [:user_agent {:optional true} [:maybe :string]]
                                    [:timestamp  {:optional true} [:or ms/TemporalInstant :string]]]]]]]]]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(mu/defn expire-auth-identities!
  "Set the expiry of the AuthIdentities with `auth-identity-ids` to `expires-at`, returning the number updated."
  [auth-identity-ids :- [:sequential ms/PositiveInt]
   expires-at        :- ms/TemporalInstant]
  (t2/update! :model/AuthIdentity :id [:in auth-identity-ids] {:expires_at expires-at}))

;;; ------------------------- Queries used only by the support-access-grants module -------------------------

(mu/defn active-grant-exists?
  "Whether a SupportAccessGrantLog is unrevoked and ends after `now`."
  [now :- ms/TemporalInstant]
  (t2/exists? :model/SupportAccessGrantLog :revoked_at nil :grant_end_timestamp [:> now]))

(mu/defn select-current-support-access-grant-log :- [:maybe ::support-access-grants.schema/support-access-grant-log]
  "The newest unrevoked SupportAccessGrantLog that has not ended, or nil."
  []
  (t2/select-one :model/SupportAccessGrantLog
                 {:where    [:and [:= :revoked_at nil]
                             [:> :grant_end_timestamp :%now]]
                  :order-by [[:created_at :desc]
                             [:id :desc]]}))
