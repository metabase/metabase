(ns metabase-enterprise.api.session-test
  ;; TODO (Cam 10/30/25) -- Move this somewhere better
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.initialization-status.core :as init-status]
   [metabase.server.middleware.session :as mw.session]
   [metabase.session.core :as session]
   [metabase.session.task.session-cleanup :as session-cleanup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest properties-token-features-test
  (mt/with-premium-features #{:admin-security-center
                              :advanced-permissions
                              :ai-controls
                              :attached-dwh
                              :audit-app
                              :cache-granular-controls
                              :cache-preemptive
                              :config-text-file
                              :content-translation
                              :content-verification
                              :data-apps-preview
                              :data-complexity-score
                              :dashboard-subscription-filters
                              :disable-password-login
                              :database-auth-providers
                              :library
                              :library-retrieval
                              :development-mode
                              :email-allow-list
                              :email-restrict-recipients
                              :embedding
                              :embedding-sdk
                              :embedding-simple
                              :embedding-hub
                              :hosting
                              :metabase-ai-managed
                              :metabot-v3
                              :multi-factor-auth
                              :offer-metabase-ai-managed
                              :no-upsell
                              :official-collections
                              :query-reference-validation
                              :remote-sync
                              :sandboxes
                              :scim
                              :semantic-search
                              :serialization
                              :session-management
                              :session-timeout-config
                              :snippet-collections
                              :sso-google
                              :sso-jwt
                              :sso-ldap
                              :sso-oidc
                              :sso-saml
                              :support-users
                              :transforms-basic
                              :transforms-python
                              :upload-management
                              :whitelabel
                              :collection-cleanup
                              :custom-viz
                              :database-routing
                              :tenants
                              :cloud-custom-smtp
                              :writable-connection}
    (is (= {:admin_security_center          false ;; requires self-hosted (non-cloud)
            :advanced_permissions           true
            :ai_controls                    true
            :attached_dwh                   true
            :audit_app                      true
            :cache_granular_controls        true
            :cache_preemptive               true
            :config_text_file               true
            :content_translation            true
            :content_verification           true
            :data-apps                      true
            :data-complexity-score          true
            :dashboard_subscription_filters true
            :disable_password_login         true
            :database_auth_providers        true
            :library                        true
            :library_retrieval              true
            :development_mode               true
            :email_allow_list               true
            :email_restrict_recipients      true
            :embedding                      true
            :embedding_sdk                  true
            :embedding_simple               true
            :hosting                        true
            :metabase-ai-managed            true
            :metabot-v3                     true
            :multi-factor-auth              true
            :offer-metabase-ai-managed      true
            :official_collections           true
            :query_reference_validation     true
            :remote_sync                    true
            :sandboxes                      true
            :scim                           true
            :semantic_search                true
            :serialization                  true
            :session-management             true
            :session_timeout_config         true
            :snippet_collections            true
            :sso_google                     true
            :sso_jwt                        true
            :sso_ldap                       true
            :sso_oidc                       true
            :sso_saml                       true
            :support-users                  true
            :table_data_editing             false
            :transforms-basic               true
            :transforms-python              true
            :upload_management              true
            :whitelabel                     true
            :collection_cleanup             true
            :custom-viz                     true
            :custom-viz-available           true
            :database_routing               true
            :tenants                        true
            :cloud_custom_smtp              true
            :etl_connections                false
            :etl_connections_pg             false
            :dependencies                   false
            :schema-viewer                  false
            :writable_connection            true}
           (mt/with-temporary-setting-values [csp-img-enabled true
                                              custom-viz-enabled true]
             (:token-features (mt/user-http-request :crowberto :get 200 "session/properties")))))))

(deftest security-center-token-feature-test
  (testing "admin_security_center is true for self-hosted with the feature flag"
    (mt/with-premium-features #{:admin-security-center}
      (is (true? (:admin_security_center
                  (:token-features (mt/user-http-request :crowberto :get 200 "session/properties"))))))))

;;; ---------------------------------------- server-side session timeout tests -----------------------------------------

(deftest session-timeout-enforces-last-active-at-test
  (init-status/set-complete!)
  (mt/with-premium-features #{:session-timeout-config}
    (mt/with-temporary-setting-values [session-timeout {:amount 5 :unit "minutes"}]
      (mt/with-temp [:model/User {user-id :id}]
        (let [session-id  (session/generate-session-id)
              session-key (str (random-uuid))
              key-hashed  (session/hash-session-key session-key)]
          (testing "Session with recent last_active_at should be valid"
            (t2/insert! (t2/table-name :model/Session)
                        {:id session-id :key_hashed key-hashed :user_id user-id :created_at :%now
                         :last_active_at :%now})
            (is (some? (#'mw.session/current-user-info-for-session session-key nil))))
          (testing "Session with last_active_at older than timeout should be expired"
            (t2/query-one {:update (t2/table-name :model/Session)
                           :set    {:last_active_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -301 :second)}
                           :where  [:= :key_hashed key-hashed]})
            (is (nil? (#'mw.session/current-user-info-for-session session-key nil))))
          (testing "Session with last_active_at just within timeout should be valid"
            (t2/query-one {:update (t2/table-name :model/Session)
                           :set    {:last_active_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -299 :second)}
                           :where  [:= :key_hashed key-hashed]})
            (is (some? (#'mw.session/current-user-info-for-session session-key nil)))))))))

(deftest session-timeout-falls-back-to-created-at-test
  (init-status/set-complete!)
  (mt/with-premium-features #{:session-timeout-config}
    (mt/with-temporary-setting-values [session-timeout {:amount 5 :unit "minutes"}]
      (mt/with-temp [:model/User {user-id :id}]
        (let [session-id  (session/generate-session-id)
              session-key (str (random-uuid))
              key-hashed  (session/hash-session-key session-key)]
          (testing "newly created session (NULL last_active_at) should be valid"
            (t2/insert! (t2/table-name :model/Session)
                        {:id session-id :key_hashed key-hashed :user_id user-id :created_at :%now})
            (is (some? (#'mw.session/current-user-info-for-session session-key nil))))
          (testing "old session with NULL last_active_at should be expired"
            (t2/query-one {:update (t2/table-name :model/Session)
                           :set    {:created_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -301 :second)}
                           :where  [:= :key_hashed key-hashed]})
            (is (nil? (#'mw.session/current-user-info-for-session session-key nil)))))))))

(deftest session-activity-update-throttle-test
  (init-status/set-complete!)
  (testing "maybe-update-session-activity! throttles DB writes"
    (mt/with-premium-features #{:session-timeout-config}
      (mt/with-temporary-setting-values [session-timeout {:amount 30 :unit "minutes"}]
        (mt/with-temp [:model/User {user-id :id}]
          (let [session-id  (session/generate-session-id)
                session-key (str (random-uuid))
                key-hashed  (session/hash-session-key session-key)]
            (session/clear-session-activity-cache!)
            (t2/insert! (t2/table-name :model/Session)
                        {:id session-id :key_hashed key-hashed :user_id user-id :created_at :%now})
            (testing "first call should update last_active_at"
              (#'mw.session/maybe-update-session-activity! key-hashed)
              (is (some? (t2/select-one-fn :last_active_at (t2/table-name :model/Session) :key_hashed key-hashed))))
            (testing "immediate second call should be throttled (no error, just skipped)"
              (let [first-value (t2/select-one-fn :last_active_at (t2/table-name :model/Session) :key_hashed key-hashed)]
                (#'mw.session/maybe-update-session-activity! key-hashed)
                (is (= first-value
                       (t2/select-one-fn :last_active_at (t2/table-name :model/Session) :key_hashed key-hashed)))))))))))

;;; ---------------------------------------- session cleanup idle sessions test ----------------------------------------

(deftest cleanup-idle-sessions-test
  (testing "With session-timeout configured, idle sessions are recorded as timed out by the sweep"
    (mt/with-premium-features #{:session-timeout-config}
      (mt/with-temporary-setting-values [session-timeout {:amount 5 :unit "minutes"}]
        (mt/with-temp [:model/User {user-id :id}]
          (let [active-id   (session/generate-session-id)
                active-key  (session/hash-session-key (str (random-uuid)))
                idle-id     (session/generate-session-id)
                idle-cookie (session/generate-session-key)
                idle-key    (session/hash-session-key idle-cookie)
                no-activity-id (session/generate-session-id)
                no-activity-key (session/hash-session-key (str (random-uuid)))]
            ;; Active session: last_active_at = now
            (t2/insert! (t2/table-name :model/Session)
                        {:id active-id :key_hashed active-key :user_id user-id
                         :created_at :%now :last_active_at :%now})
            ;; Idle session: last_active_at = 10 minutes ago
            (t2/insert! (t2/table-name :model/Session)
                        {:id idle-id :key_hashed idle-key :user_id user-id
                         :created_at :%now
                         :last_active_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -600 :second)})
            ;; Session with no activity tracking (NULL last_active_at), created recently
            (t2/insert! (t2/table-name :model/Session)
                        {:id no-activity-id :key_hashed no-activity-key :user_id user-id
                         :created_at :%now})
            (#'session-cleanup/cleanup-sessions!)
            (testing "active session is kept live"
              (is (nil? (t2/select-one-fn :ended_at :model/Session :id active-id))))
            (testing "idle session is recorded as timed out, its key destroyed, and the row kept"
              (is (=? {:end_reason "timed-out", :ended_at some?, :ended_by_user_id nil, :key_hashed nil}
                      (t2/select-one :model/Session :id idle-id))))
            (testing "session with NULL last_active_at but recent created_at is kept live"
              (is (nil? (t2/select-one-fn :ended_at :model/Session :id no-activity-id))))
            (testing "raising the idle timeout afterwards does not revive the timed-out session"
              (mt/with-temporary-setting-values [session-timeout {:amount 1 :unit "hours"}]
                (is (= "Unauthenticated" (mt/client idle-cookie :get 401 "user/current")))))))))))

(deftest cleanup-tenant-deactivated-sessions-test
  (testing "the sweep records a session of a deactivated tenant's user as tenant-deactivated"
    (mt/with-additional-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id}  {:name "SM41 T1" :slug "sm41-t1" :is_active true}
                       :model/User   {external :id}   {:tenant_id tenant-id}
                       :model/User   {internal :id}   {}]
          (let [session! (fn [user-id]
                           (let [id (session/generate-session-id)]
                             (t2/insert! (t2/table-name :model/Session)
                                         {:id         id
                                          :key_hashed (session/hash-session-key (str (random-uuid)))
                                          :user_id    user-id
                                          :created_at :%now})
                             id))
                ended    (fn [session-id]
                           (select-keys (t2/select-one :model/Session :id session-id)
                                        [:end_reason :ended_by_user_id :key_hashed]))
                external-session (session! external)
                internal-session (session! internal)]
            (t2/update! (t2/table-name :model/Tenant) tenant-id {:is_active false})
            (#'session-cleanup/cleanup-sessions!)
            (is (= {:end_reason "tenant-deactivated", :ended_by_user_id nil, :key_hashed nil}
                   (ended external-session)))
            (is (nil? (:end_reason (ended internal-session)))
                "a user without a tenant is unaffected")
            (testing "with tenants switched off, a user with any tenant at all is not live"
              (t2/update! (t2/table-name :model/Tenant) tenant-id {:is_active true})
              (mt/with-temporary-setting-values [use-tenants false]
                ;; switching tenants off deactivates their users, and that deactivation ends their sessions on the
                ;; spot; reactivate through the raw table and start a fresh session, so that the tenant predicate
                ;; is the only thing rejecting it
                (t2/update! (t2/table-name :model/User) external {:is_active true})
                (let [another (session! external)]
                  (#'session-cleanup/cleanup-sessions!)
                  (is (= "tenant-deactivated" (:end_reason (ended another)))))))))))))
