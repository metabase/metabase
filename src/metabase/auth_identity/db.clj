(ns metabase.auth-identity.db
  "Application database queries for `:model/AuthIdentity`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs an AuthIdentity query itself (model definitions still
  use `toucan2.core`).

  The queries below follow [[::auth-identity-opts]]; queries that do not fit it, and queries for other models this
  namespace also hosts, live in the auth-identity-only section at the bottom of this namespace."
  (:require
   [metabase.auth-identity.schema :as auth-identity.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::auth-identity-filters
  "Which AuthIdentities a query applies to. Keys mirror the columns of `auth_identity`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} ms/PositiveInt]
   [:user_id  {:optional true} ::lib.schema.id/user]
   [:provider {:optional true} :string]])

(mr/def ::auth-identity-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::auth-identity-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::auth-identity.schema/auth-identity.column]]
    [:order-by {:optional true} [:sequential ::auth-identity.schema/auth-identity.column]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/AuthIdentity columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-auth-identity :- [:maybe ::auth-identity.schema/auth-identity.partial]
  "The first AuthIdentity matching `opts`, or nil."
  ([]
   (select-one-auth-identity nil))
  ([{:keys [columns] :as opts} :- [:maybe ::auth-identity-opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn select-one-auth-identity-pk :- [:maybe ms/PositiveInt]
  "The id of the first AuthIdentity matching `opts`, or nil."
  ([]
   (select-one-auth-identity-pk nil))
  ([opts :- [:maybe ::auth-identity-opts]]
   (apply t2/select-one-pk :model/AuthIdentity (->args opts))))

(mu/defn auth-identity-exists? :- :boolean
  "Whether an AuthIdentity matching `opts` exists."
  [opts :- [:maybe ::auth-identity-opts]]
  (apply t2/exists? :model/AuthIdentity (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-auth-identity! :- ::auth-identity.schema/auth-identity
  "Insert the AuthIdentity `row` and return the inserted instance."
  [row :- ::auth-identity.schema/auth-identity.update]
  (t2/insert-returning-instance! :model/AuthIdentity row))

(mu/defn update-auth-identities! :- :int
  "Apply `changes` to every AuthIdentity matching `opts`, returning the number updated."
  [opts    :- [:maybe ::auth-identity-opts]
   changes :- ::auth-identity.schema/auth-identity.update]
  (apply t2/update! :model/AuthIdentity (conj (->kv-args opts) changes)))

(mu/defn delete-auth-identities! :- :int
  "Delete every AuthIdentity matching `opts`, returning the number deleted."
  [opts :- [:maybe ::auth-identity-opts]]
  (apply t2/delete! :model/AuthIdentity (->kv-args opts)))

;;; ------------------------------- Queries used only by the auth-identity module -------------------------------

(mu/defn delete-sessions-for-user!
  "Delete every Session of the User with `user-id`, returning the number deleted. Duplicates
  `metabase.session.db/delete-sessions!`; can't delegate to it because the `session` module already depends
  on `auth-identity`, so the reverse dependency would be a module cycle."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/Session :user_id user-id))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (users.db/select-one-user {:id user-id}))

(mu/defn user-by-email
  "The User whose email matches `email` case-insensitively, or nil."
  [email :- :string]
  (t2/select-one :model/User :%lower.email (u/lower-case-en email)))

(mu/defn user-login-columns
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (users.db/select-one-user {:id user-id :columns [:id :is_active :last_login :tenant_id]}))

(mu/defn user-login-columns-by-email
  "The id, active flag, last login, and tenant id of the User whose email matches `email` case-insensitively, or
  nil."
  [email :- :string]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :%lower.email (u/lower-case-en email)))

(mu/defn user-login-status
  "The id, active flag, and last login of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (users.db/select-one-user {:id user-id :columns [:id :is_active :last_login]}))

(mu/defn user-active?
  "Whether the User with `user-id` is active."
  [user-id :- ::lib.schema.id/user]
  (:is_active (users.db/select-one-user {:id user-id :columns [:is_active]})))

(mu/defn update-user!
  "Apply `changes` to the User with `user-id`, returning the number updated."
  [user-id :- ::lib.schema.id/user
   changes :- ::users.schema/user.update]
  (users.db/update-users! {:id user-id} changes))

(mu/defn insert-user-returning-login-columns!
  "Insert the User `row` and return its id, last login, active flag, and tenant id."
  [row :- ::users.schema/user.create]
  (t2/insert-returning-instance! [:model/User :id :last_login :is_active :tenant_id] row))

(mu/defn insert-session!
  "Insert a Session and return the inserted instance.

  `opts` carries provider-specific extras. The `:saml-*` keys come from a SAML login assertion and
  are stored so single logout can name the session and subject the IdP knows."
  [session-id           :- :string
   user-id              :- ::lib.schema.id/user
   auth-identity-id     :- [:maybe ms/PositiveInt]
   session-key          :- :string
   expires-at           :- [:maybe ms/TemporalInstant]
   mfa-auth-identity-id :- [:maybe ms/PositiveInt]
   opts                 :- [:map {:closed true}
                            [:saml-session-index  {:optional true} [:maybe :string]]
                            [:saml-name-id        {:optional true} [:maybe :string]]
                            [:saml-name-id-format {:optional true} [:maybe :string]]]]
  (t2/insert-returning-instance! :model/Session
                                 ;; Without setting the ID here we can't return an instance on MySQL
                                 :id session-id
                                 :user_id user-id
                                 :auth_identity_id auth-identity-id
                                 :session_key session-key
                                 :expires_at expires-at
                                 :mfa_auth_identity_id mfa-auth-identity-id
                                 :saml_session_index (:saml-session-index opts)
                                 :saml_name_id (:saml-name-id opts)
                                 :saml_name_id_format (:saml-name-id-format opts)))
