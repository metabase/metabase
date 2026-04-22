(ns metabase-enterprise.advanced-config.file.users
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.file.interface
    :as advanced-config.file.i]
   [metabase.permissions.core :as perms]
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

(s/def :metabase-enterprise.advanced-config.file.users.config-file-spec/groups
  (s/coll-of string?))

(s/def ::config-file-spec
  (s/keys :req-un [:metabase-enterprise.advanced-config.file.users.config-file-spec/first_name
                   :metabase-enterprise.advanced-config.file.users.config-file-spec/last_name
                   :metabase-enterprise.advanced-config.file.users.config-file-spec/password
                   :metabase-enterprise.advanced-config.file.users.config-file-spec/email]
          :opt-un [:metabase-enterprise.advanced-config.file.users.config-file-spec/groups]))

(defmethod advanced-config.file.i/section-spec :users
  [_section]
  (s/spec (s/* ::config-file-spec)))

(defn- select-user
  [email]
  (t2/select-one (vec (cons :model/User user/admin-or-self-visible-columns)) :email email))

(defn- resolve-group-id
  "Resolve a group name to an ID. Recognizes the Data Analysts magic group by name,
  then falls back to finding or creating a custom group by name."
  [group-name]
  (let [lower-name (u/lower-case-en group-name)]
    (or (when (= lower-name "data analysts")
          (:id (perms/data-analyst-group)))
        (when-let [group (t2/select-one :model/PermissionsGroup :%lower.name lower-name)]
          (:id group))
        (do
          (log/info (u/format-color :green "Creating new permissions group %s" (pr-str group-name)))
          (u/the-id (first (t2/insert-returning-instances! :model/PermissionsGroup {:name group-name})))))))

(defn- set-user-groups!
  "Set a user's group memberships based on the config file `groups` list. The Data Analysts magic group is
  recognized by name; all other names are looked up or created as custom groups."
  [user-id group-names]
  (let [group-ids    (into #{(:id (perms/all-users-group))}
                           (map resolve-group-id)
                           group-names)
        group-id-set (set (map (fn [id] {:id id}) group-ids))]
    (log/info (u/format-color :blue "Setting groups for user %d: %s" user-id (pr-str group-names)))
    (user/set-permissions-groups! user-id group-id-set)))

(defn- init-from-config-file!
  [user]
  (let [groups (:groups user)
        user   (dissoc user :groups)]
    (if-let [existing-user (select-user (:email user))]
      (do
        (log/info (u/format-color :blue "Updating User with email %s" (pr-str (:email user))))
        (let [new-user (update user :login_attributes
                               #(merge % (:login_attributes existing-user)))]
          (t2/update! :model/User (:id existing-user) new-user))
        (when (some? groups)
          (set-user-groups! (:id existing-user) groups)))
      ;; create a new user. If they are the first non-internal User, force them to be an admin.
      (let [user (cond-> user
                   (not (setup/has-user-setup)) (assoc :is_superuser true))]
        (log/info (u/colorize :green "Creating the first User for this instance. The first user is always created as an admin."))
        (log/info (u/format-color :green
                                  "Creating new User %s with email %s"
                                  (pr-str (str (:first_name user) \space (:last_name user)))
                                  (pr-str (:email user))))
        (t2/insert! :model/User user)
        (when (some? groups)
          (let [created-user (t2/select-one :model/User :email (:email user))]
            (set-user-groups! (:id created-user) groups)))))))

(defmethod advanced-config.file.i/initialize-section! :users
  [_section-name users]
  (doseq [user users]
    ;; we're lower-casing emails in :model/User, so we should do the same here
    (init-from-config-file! (update user :email u/lower-case-en))))
