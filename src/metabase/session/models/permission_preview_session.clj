(ns metabase.session.models.permission-preview-session
  "The state of a read-only preview: an admin running requests as another user with a token of the preview's own. The
  token is no Session key, so no sign-in accepts it."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :as premium-features]
   [metabase.session.db :as session.db]
   [metabase.session.models.session :as models.session]
   [metabase.session.query :as session.query]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PermissionPreviewSession [_model] :permission_preview_session)

(doto :model/PermissionPreviewSession
  (derive :metabase/model))

(def ^:private token-prefix
  "What every preview token starts with. A Session key is a UUID, so a preview token is never one."
  "mbpv_")

(def ^:private lifetime-minutes
  "How long a preview lasts, never renewed. An arbitrary value that can change."
  10)

(defn- expiry-from-now []
  (t/plus (t/offset-date-time) (t/minutes lifetime-minutes)))

(defn- generate-token []
  (str token-prefix (random-uuid)))

(defn- hash-token [token]
  (models.session/hash-session-key token))

(mu/defn- check-previewable-user!
  "Throw a 404 when there is no User with `user-id`, and a 400 with an `:error-code` for each User who can't be
  previewed: an admin, a deactivated user, a user who isn't a person, and a tenant user who can't sign in."
  [user-id :- ::lib.schema.id/user]
  (let [user (api/check-404 (session.db/previewable-user user-id))]
    (api/check (= :personal (keyword (:type user)))
               400 {:message    (tru "Only people can be previewed.")
                    :error-code "preview-target-not-a-person"})
    (api/check (:is_active user)
               400 {:message    (tru "Deactivated users can''t be previewed.")
                    :error-code "preview-target-deactivated"})
    (api/check (not (:is_superuser user))
               400 {:message    (tru "Admins can''t be previewed: they see everything.")
                    :error-code "preview-target-admin"})
    (when-let [tenant-id (:tenant_id user)]
      (api/check (and (premium-features/enable-tenants?)
                      (setting/get :use-tenants)
                      (session.db/tenant-active? tenant-id))
                 400 {:message    (tru "This tenant user can''t sign in, so can''t be previewed.")
                      :error-code "preview-target-tenant-unavailable"}))))

(mu/defn- check-stand-in!
  "Throw a 400 unless the User `user-id` is a stand-in user."
  [user-id :- ::lib.schema.id/user]
  (api/check (= :permission-preview (some-> (session.db/previewable-user user-id) :type keyword))
             400 {:message    (tru "Only a stand-in user can be previewed this way.")
                  :error-code "preview-target-not-a-stand-in"}))

(mu/defn start-preview! :- [:map {:closed true}
                            [:id         ms/PositiveInt]
                            [:token      :string]
                            [:expires_at ms/TemporalInstant]]
  "Start a preview as the User `user-id` for the admin `admin-user-id`, whose live Session has the hashed key
  `admin-session-key-hash`, and return it with its token, which is shown only here. With `stand-in?` the User must be
  a stand-in user, and without it a person."
  [{:keys [user-id admin-user-id admin-session-key-hash stand-in?]} :- [:map {:closed true}
                                                                        [:user-id                ::lib.schema.id/user]
                                                                        [:admin-user-id          ::lib.schema.id/user]
                                                                        [:admin-session-key-hash :string]
                                                                        [:stand-in?              {:optional true} :boolean]]]
  (if stand-in?
    (check-stand-in! user-id)
    (check-previewable-user! user-id))
  (let [admin-session-id (api/check-404 (session.db/live-session-id admin-session-key-hash
                                                                    (session.query/liveness-params)))
        token            (generate-token)
        expires-at       (expiry-from-now)]
    {:id         (session.db/insert-permission-preview-session! {:user_id          user-id
                                                                 :token_hash       (hash-token token)
                                                                 :admin_user_id    admin-user-id
                                                                 :admin_session_id admin-session-id
                                                                 :expires_at       expires-at})
     :token      token
     :expires_at expires-at}))

(mu/defn end-preview! :- ms/IntGreaterThanOrEqualToZero
  "End the preview with `id` if the admin `admin-user-id` started it, and return the number ended."
  [id            :- ms/PositiveInt
   admin-user-id :- ::lib.schema.id/user]
  (session.db/delete-permission-preview-session! id admin-user-id))

(mu/defn preview-user-info
  "The user info of a request that carries the preview token `token`, with `:previewing-admin-id` the admin, or nil
  when there is no such live preview: unknown, expired, its person gone or deactivated, its admin's Session ended, or
  its admin demoted."
  [token :- :string]
  (when (str/starts-with? token token-prefix)
    (some-> (session.db/permission-preview-user-info (hash-token token)
                                                     (session.query/liveness-params)
                                                     (premium-features/enable-advanced-permissions?))
            (update :is-group-manager? boolean)
            (assoc :embedding/auth-method "preview"))))

(defmethod app-db-copy/spec :model/PermissionPreviewSession [_model]
  {:skip? true})
