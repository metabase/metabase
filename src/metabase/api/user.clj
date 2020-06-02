(ns metabase.api.user
  "/api/user endpoints"
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [DELETE GET POST PUT]]
            [honeysql.helpers :as hh]
            [metabase.api
             [common :as api]
             [session :as session-api]]
            [metabase.email.messages :as email]
            [metabase.integrations.ldap :as ldap]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [permissions-group :as group]
             [user :as user :refer [User]]]
            [metabase.util :as u]
            [metabase.util
             [i18n :as i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(defn- check-self-or-superuser
  "Check that `user-id` is *current-user-id*` or that `*current-user*` is a superuser, or throw a 403."
  [user-id]
  {:pre [(integer? user-id)]}
  (api/check-403
   (or
    (= user-id api/*current-user-id*)
    api/*is-superuser?*)))

(defn- fetch-user [& query-criteria]
  (apply db/select-one (vec (cons User user/admin-or-self-visible-columns)) query-criteria))

(defn- maybe-set-user-permissions-groups! [user-or-id new-groups-or-ids & [is-superuser?]]
  ;; if someone passed in both `:is_superuser` and `:group_ids`, make sure the whether the admin group is in group_ids
  ;; agrees with is_superuser -- don't want to have ambiguous behavior
  (when (and (some? is-superuser?)
             new-groups-or-ids)
    (api/checkp (= is-superuser? (contains? (set new-groups-or-ids) (u/get-id (group/admin))))
      "is_superuser" (tru "Value of is_superuser must correspond to presence of Admin group ID in group_ids.")))
  (when (some? new-groups-or-ids)
    (when-not (= (user/group-ids user-or-id)
                 (set (map u/get-id new-groups-or-ids)))
      (api/check-superuser)
      (user/set-permissions-groups! user-or-id new-groups-or-ids))))

(defn- updated-user-name [user-before-update first_name last_name]
  (let [prev_first_name (:first_name user-before-update)
        prev_last_name  (:last_name user-before-update)
        first_name      (or first_name prev_first_name)
        last_name       (or last_name prev_last_name)]
    (when (or (not= first_name prev_first_name)
              (not= last_name prev_last_name))
      [first_name last_name])))

(defn- maybe-update-user-personal-collection-name! [user-before-update first_name last_name]
  ;; If the user name is updated, we shall also update the personal collection name (if such collection exists).
  (when-some [[first_name last_name] (updated-user-name user-before-update first_name last_name)]
    (when-some [collection (collection/user->existing-personal-collection (u/get-id user-before-update))]
      (let [new-collection-name (collection/format-personal-collection-name first_name last_name)]
        (when-not (= new-collection-name (:name collection))
          (db/update! Collection (:id collection) :name new-collection-name))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                   Fetching Users -- GET /api/user, GET /api/user/current, GET /api/user/:id                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(api/defendpoint GET "/"
  "Fetch a list of `Users` for the admin People page or for Pulses. By default returns only active users. If
  `include_deactivated` is true, return all Users (active and inactive). (Using `include_deactivated` requires
  superuser permissions.)"
  [include_deactivated]
  {include_deactivated (s/maybe su/BooleanString)}
  (when include_deactivated
    (api/check-superuser))
  (cond-> (db/select (vec (cons User (if api/*is-superuser?*
                                       user/admin-or-self-visible-columns
                                       user/non-admin-or-self-visible-columns)))
            (-> {}
                (hh/merge-order-by [:%lower.last_name :asc] [:%lower.first_name :asc])
                (hh/merge-where (when-not include_deactivated
                                  [:= :is_active true]))))
    ;; For admins, also include the IDs of the  Users' Personal Collections
    api/*is-superuser?* (hydrate :personal_collection_id :group_ids)))

(api/defendpoint GET "/current"
  "Fetch the current `User`."
  []
  (-> (api/check-404 @api/*current-user*)
      (hydrate :personal_collection_id :group_ids)))

(api/defendpoint GET "/:id"
  "Fetch a `User`. You must be fetching yourself *or* be a superuser."
  [id]
  (check-self-or-superuser id)
  (-> (api/check-404 (fetch-user :id id, :is_active true))
      (hydrate :group_ids)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Creating a new User -- POST /api/user                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(api/defendpoint POST "/"
  "Create a new `User`, return a 400 if the email address is already taken"
  [:as {{:keys [first_name last_name email password group_ids login_attributes] :as body} :body}]
  {first_name       su/NonBlankString
   last_name        su/NonBlankString
   email            su/Email
   group_ids        (s/maybe [su/IntGreaterThanZero])
   login_attributes (s/maybe user/LoginAttributes)}
  (api/check-superuser)
  (api/checkp (not (db/exists? User :email email))
    "email" (tru "Email address already in use."))
  (db/transaction
    (let [new-user-id (u/get-id (user/create-and-invite-user!
                                 (u/select-keys-when body
                                   :non-nil [:first_name :last_name :email :password :login_attributes])
                                 @api/*current-user*))]
      (maybe-set-user-permissions-groups! new-user-id group_ids)
      (-> (fetch-user :id new-user-id)
          (hydrate :group_ids)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Updating a User -- PUT /api/user/:id                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- valid-email-update?
  "This predicate tests whether or not the user is allowed to update the email address associated with this account."
  [{:keys [google_auth ldap_auth email]} maybe-new-email]
  (or
   ;; Admin users can update
   api/*is-superuser?*
   ;; If the email address didn't change, let it through
   (= email maybe-new-email)
   ;; We should not allow a regular user to change their email address if they are a google/ldap user
   (and
    (not google_auth)
    (not ldap_auth))))

(api/defendpoint PUT "/:id"
  "Update an existing, active `User`."
  [id :as {{:keys [email first_name last_name group_ids is_superuser login_attributes locale] :as body} :body}]
  {email            (s/maybe su/Email)
   first_name       (s/maybe su/NonBlankString)
   last_name        (s/maybe su/NonBlankString)
   group_ids        (s/maybe [su/IntGreaterThanZero])
   is_superuser     (s/maybe s/Bool)
   login_attributes (s/maybe user/LoginAttributes)
   locale           (s/maybe su/ValidLocale)}
  (check-self-or-superuser id)
  ;; only allow updates if the specified account is active
  (api/let-404 [user-before-update (fetch-user :id id, :is_active true)]
    ;; Google/LDAP non-admin users can't change their email to prevent account hijacking
    (api/check-403 (valid-email-update? user-before-update email))
    ;; can't change email if it's already taken BY ANOTHER ACCOUNT
    (api/checkp (not (db/exists? User, :email email, :id [:not= id]))
      "email" (tru "Email address already associated to another user."))
    (db/transaction
      (api/check-500
       (db/update! User id
         (u/select-keys-when body
           :present (into #{:locale} (when api/*is-superuser?* [:login_attributes]))
           :non-nil (set (concat [:first_name :last_name :email]
                                 (when api/*is-superuser?*
                                   [:is_superuser]))))))
      (maybe-set-user-permissions-groups! id group_ids is_superuser)
      (maybe-update-user-personal-collection-name! user-before-update first_name last_name)))
  (-> (fetch-user :id id)
      (hydrate :group_ids)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Reactivating a User -- PUT /api/user/:id/reactivate                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- reactivate-user! [existing-user]
  (db/update! User (u/get-id existing-user)
    :is_active     true
    :is_superuser  false
    ;; if the user orignally logged in via Google Auth and it's no longer enabled, convert them into a regular user
    ;; (see Issue #3323)
    :google_auth   (boolean (and (:google_auth existing-user)
                                 ;; if google-auth-client-id is set it means Google Auth is enabled
                                 (session-api/google-auth-client-id)))
    :ldap_auth     (boolean (and (:ldap_auth existing-user)
                                 (ldap/ldap-configured?))))
  ;; now return the existing user whether they were originally active or not
  (fetch-user :id (u/get-id existing-user)))

(api/defendpoint PUT "/:id/reactivate"
  "Reactivate user at `:id`"
  [id]
  (api/check-superuser)
  (let [user (db/select-one [User :id :is_active :google_auth :ldap_auth] :id id)]
    (api/check-404 user)
    ;; Can only reactivate inactive users
    (api/check (not (:is_active user))
      [400 {:message (tru "Not able to reactivate an active user")}])
    (reactivate-user! user)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               Updating a Password -- PUT /api/user/:id/password                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(api/defendpoint PUT "/:id/password"
  "Update a user's password."
  [id :as {{:keys [password old_password]} :body}]
  {password su/ComplexPassword}
  (check-self-or-superuser id)
  (api/let-404 [user (db/select-one [User :password_salt :password], :id id, :is_active true)]
    ;; admins are allowed to reset anyone's password (in the admin people list) so no need to check the value of
    ;; `old_password` for them regular users have to know their password, however
    (when-not api/*is-superuser?*
      (api/checkp (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user))
        "old_password"
        (tru "Invalid password"))))
  (user/set-password! id password)
  ;; return the updated User
  (fetch-user :id id))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Deleting (Deactivating) a User -- DELETE /api/user/:id                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(api/defendpoint DELETE "/:id"
  "Disable a `User`.  This does not remove the `User` from the DB, but instead disables their account."
  [id]
  (api/check-superuser)
  (api/check-500 (db/update! User id, :is_active false))
  {:success true})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  Other Endpoints -- PUT /api/user/:id/qpnewb, POST /api/user/:id/send_invite                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - This could be handled by PUT /api/user/:id, we don't need a separate endpoint
(api/defendpoint PUT "/:id/qbnewb"
  "Indicate that a user has been informed about the vast intricacies of 'the' Query Builder."
  [id]
  (check-self-or-superuser id)
  (api/check-500 (db/update! User id, :is_qbnewb false))
  {:success true})

(api/defendpoint POST "/:id/send_invite"
  "Resend the user invite email for a given user."
  [id]
  (api/check-superuser)
  (when-let [user (User :id id, :is_active true)]
    (let [reset-token (user/set-password-reset-token! id)
          ;; NOTE: the new user join url is just a password reset with an indicator that this is a first time user
          join-url    (str (user/form-password-reset-url reset-token) "#new")]
      (email/send-new-user-email! user @api/*current-user* join-url)))
  {:success true})


(api/define-routes)
