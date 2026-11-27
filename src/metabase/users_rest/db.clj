(ns metabase.users-rest.db
  "Application database queries for the users REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.users.core :as users]
   [metabase.users.models.user :as user]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn users-with-columns
  "The `columns` of the Users matching `filters` (see [[metabase.users.schema/user-filters]])."
  [columns :- [:sequential :keyword]
   filters :- ::users.schema/user-filters]
  (t2/select (into [:model/User] columns) (h2x/assert-map-or-nil! (user/filter-clauses filters))))

(mu/defn user-count
  "The number of Users matching `filters` (see [[metabase.users.schema/user-filters]]), ignoring any `:sort`,
  `:limit`, or `:offset` in `filters`."
  [filters :- ::users.schema/user-filters]
  (t2/count :model/User (h2x/assert-map-or-nil! (users/filter-clauses-without-paging (user/filter-clauses filters)))))

(mu/defn distinct-user-count
  "The `:count` of distinct Users matching `filters` (see [[metabase.users.schema/user-filters]]), ignoring any
  `:sort`, `:limit`, or `:offset` in `filters`."
  [filters :- ::users.schema/user-filters]
  (t2/query (merge {:select [[[:count [:distinct (u/qualified-key (t2/table-name :model/User) :id)]] :count]]
                    :from   (t2/table-name :model/User)}
                   (users/filter-clauses-without-paging (user/filter-clauses filters)))))

(mu/defn user-sso-source
  "The SSO source of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one-fn :sso_source :model/User :id user-id))

(mu/defn has-visible-card?
  "Whether an unarchived, non-internal Card that the user of `user-info` can read exists, optionally narrowed to
  `card-type` (nil for any type)."
  [user-info :- ::permissions.schema/collection-user-info
   card-type :- [:maybe :string]]
  (t2/exists? :model/Card
              {:where (into [:and
                             [:= :archived false]
                             (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/Card) :collection_id) user-info {:root-namespace nil})
                             (mi/non-internal-filter-clause :model/Card (t2/table-name :model/Card))]
                            (when card-type [[:= :type card-type]]))}))

(mu/defn has-visible-dashboard?
  "Whether an unarchived, non-internal Dashboard that the user of `user-info` can read exists."
  [user-info :- ::permissions.schema/collection-user-info]
  (t2/exists? :model/Dashboard
              {:where [:and
                       [:= :archived false]
                       (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/Dashboard) :collection_id) user-info {:root-namespace nil})
                       (mi/non-internal-filter-clause :model/Dashboard (t2/table-name :model/Dashboard))]}))

(mu/defn first-login
  "The timestamp of the earliest LoginHistory of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/LoginHistory :timestamp] :user_id user-id {:order-by [[:timestamp :asc]]}))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil. `dashboard-id` may be nil (e.g. when no custom homepage dashboard is
  configured) or a stale/invalid id (e.g. a deleted custom homepage Dashboard) that matches no Dashboard, in which
  case the result is nil."
  [dashboard-id :- [:maybe :int]]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn other-user-with-email-exists?
  "Whether a User other than `user-id` has an email matching `email` case-insensitively."
  [email   :- :string
   user-id :- ::lib.schema.id/user]
  (t2/exists? :model/User :id [:not= user-id] {:where [:= [:lower :email] (u/lower-case-en email)]}))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id user-id))

(mu/defn personal-user-columns
  "The id, email, name, active flag, SSO source, and tenant id of the personal User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :email :first_name :last_name :is_active :sso_source :tenant_id]
                 :type :personal
                 :id user-id))

(mu/defn active-personal-user-login-columns
  "The id, email, last login, and `sso_source` of the active personal User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :email :last_login :sso_source], :id user-id, :type :personal, :is_active true))

(mu/defn user-active-type-and-sso-source
  "The id, email, active flag, type, and sso_source of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :email :is_active :type :sso_source] :id user-id))

(mu/defn mfa-auth-identity-id-from-hashed-key
  "Fetches the `mfa_auth_identity_id` from the session with the given hashed key"
  [key-hashed :- string?]
  (t2/select-one [:model/Session :mfa_auth_identity_id]
                 :key_hashed key-hashed))
