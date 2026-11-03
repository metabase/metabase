(ns metabase-enterprise.security-center.health-checks-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase.permissions.core :as perms]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- fake-check
  "A registry entry for the tests, with `overrides` on top. Passes with one item unless told otherwise."
  [& {:as overrides}]
  (merge {:id                :https-redirect
          :severity          :medium
          :title             (deferred-tru "Requests are redirected to HTTPS")
          :description       (deferred-tru "Plain HTTP exposes sessions.")
          :remediation       (deferred-tru "Turn on the redirect in Admin settings.")
          :docs-page         "configuring-metabase/settings"
          :requires-restart? false
          :applicable?       (constantly true)
          :run               (constantly [{:status :pass, :message "Redirect to HTTPS is on"}])}
         overrides))

(deftest ^:parallel registry-test
  (testing "every registered check is keyed by its own id and matches the entry schema"
    (doseq [[id entry] @#'health-checks/checks]
      (is (= id (:id entry)))
      (is (mr/validate ::health-checks/entry entry))))
  (testing "an entry registered under another id fails at load time"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"registered under"
                          (#'health-checks/validated-registry {:sso-login (fake-check)}))))
  (testing "an entry outside the schema fails at load time"
    (is (thrown? clojure.lang.ExceptionInfo
                 (#'health-checks/validated-registry {:https-redirect (fake-check :severity :urgent)})))))

(deftest accessors-test
  (let [redirect (fake-check)
        sso      (fake-check :id :sso-login)]
    (with-redefs [health-checks/checks {:https-redirect redirect, :sso-login sso}]
      (is (= [redirect sso] (health-checks/all-checks)))
      (is (= [:https-redirect :sso-login] (health-checks/check-ids)))
      (is (= sso (health-checks/check-by-id :sso-login)))
      (is (nil? (health-checks/check-by-id :mfa-required))))))

(deftest ^:parallel status-of-test
  (testing "any item fails → fail"
    (is (= :fail (health-checks/status-of [{:status :pass} {:status :unknown} {:status :fail}]))))
  (testing "else any item unknown → unknown"
    (is (= :unknown (health-checks/status-of [{:status :pass} {:status :unknown}]))))
  (testing "else pass"
    (is (= :pass (health-checks/status-of [{:status :pass} {:status :pass}])))))

(deftest ^:parallel applicable-test
  (is (true? (health-checks/applicable? (fake-check :applicable? (constantly true)))))
  (is (false? (health-checks/applicable? (fake-check :applicable? (constantly false)))))
  (testing "a throw counts as applicable, and is logged"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.health-checks :error]]
      (is (true? (health-checks/applicable? (fake-check :applicable? #(throw (ex-info "boom" {}))))))
      (is (=? [{:level :error, :message #"Health check https-redirect could not tell whether it applies"}]
              (messages))))))

(deftest ^:parallel run-check-test
  (testing "the response is a HealthCheck, with the texts as strings"
    (let [response (health-checks/run-check (fake-check))]
      (is (mr/validate ::security-center.schema/health-check response))
      (is (=? {:id               :https-redirect
               :severity         :medium
               :title            "Requests are redirected to HTTPS"
               :description      "Plain HTTP exposes sessions."
               :remediation      "Turn on the redirect in Admin settings."
               :docs             {:page "configuring-metabase/settings"}
               :requires_restart false
               :status           :pass
               :running          false
               :checked_at       java.time.OffsetDateTime
               :items            [{:status :pass, :message "Redirect to HTTPS is on"}]}
              response))
      (is (not (contains? (:docs response) :anchor)))))
  (testing "the docs anchor is returned when the entry has one"
    (is (= {:page "configuring-metabase/environment-variables", :anchor "mb_session_secret_key"}
           (:docs (health-checks/run-check (fake-check :docs-page   "configuring-metabase/environment-variables"
                                                       :docs-anchor "mb_session_secret_key"))))))
  (testing "the status follows the items"
    (is (= :fail (:status (health-checks/run-check (fake-check :run (constantly [{:status :pass} {:status :fail}]))))))
    (is (= :unknown (:status (health-checks/run-check (fake-check :run (constantly [{:status :unknown}])))))))
  (testing "the texts follow the user's locale"
    (mt/with-user-locale "es"
      (is (= "Requests are redirected to HTTPS"
             (:title (health-checks/run-check (fake-check)))))))
  (testing "a check that throws comes back as unknown with the error's message, and is logged"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.health-checks :error]]
      (let [response (health-checks/run-check (fake-check :run #(throw (ex-info "the setting is unreadable" {}))))]
        (is (mr/validate ::security-center.schema/health-check response))
        (is (= :unknown (:status response)))
        (is (= [{:status :unknown, :message "The check could not run: the setting is unreadable"}]
               (:items response))))
      (is (=? [{:level :error, :message "Health check https-redirect failed"}]
              (messages)))))
  (testing "a check that returns no items comes back as unknown"
    (let [response (health-checks/run-check (fake-check :run (constantly [])))]
      (is (= :unknown (:status response)))
      (is (=? [{:status :unknown, :message string?}] (:items response)))))
  (testing "a check that returns an item outside the schema comes back as unknown"
    (let [response (health-checks/run-check (fake-check :run (constantly [{:status :error}])))]
      (is (= :unknown (:status response)))
      (is (mr/validate ::security-center.schema/health-check response)))))

;;; The registered checks

(defn- run-check-by-id
  [id]
  (health-checks/run-check (health-checks/check-by-id id)))

(deftest registered-checks-test
  (testing "every registered check applies or not, and answers within the schema"
    (doseq [check (health-checks/all-checks)]
      (testing (:id check)
        (is (boolean? (health-checks/applicable? check)))
        (is (mr/validate ::security-center.schema/health-check (health-checks/run-check check)))))))

;;; The env var checks

(deftest encryption-secret-key-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :encryption-secret-key))))
  (testing "passes when MB_ENCRYPTION_SECRET_KEY is set"
    (mt/with-dynamic-fn-redefs [encryption/default-encryption-enabled? (constantly true)]
      (is (=? {:status :pass, :items [{:status :pass, :message "MB_ENCRYPTION_SECRET_KEY is set"}]}
              (run-check-by-id :encryption-secret-key)))))
  (testing "fails when it is not set"
    (mt/with-dynamic-fn-redefs [encryption/default-encryption-enabled? (constantly false)]
      (is (=? {:status :fail, :items [{:status :fail, :message "MB_ENCRYPTION_SECRET_KEY is not set"}]}
              (run-check-by-id :encryption-secret-key))))))

(deftest session-secret-key-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :session-secret-key))))
  (testing "passes when MB_SESSION_SECRET_KEY is set, and the response does not contain the value"
    (mt/with-temp-env-var-value! [mb-session-secret-key "s3cret-session-key"]
      (let [response (run-check-by-id :session-secret-key)]
        (is (=? {:status :pass, :items [{:status :pass, :message "MB_SESSION_SECRET_KEY is set"}]}
                response))
        (is (not (str/includes? (pr-str response) "s3cret-session-key"))))))
  (testing "fails when it is not set"
    (mt/with-temp-env-var-value! [mb-session-secret-key nil]
      (is (=? {:status :fail, :items [{:status :fail, :message "MB_SESSION_SECRET_KEY is not set"}]}
              (run-check-by-id :session-secret-key))))))

(deftest legacy-startup-encryption-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :legacy-startup-encryption))))
  (testing "passes when MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is true"
    (mt/with-temp-env-var-value! [mb-disable-legacy-startup-encryption "true"]
      (is (=? {:status :pass, :items [{:status :pass, :message "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is true"}]}
              (run-check-by-id :legacy-startup-encryption)))))
  (testing "fails when it is false"
    (mt/with-temp-env-var-value! [mb-disable-legacy-startup-encryption "false"]
      (is (=? {:status :fail, :items [{:status :fail, :message "MB_DISABLE_LEGACY_STARTUP_ENCRYPTION is not true"}]}
              (run-check-by-id :legacy-startup-encryption)))))
  (testing "fails when it is not set"
    (mt/with-temp-env-var-value! [mb-disable-legacy-startup-encryption nil]
      (is (= :fail (:status (run-check-by-id :legacy-startup-encryption)))))))

;;; The HTTPS checks

(deftest https-site-url-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :https-site-url))))
  (testing "passes when the site URL starts with https:"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (is (=? {:status :pass, :items [{:status :pass, :message "Site URL starts with https:"}]}
              (run-check-by-id :https-site-url)))))
  (testing "fails when the site URL starts with http:"
    (mt/with-temporary-setting-values [site-url "http://metabase.example.com"]
      (is (=? {:status :fail, :items [{:status :fail, :message "Site URL does not start with https:"}]}
              (run-check-by-id :https-site-url)))))
  (testing "fails when the site URL is not set"
    (mt/with-temporary-setting-values [site-url nil]
      (is (=? {:status :fail, :items [{:status :fail, :message "Site URL is not set"}]}
              (run-check-by-id :https-site-url))))))

(deftest https-redirect-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :https-redirect))))
  (testing "passes when the redirect is on"
    (mt/with-temporary-setting-values [site-url                       "https://metabase.example.com"
                                       redirect-all-requests-to-https true]
      (is (=? {:status :pass, :items [{:status :pass, :message "Redirect to HTTPS is on"}]}
              (run-check-by-id :https-redirect)))))
  (testing "fails when the redirect is off"
    (mt/with-temporary-setting-values [redirect-all-requests-to-https false]
      (is (=? {:status :fail, :items [{:status :fail, :message "Redirect to HTTPS is off"}]}
              (run-check-by-id :https-redirect))))))

;;; The SSO and SCIM checks

(deftest sso-login-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :sso-login))))
  (testing "passes with one item per provider that is on"
    (mt/with-premium-features #{:sso-jwt}
      (mt/with-temporary-setting-values [jwt-enabled true]
        (is (=? {:status :pass, :items [{:status :pass, :message "JWT is on"}]}
                (run-check-by-id :sso-login))))))
  (testing "fails when none of SAML, OIDC and JWT is on"
    (mt/with-premium-features #{:sso-jwt}
      (mt/with-temporary-setting-values [jwt-enabled false]
        (is (=? {:status :fail, :items [{:status :fail, :message "None of SAML, OIDC or JWT is on"}]}
                (run-check-by-id :sso-login))))))
  (testing "a provider whose feature is not in the token reads as off"
    (mt/with-premium-features #{:sso-jwt}
      (mt/with-temporary-setting-values [jwt-enabled true]
        (mt/with-premium-features #{}
          (is (= :fail (:status (run-check-by-id :sso-login)))))))))

(deftest scim-provisioning-test
  (testing "applies only with the :scim feature"
    (mt/with-premium-features #{:scim}
      (is (true? (health-checks/applicable? (health-checks/check-by-id :scim-provisioning)))))
    (mt/with-premium-features #{}
      (is (false? (health-checks/applicable? (health-checks/check-by-id :scim-provisioning))))))
  (mt/with-premium-features #{:scim}
    (testing "passes when SCIM is on"
      (mt/with-temporary-setting-values [scim-enabled true]
        (is (=? {:status :pass, :items [{:status :pass, :message "SCIM is on"}]}
                (run-check-by-id :scim-provisioning)))))
    (testing "fails when SCIM is off"
      (mt/with-temporary-setting-values [scim-enabled false]
        (is (=? {:status :fail, :items [{:status :fail, :message "SCIM is off"}]}
                (run-check-by-id :scim-provisioning)))))))

;;; The mfa-required check

(deftest mfa-required-test
  (testing "applies with the :multi-factor-auth feature when password or LDAP login is on"
    (mt/with-premium-features #{:multi-factor-auth}
      (is (true? (health-checks/applicable? (health-checks/check-by-id :mfa-required)))))
    (mt/with-premium-features #{}
      (is (false? (health-checks/applicable? (health-checks/check-by-id :mfa-required)))))
    (testing "and is hidden when password and LDAP login are both off"
      (mt/with-premium-features #{:multi-factor-auth :sso-jwt :disable-password-login}
        ;; password login reads as off only when an SSO provider is configured and on
        (mt/with-temporary-setting-values [jwt-enabled               true
                                           jwt-shared-secret         (apply str (repeat 64 "a"))
                                           jwt-identity-provider-uri "https://idp.example.com"
                                           enable-password-login     false
                                           ldap-enabled              false]
          (is (false? (health-checks/applicable? (health-checks/check-by-id :mfa-required))))))))
  (mt/with-premium-features #{:multi-factor-auth}
    (testing "passes when 2FA is required"
      (mt/with-temporary-setting-values [mfa-enforcement :required, mfa-requirement-deadline nil]
        (is (=? {:status :pass, :items [{:status :pass, :message "2FA is required"}]}
                (run-check-by-id :mfa-required)))))
    (testing "fails when 2FA is optional"
      (mt/with-temporary-setting-values [mfa-enforcement :optional]
        (is (=? {:status :fail, :items [{:status :fail, :message "2FA is not required"}]}
                (run-check-by-id :mfa-required)))))))

;;; The all-users-permissions check

(deftest all-users-permissions-test
  (is (true? (health-checks/applicable? (health-checks/check-by-id :all-users-permissions))))
  (let [group-id (:id (perms/all-users-group))]
    (testing "passes with two items when All Users can neither curate Our analytics nor query a database"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-no-data-perms-for-all-users!
          (is (=? {:status :pass
                   :items  [{:status      :pass
                             :message     "All Users cannot curate Our analytics"
                             :entity_type :collection
                             :entity_id   "root"
                             :entity_name "Our analytics"}
                            {:status      :pass
                             :message     "All Users cannot query any database"
                             :entity_type :group
                             :entity_id   group-id
                             :entity_name "All Users"}]}
                  (run-check-by-id :all-users-permissions))))))
    (testing "fails on the collection item when All Users can curate Our analytics"
      (mt/with-no-data-perms-for-all-users!
        (is (=? {:status :fail
                 :items  [{:status :fail, :message "All Users can curate Our analytics", :entity_id "root"}
                          {:status :pass}]}
                (run-check-by-id :all-users-permissions)))))
    (testing "fails on the group item, naming the databases, when All Users can query a database"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Database _ {:name "Warehouse"}]
          (is (=? {:status :fail
                   :items  [{:status :pass}
                            {:status      :fail
                             :message     #"All Users can query: .*Warehouse.*"
                             :entity_type :group
                             :entity_id   group-id}]}
                  (run-check-by-id :all-users-permissions))))
        (testing "also for query access on one table only"
          (mt/with-no-data-perms-for-all-users!
            (perms/set-table-permission! group-id (mt/id :venues) :perms/create-queries :query-builder)
            (is (=? {:status :fail
                     :items  [{:status :pass}
                              {:status :fail, :message #"All Users can query: .*test-data.*"}]}
                    (run-check-by-id :all-users-permissions)))))))))
