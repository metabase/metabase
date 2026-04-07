(ns metabase.metabot.scope-resolution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

(deftest user-metabot-perms-sql-generation-scopes-test
  (testing "sql-generation :yes grants sql, transforms, snippets scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :yes
                   :permission/metabot-nlq            :no
                   :permission/metabot-other-tools    :no})]
      (is (contains? scopes "agent:sql:*"))
      (is (contains? scopes "agent:transforms:*"))
      (is (contains? scopes "agent:snippets:*"))
      (is (not (contains? scopes "agent:notebook:*")))
      (is (not (contains? scopes "agent:viz:*"))))))

(deftest user-metabot-perms-nql-scopes-test
  (testing "nql :yes grants notebook, query, table, metric scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nlq            :yes
                   :permission/metabot-other-tools    :no})]
      (is (contains? scopes "agent:notebook:*"))
      (is (contains? scopes "agent:query:*"))
      (is (contains? scopes "agent:table:*"))
      (is (contains? scopes "agent:metric:*"))
      (is (not (contains? scopes "agent:sql:*"))))))

(deftest user-metabot-perms-other-tools-scopes-test
  (testing "other-tools :yes grants viz, dashboard, document, alert scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nlq            :no
                   :permission/metabot-other-tools    :yes})]
      (is (contains? scopes "agent:viz:*"))
      (is (contains? scopes "agent:dashboard:*"))
      (is (contains? scopes "agent:document:*"))
      (is (contains? scopes "agent:alert:*"))
      (is (not (contains? scopes "agent:sql:*"))))))

(deftest user-metabot-perms-always-granted-scopes-test
  (testing "always-granted scopes present regardless of permissions"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nlq            :no
                   :permission/metabot-other-tools    :no})]
      (is (contains? scopes "agent:search"))
      (is (contains? scopes "agent:resource:*"))
      (is (contains? scopes "agent:todo:*"))
      (is (contains? scopes "agent:metadata:*")))))

(deftest user-metabot-perms-all-yes-scopes-test
  (testing "all-yes grants all scopes"
    (let [scopes (scope/user-metabot-perms->scopes scope/all-yes-permissions)]
      (is (contains? scopes "agent:sql:*"))
      (is (contains? scopes "agent:notebook:*"))
      (is (contains? scopes "agent:viz:*"))
      (is (contains? scopes "agent:search")))))

(deftest user-metabot-perms-nil-falls-back-to-defaults-test
  (testing "nil permissions falls back to defaults (all :no)"
    (let [scopes (scope/user-metabot-perms->scopes nil)]
      (is (contains? scopes "agent:search"))
      (is (not (contains? scopes "agent:sql:*")))
      (is (not (contains? scopes "agent:notebook:*")))
      (is (not (contains? scopes "agent:viz:*"))))))

(deftest resolve-user-permissions-nil-test
  (testing "nil user-id returns all-yes in OSS"
    (mt/with-premium-features #{}
      (let [perms (scope/resolve-user-permissions nil)]
        (is (= scope/all-yes-permissions perms)))))
  (testing "nil user-id returns all-yes in EE with ai-controls"
    (mt/with-premium-features #{:ai-controls}
      (let [perms (scope/resolve-user-permissions nil)]
        (is (= scope/all-yes-permissions perms))))))

(deftest resolve-user-permissions-oss-returns-all-yes-test
  (mt/with-premium-features #{}
    (testing "OSS always returns all-yes regardless of user-id"
      (let [perms (scope/resolve-user-permissions 1)]
        (is (= scope/all-yes-permissions perms))))))
