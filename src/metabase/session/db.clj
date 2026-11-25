(ns metabase.session.db
  "Application database queries for the session module, so that no other namespace in the module runs a query itself
  (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.db :as auth-identity.db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.session.query :as session.query]
   [metabase.session.schema :as session.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn insert-session! :- ::session.schema/session
  "Insert the Session `row` and return the inserted instance."
  [{:keys [id user_id auth_identity_id session_key expires_at mfa_auth_identity_id
           saml_session_index saml_name_id saml_name_id_format]} :- ::session.schema/session.create]
  (when-not (string? id)
    (throw (ex-info "id must be a string" {:id id})))
  (when-not (string? session_key)
    (throw (ex-info "session_key must be a string" {:session_key session_key})))
  (when-not (or (nil? expires_at) (instance? java.time.temporal.Temporal expires_at))
    (throw (ex-info "expires_at must be a temporal value" {:expires_at expires_at})))
  (when-not (every? #(or (nil? %) (string? %)) [saml_session_index saml_name_id saml_name_id_format])
    (throw (ex-info "SAML values must be strings" {:saml_session_index  saml_session_index
                                                   :saml_name_id        saml_name_id
                                                   :saml_name_id_format saml_name_id_format})))
  ;; `:id` and `:session_key` stay unmarked: the before-insert hook checks the id is not a UUID and hashes the key,
  ;; and both need the plain string. The key itself never reaches SQL, only its hash.
  (t2/insert-returning-instance! :model/Session
                                 ;; Without setting the ID here we can't return an instance on MySQL
                                 :id id
                                 :user_id (long user_id)
                                 :auth_identity_id (some-> auth_identity_id long)
                                 :session_key session_key
                                 :expires_at expires_at
                                 :mfa_auth_identity_id (some-> mfa_auth_identity_id long)
                                 :saml_session_index saml_session_index
                                 :saml_name_id saml_name_id
                                 :saml_name_id_format saml_name_id_format))

(mu/defn mcp-session
  "The `core_session` row with `key-hashed` of the User with `user-id`, or nil."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (when-not (string? key-hashed)
    (throw (ex-info "key-hashed must be a string" {:key-hashed key-hashed})))
  (t2/select-one (t2/table-name :model/Session) :key_hashed key-hashed :user_id user-id))

(mu/defn insert-mcp-session!
  "Insert the MCP-backed `core_session` `row` into the table rather than through `:model/Session`, so that it gets no
  model defaults, and return it as stored."
  [row :- [:map {:closed true}
           [:id               :string]
           [:key_hashed       :string]
           [:user_id          ::lib.schema.id/user]
           [:anti_csrf_token  :nil]
           [:auth_identity_id ms/PositiveInt]
           [:created_at       :keyword]]]
  (t2/insert-returning-instance! (t2/table-name :model/Session) row))

(defn- session-ending
  "The columns that record the ending of a Session with `reason` by `ended-by`, clearing its key."
  [reason ended-by]
  {:ended_at         :%now
   :end_reason       reason
   :ended_by_user_id ended-by
   :key_hashed       nil})

(mu/defn end-sessions! :- ms/IntGreaterThanOrEqualToZero
  "Record that every live Session with `ids` has ended with `reason`, ended by `ended-by` (a User id, or `:user_id` for
  the session's own user), clearing its key. Returns the number ended."
  [ids      :- [:sequential {:min 1} :string]
   reason   :- ::session.schema/end-reason
   ended-by :- [:maybe [:or ::lib.schema.id/user [:= :user_id]]]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Session :id [:in %] :ended_at nil (session-ending reason ended-by)) ids))

(mu/defn end-sessions-for-users! :- ms/IntGreaterThanOrEqualToZero
  "Record that every live Session of the Users with `user-ids` has ended with `reason`, ended by `ended-by`, clearing
  its key, and return the number ended."
  [user-ids :- [:sequential {:min 1} ::lib.schema.id/user]
   reason   :- ::session.schema/end-reason
   ended-by :- [:maybe [:or ::lib.schema.id/user [:= :user_id]]]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Session :user_id [:in %] :ended_at nil
                                                          (session-ending reason ended-by)) user-ids))

(mu/defn end-session-for-key! :- ms/IntGreaterThanOrEqualToZero
  "Record that the live Session with `key-hashed` has ended with `reason`, ended by `ended-by`, clearing its key, and
  return the number ended."
  [key-hashed :- :string
   reason     :- ::session.schema/end-reason
   ended-by   :- [:maybe [:or ::lib.schema.id/user [:= :user_id]]]]
  (when-not (string? key-hashed)
    (throw (ex-info "key-hashed must be a string" {:key-hashed key-hashed})))
  (t2/update! :model/Session :key_hashed key-hashed :ended_at nil (session-ending reason ended-by)))

(mu/defn delete-session-of-user!
  "Delete the `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed :- :string
   user-id    :- ::lib.schema.id/user]
  (when-not (string? key-hashed)
    (throw (ex-info "key-hashed must be a string" {:key-hashed key-hashed})))
  (t2/query {:delete-from (t2/table-name :model/Session)
             :where       [:and
                           [:= :key_hashed key-hashed]
                           [:= :user_id user-id]]}))

(mu/defn touch-session!
  "Set `last_active_at` of the Session with `key-hashed` to now, writing the table rather than `:model/Session`, whose
  update hook allows only the columns that record an ending."
  [key-hashed :- :string]
  (when-not (string? key-hashed)
    (throw (ex-info "key-hashed must be a string" {:key-hashed key-hashed})))
  (t2/query-one {:update (t2/table-name :model/Session)
                 :set    {:last_active_at :%now}
                 :where  [:= :key_hashed key-hashed]}))

(mu/defn sessions-with-unrecorded-ending :- [:sequential [:map {:closed true}
                                                          [:id     :string]
                                                          [:reason ::session.schema/end-reason]]]
  "The id of every session that is no longer live but has no `ended_at` yet, with the reason the nightly sweep should
  record: the user's or tenant's deactivation first, then expiry (its own `expires_at` or `max-session-age`), then
  the idle timeout. MCP-backed rows are not sessions and are never included."
  [liveness :- ::session.schema/liveness-params]
  (let [predicates  (session.query/liveness-predicates liveness)
        ;; a not-live row fails at least one of these, so the CASE always resolves; `:else` names the last one
        reason-expr (cond-> [:case
                             [:not (:user-active predicates)]   [:literal "user-deactivated"]
                             [:not (:tenant-active predicates)] [:literal "tenant-deactivated"]]
                      (:not-timed-out predicates)
                      (conj [:not (:not-expired predicates)] [:literal "expired"]
                            :else [:literal "timed-out"])

                      (not (:not-timed-out predicates))
                      (conj :else [:literal "expired"]))]
    (t2/query (merge (session.query/session-from-and-joins)
                     {:select [[:session.id :id]
                               [reason-expr :reason]]
                      :where  [:and
                               (:not-ended predicates)
                               (:not-mcp predicates)
                               [:not (into [:and] (keep predicates)
                                           [:user-active :tenant-active :not-expired :not-timed-out])]]}))))

(mu/defn delete-sessions-for-cleanup! :- ms/IntGreaterThanOrEqualToZero
  "Delete the Sessions whose recorded ending is before `cutoff`, which leaves every live session whatever its age, and
  return the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/Session :ended_at [:< cutoff]))

(mu/defn delete-sessions-for-mcp-cleanup! :- ms/IntGreaterThanOrEqualToZero
  "Delete the MCP-backed `core_session` rows, which are no sessions and so are not kept on record like an ended one
  (see [[sessions-with-unrecorded-ending]]), that are older than `max-age-minutes`, past their own `expires_at`, or
  idle longer than `idle-timeout-seconds` when it is given, and return the number deleted."
  [max-age-minutes      :- ms/PositiveInt
   idle-timeout-seconds :- [:maybe ms/PositiveInt]]
  (let [now            [:current-timestamp]
        oldest-allowed [:date-add now (- max-age-minutes) :minute]
        timeout-oldest (when idle-timeout-seconds
                         [:date-add now (- idle-timeout-seconds) :second])
        hsql           {:delete-from [(t2/table-name :model/Session)]
                        :where       [:and
                                      [:in :auth_identity_id ^:allow-subquery
                                       {:select [:id]
                                        :from   [(t2/table-name :model/AuthIdentity)]
                                        :where  [:= :provider [:literal session.query/mcp-provider]]}]
                                      (cond-> [:or
                                               [:< :created_at oldest-allowed]
                                               [:and [:not= :expires_at nil] [:< :expires_at now]]]
                                        timeout-oldest
                                        (conj [:< [:coalesce :last_active_at :created_at] timeout-oldest]))]}]
    (tracing/with-span :tasks "task.session-cleanup.delete" {:db/statement (tracing/best-effort-sanitize-sql hsql)}
      (t2/query-one hsql))))

(mu/defn auth-identity-for-provider
  "The AuthIdentity of the User with `user-id` at `provider`, or nil. See `metabase.auth-identity.db/auth-identity`,
  which owns the AuthIdentity table."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (auth-identity.db/auth-identity user-id provider))

(mu/defn auth-identity-exists?
  "Whether the User with `user-id` has an AuthIdentity at `provider`."
  [user-id  :- ::lib.schema.id/user
   provider :- :string]
  (auth-identity.db/auth-identity-exists? user-id provider))

(mu/defn auth-identity-provider
  "The `:provider` of the AuthIdentity with `auth-identity-id`, or nil."
  [auth-identity-id :- ms/PositiveInt]
  (t2/select-one [:model/AuthIdentity :provider] :id auth-identity-id))

(mu/defn user-by-email
  "The id, SSO source, and active flag of the User whose email matches `email` case-insensitively, or nil."
  [email :- :string]
  (when-not (string? email)
    (throw (ex-info "email must be a string" {:email email})))
  (t2/select-one [:model/User :id :sso_source :is_active] :%lower.email (u/lower-case-en email)))

(mu/defn user
  "The User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id user-id))

(mu/defn user-sso-source
  "The `sso_source` of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (when-not (pos-int? user-id)
    (throw (ex-info "user-id must be a positive integer" {:user-id user-id})))
  (t2/select-one-fn :sso_source :model/User :id user-id))

(mu/defn user-login-status
  "The id, active flag, last login, and tenant id of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :last_login :tenant_id] :id user-id))

;;; ------------------------------------------------- Permission previews --------------------------------------------

(mu/defn live-session-id
  "The id of the live Session with `key-hashed`, or nil."
  [key-hashed :- :string
   liveness   :- ::session.schema/liveness-params]
  (:id (t2/query-one (merge session.query/session-from-and-joins
                            {:select [:session.id]
                             :where  (into [:and [:= :session.key_hashed key-hashed]]
                                           (session.query/live-session-conditions liveness))
                             :limit  [:inline 1]}))))

(mu/defn previewable-user
  "The facts about the User with `user-id` that decide whether an admin may preview as them, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :is_active :is_superuser :type :tenant_id] :id user-id))

(mu/defn tenant-active?
  "Whether the Tenant with `tenant-id` is active."
  [tenant-id :- ms/PositiveInt]
  (boolean (t2/select-one-fn :is_active :tenant :id tenant-id)))

(mu/defn insert-permission-preview-session! :- ms/PositiveInt
  "Insert the row of a preview and return its id."
  [row :- [:map {:closed true}
           [:user_id          ::lib.schema.id/user]
           [:token_hash       :string]
           [:admin_user_id    ::lib.schema.id/user]
           [:admin_session_id :string]
           [:expires_at       ms/TemporalInstant]]]
  (t2/insert-returning-pk! :model/PermissionPreviewSession row))

(mu/defn delete-permission-preview-session! :- ms/IntGreaterThanOrEqualToZero
  "Delete the preview with `id` if the admin with `admin-user-id` started it, and return the number deleted."
  [id            :- ms/PositiveInt
   admin-user-id :- ::lib.schema.id/user]
  (t2/delete! :model/PermissionPreviewSession :id id :admin_user_id admin-user-id))

(mu/defn permission-preview-user-info
  "The person and the admin of the preview with `token-hash`, or nil when there is none, it has expired, its person is
  no longer an active non-admin user (a stand-in user is never active), its admin's Session is no longer live, or its
  admin is no longer an admin. The person's fields are the ones a Session's lookup returns."
  [token-hash                   :- :string
   liveness                     :- ::session.schema/liveness-params
   enable-advanced-permissions? :- :boolean]
  (let [now (h2x/current-datetime-honeysql-form (:db-type liveness))]
    (t2/query-one
     (cond-> {:select    [[:person.id :metabase-user-id]
                          [:person.is_superuser :is-superuser?]
                          [:person.is_data_analyst :is-data-analyst?]
                          [:person.locale :user-locale]
                          [:preview.admin_user_id :previewing-admin-id]]
              :from      [[:core_session :session]]
              :join      [[:permission_preview_session :preview] [:= :preview.admin_session_id :session.id]]
              :left-join (into session.query/session-left-joins
                               [[:core_user :person] [:= :person.id :preview.user_id]])
              :where     (into [:and
                                [:= :preview.token_hash token-hash]
                                [:> :preview.expires_at now]
                                ;; a stand-in user is inactive by design
                                [:or
                                 [:= :person.is_active true]
                                 [:= :person.type "permission-preview"]]
                                [:= :person.is_superuser false]
                                [:= :user.is_superuser true]]
                               (session.query/live-session-conditions liveness))
              :limit     [:inline 1]}
       enable-advanced-permissions?
       (-> (sql.helpers/select [:pgm.is_group_manager :is-group-manager?])
           (sql.helpers/left-join [:permissions_group_membership :pgm]
                                  [:and
                                   [:= :pgm.user_id :person.id]
                                   [:is :pgm.is_group_manager true]]))))))
