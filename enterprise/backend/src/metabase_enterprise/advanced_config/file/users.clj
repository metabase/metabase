(ns metabase-enterprise.advanced-config.file.users
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.db :as advanced-config.db]
   [metabase-enterprise.advanced-config.file.interface
    :as advanced-config.file.i]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.setup.core :as setup]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(s/def :metabase-enterprise.advanced-config.file.users.config-file-spec/first_name
  string?)

(s/def :metabase-enterprise.advanced-config.file.users.config-file-spec/last_name
  string?)

(s/def :metabase-enterprise.advanced-config.file.users.config-file-spec/password
  string?)

(s/def :metabase-enterprise.advanced-config.file.users.config-file-spec/email
  string?)

(s/def ::config-file-spec
  (s/keys :req-un [:metabase-enterprise.advanced-config.file.users.config-file-spec/first_name
                   :metabase-enterprise.advanced-config.file.users.config-file-spec/last_name
                   :metabase-enterprise.advanced-config.file.users.config-file-spec/password
                   :metabase-enterprise.advanced-config.file.users.config-file-spec/email]))

(defmethod advanced-config.file.i/section-spec :users
  [_section]
  (s/spec (s/* ::config-file-spec)))

(defn- select-user
  [email]
  (advanced-config.db/user-columns-by-email (vec (cons :model/User user/admin-or-self-visible-columns)) email))

(defn- init-from-config-file!
  [user]
  ;; the profile write and the password write must land together — initialize! runs no transaction of its own
  (t2/with-transaction [_]
    (let [password (:password user)
          ;; the password is stored only via set-password!; never hand it to the User model
          user     (dissoc user :password)
          user-id  (if-let [existing-user (select-user (:email user))]
                     (do
                       (log/info (u/format-color :blue "Updating User %d" (:id existing-user)))
                       (let [new-user (update user :login_attributes
                                              #(merge % (:login_attributes existing-user)))]
                         (advanced-config.db/update-user! (:id existing-user) new-user))
                       (:id existing-user))
                     ;; create a new user. If they are the first non-internal User, force them to be an admin.
                     (let [user (cond-> user
                                  (not (setup/has-user-setup)) (assoc :is_superuser true))]
                       (log/info (u/colorize :green "Creating the first User for this instance. The first user is always created as an admin."))
                       (log/info (u/colorize :green "Creating new User"))
                       (u/the-id (advanced-config.db/insert-user! user))))]
      ;; passwords live in the AuthIdentity, not on the User row
      (auth-identity/set-password! user-id password))))

(defmethod advanced-config.file.i/initialize-section! :users
  [_section-name users]
  (doseq [user users]
    ;; we're lower-casing emails in :model/User, so we should do the same here
    (init-from-config-file! (update user :email u/lower-case-en))))
