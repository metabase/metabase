(ns metabase-enterprise.permission-debug.stand-in
  "The hidden stand-in user that a group preview runs as: one per group, a real inactive user of type
  `:permission-preview` in that group and its magic group only, so that every permission check reads real memberships."
  (:require
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.session.core :as session]
   [metabase.settings.core :as setting]
   [metabase.users.models.user :as user]
   [metabase.users.schema :as users.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mu/defn- check-previewable-group! :- [:map [:id ms/PositiveInt] [:is_tenant_group {:optional true} [:maybe :boolean]]]
  "The group with `group-id`, or a 404 when there is none and a 400 with an `:error-code` for a group that can't be
  previewed: Administrators, whose stand-in would become an admin, and All tenant users, which is previewed through a
  tenant's users."
  [group-id :- ms/PositiveInt]
  (let [group (api/check-404 (first (perms/groups-by-ids #{group-id})))]
    (api/check (not= group-id (:id (perms/admin-group)))
               400 {:message    (tru "Admins can''t be previewed: they see everything.")
                    :error-code "preview-target-admin"})
    (api/check (not= group-id (:id (perms/all-external-users-group)))
               400 {:message    (tru "Preview a tenant through one of its users.")
                    :error-code "preview-target-all-tenant-users"})
    group))

(mu/defn- group-tenant-id :- [:maybe ms/PositiveInt]
  "The id of the Tenant that the stand-in user of `group` joins: the most common one of the group's members when it is
  a tenant group, and none otherwise. Throws a 400 for a tenant group that can't have one."
  [{group-id :id tenant-group? :is_tenant_group}]
  (when tenant-group?
    (api/check (and (premium-features/enable-tenants?) (setting/get :use-tenants))
               400 {:message    (tru "Tenants are off, so a tenant group can''t be previewed.")
                    :error-code "preview-target-tenant-unavailable"})
    (let [tenant-id (permission-debug.db/most-common-tenant-id group-id)]
      (api/check tenant-id
                 400 {:message    (tru "A tenant group needs at least one member to be previewed, for its tenant.")
                      :error-code "preview-target-tenant-group-empty"})
      tenant-id)))

(defn- stand-in-email
  "The email that identifies the stand-in user of the group with `group-id`."
  [group-id]
  (format "permission-preview-group-%d@permission-preview.invalid" group-id))

(defn- create-stand-in!
  "Create the stand-in user of the group with `group-id`, in the tenant `tenant-id` if any, and return it."
  [group-id tenant-id]
  (first (user/create-users! [(cond-> {:email      (stand-in-email group-id)
                                       :first_name "Permission preview"
                                       :last_name  (str "group " group-id)
                                       :type       :permission-preview
                                       :is_active  false}
                                tenant-id (assoc :tenant_id tenant-id))])))

(defn- find-or-create-stand-in!
  "The id and tenant id of the stand-in user of the group with `group-id`, created when the group has none."
  [group-id tenant-id]
  (or (permission-debug.db/stand-in (stand-in-email group-id))
      (try
        (create-stand-in! group-id tenant-id)
        ;; two first previews of one group at once: the email is unique, so the one that lost finds the winner's
        (catch Throwable e
          (or (permission-debug.db/stand-in (stand-in-email group-id))
              (throw e))))))

(defn- prepare-stand-in!
  "Make the stand-in user of `group` a member of the group and its magic group only, in `tenant-id`, with `attributes`
  as its login attributes, and return its id. Written as no user, so that no Activity log row records it."
  [{group-id :id} tenant-id attributes]
  (binding [api/*current-user-id* nil]
    (let [{stand-in-id :id stored-tenant-id :tenant_id} (find-or-create-stand-in! group-id tenant-id)
          magic-group (if tenant-id (perms/all-external-users-group) (perms/all-users-group))]
      (user/set-permissions-groups! stand-in-id [magic-group group-id])
      (user/update-users! [(cond-> {:id stand-in-id :login_attributes (or attributes {})}
                             (not= tenant-id stored-tenant-id) (assoc :tenant_id tenant-id))])
      stand-in-id)))

(mu/defn start-group-preview! :- [:map {:closed true}
                                  [:id         ms/PositiveInt]
                                  [:token      :string]
                                  [:expires_at ms/TemporalInstant]
                                  [:user_id    ms/PositiveInt]]
  "Start a preview as the group `group-id` for the admin `admin-user-id`, whose live Session has the hashed key
  `admin-session-key-hash`: find or create the group's stand-in user, write the picked `attributes` to it, replacing
  the ones the last preview of the group wrote, and run `session/start-preview!` as it. Throws a 404 for a group that
  doesn't exist and a 400 with an `:error-code` for one that can't be previewed."
  [{:keys [group-id attributes admin-user-id admin-session-key-hash]}
   :- [:map {:closed true}
       [:group-id               ms/PositiveInt]
       [:attributes             {:optional true} [:maybe users.schema/LoginAttributes]]
       [:admin-user-id          ms/PositiveInt]
       [:admin-session-key-hash :string]]]
  (let [group       (check-previewable-group! group-id)
        tenant-id   (group-tenant-id group)
        stand-in-id (prepare-stand-in! group tenant-id attributes)]
    (assoc (session/start-preview! {:user-id                stand-in-id
                                    :admin-user-id          admin-user-id
                                    :admin-session-key-hash admin-session-key-hash
                                    :stand-in?              true})
           :user_id stand-in-id)))
