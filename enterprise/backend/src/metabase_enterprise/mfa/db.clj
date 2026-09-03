(ns metabase-enterprise.mfa.db
  "Application database queries for the mfa module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions."
  (:require
   [clojure.string :as str]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(def ^:private totp-provider "totp")

(def ^:private confirmed-totp-exists
  ;; enrollment state is the auth_identity.confirmed_at COLUMN (queryable), not the encrypted credentials JSON
  [:exists ^:allow-subquery {:select [1]
                             :from   [:auth_identity]
                             :where  [:and
                                      [:= :auth_identity.user_id :core_user.id]
                                      [:= :auth_identity.provider totp-provider]
                                      [:not= :auth_identity.confirmed_at nil]]}])

(def ^:private unenrolled-user-where
  ;; active personal users without a confirmed TOTP enrollment
  [:and
   [:= :core_user.is_active true]
   [:= :core_user.type "personal"]
   [:not confirmed-totp-exists]])

(def ^:private list-columns
  [:id :email :first_name :last_name :sso_source :is_active :is_superuser])

(def ^:private enrolled-at-select
  ;; a correlated scalar subselect rather than a join: the unique (user_id, provider) constraint guarantees at most
  ;; one row, and joining would force qualifying every selected column, since auth_identity also has
  ;; id/created_at/updated_at
  [[^:allow-subquery {:select [:auth_identity.confirmed_at]
                      :from   [:auth_identity]
                      :where  [:and
                               [:= :auth_identity.user_id :core_user.id]
                               [:= :auth_identity.provider totp-provider]]}
    :enrolled_at]])

(defn- user-list-where
  "Where clause of the admin user lists: enrolled users (deliberately unfiltered beyond the enrollment itself, so
  deactivated users appear and an admin can still remove their enrollment) or unenrolled active personal users,
  optionally narrowed by a name or email `search` the way the People page searches."
  [enrolled? search]
  (cond-> [:and (if enrolled? confirmed-totp-exists unenrolled-user-where)]
    (not (str/blank? search))
    (conj (let [pattern (h2x/like-substring search)]
            ;; `:%lower.x` splits on `.` and so cannot be table-qualified — fine here because neither list query joins.
            [:or
             [:like :%lower.first_name pattern]
             [:like :%lower.last_name  pattern]
             [:like :%lower.email      pattern]]))))

(defn user
  "The User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User :id user-id))

(defn user-email
  "The email of the User with `user-id`."
  [user-id]
  (t2/select-one-fn :email :model/User :id user-id))

(defn lock-user
  "The `:id` row of the User with `user-id`, locked for update."
  [user-id]
  (t2/select-one [:model/User :id] :id user-id {:for :update}))

(defn totp-identity
  "The TOTP AuthIdentity of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider totp-provider))

(defn lock-totp-identity
  "The TOTP AuthIdentity of the User with `user-id`, locked for update, or nil."
  [user-id]
  (t2/select-one :model/AuthIdentity :user_id user-id :provider totp-provider {:for :update}))

(defn password-credentials
  "The password credentials of the User with `user-id`, or nil."
  [user-id]
  (t2/select-one-fn :credentials :model/AuthIdentity :user_id user-id :provider "password"))

(defn insert-auth-identity!
  "Insert the AuthIdentity `row`."
  [row]
  (t2/insert! :model/AuthIdentity row))

(defn update-auth-identity!
  "Apply `changes` to the AuthIdentity with `auth-identity-id`."
  [auth-identity-id changes]
  (t2/update! :model/AuthIdentity auth-identity-id changes))

(defn delete-totp-identity!
  "Delete the TOTP AuthIdentity of the User with `user-id`, returning the number deleted."
  [user-id]
  (t2/delete! :model/AuthIdentity :user_id user-id :provider totp-provider))

(defn confirmed-totp-count
  "The number of confirmed TOTP enrollments."
  []
  (t2/count :model/AuthIdentity :provider totp-provider :confirmed_at [:not= nil]))

(defn unenrolled-user-count
  "The number of active personal Users without a confirmed TOTP enrollment."
  []
  (t2/count :model/User {:where unenrolled-user-where}))

(defn user-list
  "The name-ordered admin list of enrolled (with their enrollment time) or unenrolled Users matching `search`, paged
  by the optional `limit` and `offset`."
  [enrolled? search limit offset]
  (t2/select :model/User
             (cond-> {:select   (cond-> list-columns enrolled? (into enrolled-at-select))
                      :where    (user-list-where enrolled? search)
                      :order-by [[:%lower.first_name :asc]
                                 [:%lower.last_name  :asc]
                                 [:id :asc]]}
               ;; a nil limit would emit `LIMIT NULL`
               limit (assoc :limit limit :offset offset))))

(defn user-list-count
  "The number of enrolled or unenrolled Users matching `search`."
  [enrolled? search]
  (t2/count :model/User {:where (user-list-where enrolled? search)}))
