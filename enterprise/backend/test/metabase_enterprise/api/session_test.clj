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
                              :dashboard-subscription-filters
                              :disable-password-login
                              :database-auth-providers
                              :library
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
                              :offer-metabase-ai-managed
                              :no-upsell
                              :official-collections
                              :query-reference-validation
                              :remote-sync
                              :sandboxes
                              :scim
                              :semantic-search
                              :serialization
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
                              :workspaces
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
            :dashboard_subscription_filters true
            :disable_password_login         true
            :database_auth_providers        true
            :library                        true
            :development_mode               true
            :email_allow_list               true
            :email_restrict_recipients      true
            :embedding                      true
            :embedding_sdk                  true
            :embedding_simple               true
            :hosting                        true
            :metabase-ai-managed            true
            :metabot-v3                     true
            :offer-metabase-ai-managed      true
            :official_collections           true
            :query_reference_validation     true
            :remote_sync                    true
            :sandboxes                      true
            :scim                           true
            :semantic_search                true
            :serialization                  true
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
            :workspaces                     true
            :writable_connection            true}
           (mt/with-temporary-setting-values [custom-viz-enabled true]
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
              (#'mw.session/maybe-update-session-activity! session-key)
              (is (some? (t2/select-one-fn :last_active_at (t2/table-name :model/Session) :key_hashed key-hashed))))

            (testing "immediate second call should be throttled (no error, just skipped)"
              (let [first-value (t2/select-one-fn :last_active_at (t2/table-name :model/Session) :key_hashed key-hashed)]
                (#'mw.session/maybe-update-session-activity! session-key)
                (is (= first-value
                       (t2/select-one-fn :last_active_at (t2/table-name :model/Session) :key_hashed key-hashed)))))))))))

;;; ---------------------------------------- session cleanup idle sessions test ----------------------------------------

(deftest cleanup-idle-sessions-test
  (testing "With session-timeout configured, idle sessions are also cleaned up"
    (mt/with-premium-features #{:session-timeout-config}
      (mt/with-temporary-setting-values [session-timeout {:amount 5 :unit "minutes"}]
        (mt/with-temp [:model/User {user-id :id}]
          (let [active-id   (session/generate-session-id)
                active-key  (session/hash-session-key (str (random-uuid)))
                idle-id     (session/generate-session-id)
                idle-key    (session/hash-session-key (str (random-uuid)))
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
            (testing "active session is kept"
              (is (t2/exists? :model/Session :id active-id)))
            (testing "idle session is deleted"
              (is (not (t2/exists? :model/Session :id idle-id))))
            (testing "session with NULL last_active_at but recent created_at is kept"
              (is (t2/exists? :model/Session :id no-activity-id)))))))))
