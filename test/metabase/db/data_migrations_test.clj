(ns metabase.db.data-migrations-test
  "Tests to make sure the data migrations actually work as expected and don't break things. Shamefully, we have way less
  of these than we should... but that doesn't mean we can't write them for our new ones :)"
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.db.data-migrations :as migrations]
   [metabase.models :refer [Card Dashboard DashboardCard Setting]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- get-json-setting
  [setting-k]
  (json/parse-string (t2/select-one-fn :value Setting :key (name setting-k))))

(defn- call-with-ldap-and-sso-configured [ldap-group-mappings sso-group-mappings f]
  (mt/with-temporary-raw-setting-values
    [ldap-group-mappings    (json/generate-string ldap-group-mappings)
     saml-group-mappings    (json/generate-string sso-group-mappings)
     jwt-group-mappings     (json/generate-string sso-group-mappings)
     saml-enabled           "true"
     ldap-enabled           "true"
     jwt-enabled            "true"]
    (f)))

(defmacro ^:private with-ldap-and-sso-configured
  "Run body with ldap and SSO configured, in which SSO will only be configured if enterprise is available"
  [ldap-group-mappings sso-group-mappings & body]
  (binding [setting/*allow-retired-setting-names* true]
    `(call-with-ldap-and-sso-configured ~ldap-group-mappings ~sso-group-mappings (fn [] ~@body))))

;; The `remove-admin-from-group-mapping-if-needed` migration is written to run in OSS version
;; even though it might make changes to some enterprise-only settings.
;; In order to write tests that runs in both OSS and EE, we can't use
;; [[metabase.models.setting/get]] and [[metabase.test.util/with-temporary-setting-values]]
;; because they require all settings are defined.
;; That's why we use a set of helper functions that get setting directly from DB during tests
(deftest migrate-remove-admin-from-group-mapping-if-needed-test
  (let [admin-group-id        (u/the-id (perms-group/admin))
        sso-group-mappings    {"group-mapping-a" [admin-group-id (+ 1 admin-group-id)]
                               "group-mapping-b" [admin-group-id (+ 1 admin-group-id) (+ 2 admin-group-id)]}
        ldap-group-mappings   {"dc=metabase,dc=com" [admin-group-id (+ 1 admin-group-id)]}
        sso-expected-mapping  {"group-mapping-a" [(+ 1 admin-group-id)]
                               "group-mapping-b" [(+ 1 admin-group-id) (+ 2 admin-group-id)]}
        ldap-expected-mapping {"dc=metabase,dc=com" [(+ 1 admin-group-id)]}]
    (testing "Remove admin from group mapping for LDAP, SAML, JWT if they are enabled"
      (with-ldap-and-sso-configured ldap-group-mappings sso-group-mappings
        (#'migrations/migrate-remove-admin-from-group-mapping-if-needed)
        (is (= ldap-expected-mapping (get-json-setting :ldap-group-mappings)))
        (is (= sso-expected-mapping (get-json-setting :jwt-group-mappings)))
        (is (= sso-expected-mapping (get-json-setting :saml-group-mappings)))))

    (testing "remove admin from group mapping for LDAP, SAML, JWT even if they are disabled"
      (with-ldap-and-sso-configured ldap-group-mappings sso-group-mappings
        (mt/with-temporary-raw-setting-values
          [ldap-enabled "false"
           saml-enabled "false"
           jwt-enabled  "false"]
          (#'migrations/migrate-remove-admin-from-group-mapping-if-needed)
          (is (= ldap-expected-mapping (get-json-setting :ldap-group-mappings)))
          (is (= sso-expected-mapping (get-json-setting :jwt-group-mappings)))
          (is (= sso-expected-mapping (get-json-setting :saml-group-mappings))))))

    (testing "Don't remove admin group if `ldap-sync-admin-group` is enabled"
      (with-ldap-and-sso-configured ldap-group-mappings sso-group-mappings
        (mt/with-temporary-raw-setting-values
          [ldap-sync-admin-group "true"]
          (#'migrations/migrate-remove-admin-from-group-mapping-if-needed)
          (is (= ldap-group-mappings (get-json-setting :ldap-group-mappings))))))))
