(ns metabase-enterprise.advanced-config.file.users
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.file.interface
    :as advanced-config.file.i]
   [metabase.models.user :refer [User]]
   [metabase.setup :as setup]
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


(defn- init-from-config-file!
  [user]
  (if-let [existing-user-id (t2/select-one-pk User :email (:email user))]
    (do
      (log/info (u/format-color :blue "Updating User with email %s" (pr-str (:email user))))
      (t2/update! User existing-user-id user))
    ;; create a new user. If they are the first non-internal User, force them to be an admin.
    (let [user (cond-> user
                 (not (setup/has-user-setup)) (assoc :is_superuser true))]
      (log/info (u/colorize :green "Creating the first User for this instance. The first user is always created as an admin."))
      (log/info (u/format-color :green
                                "Creating new User %s with email %s"
                                (pr-str (str (:first_name user) \space (:last_name user)))
                                (pr-str (:email user))))
      (t2/insert! User user))))

(defmethod advanced-config.file.i/initialize-section! :users
  [_section-name users]
  (doseq [user users]
    (init-from-config-file! user)))
