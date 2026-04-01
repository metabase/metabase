(ns metabase.metabot.scope-resolution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]))

(deftest user-metabot-perms->scopes-test
  (testing "sql-generation :yes grants sql, transforms, snippets scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :yes
                   :permission/metabot-nql            :no
                   :permission/metabot-other-tools    :no})]
      (is (contains? scopes "agent:sql:*"))
      (is (contains? scopes "agent:transforms:*"))
      (is (contains? scopes "agent:snippets:*"))
      (is (not (contains? scopes "agent:notebook:*")))
      (is (not (contains? scopes "agent:viz:*")))))

  (testing "nql :yes grants notebook, query, table, metric scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nql            :yes
                   :permission/metabot-other-tools    :no})]
      (is (contains? scopes "agent:notebook:*"))
      (is (contains? scopes "agent:query:*"))
      (is (contains? scopes "agent:table:*"))
      (is (contains? scopes "agent:metric:*"))
      (is (not (contains? scopes "agent:sql:*")))))

  (testing "other-tools :yes grants viz, dashboard, document, alert scopes"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nql            :no
                   :permission/metabot-other-tools    :yes})]
      (is (contains? scopes "agent:viz:*"))
      (is (contains? scopes "agent:dashboard:*"))
      (is (contains? scopes "agent:document:*"))
      (is (contains? scopes "agent:alert:*"))
      (is (not (contains? scopes "agent:sql:*")))))

  (testing "always-granted scopes present regardless of permissions"
    (let [scopes (scope/user-metabot-perms->scopes
                  {:permission/metabot-sql-generation :no
                   :permission/metabot-nql            :no
                   :permission/metabot-other-tools    :no})]
      (is (contains? scopes "agent:search"))
      (is (contains? scopes "agent:resource:*"))
      (is (contains? scopes "agent:todo:*"))
      (is (contains? scopes "agent:metadata:*"))))

  (testing "all-yes grants all scopes"
    (let [scopes (scope/user-metabot-perms->scopes scope/all-yes-permissions)]
      (is (contains? scopes "agent:sql:*"))
      (is (contains? scopes "agent:notebook:*"))
      (is (contains? scopes "agent:viz:*"))
      (is (contains? scopes "agent:search"))))

  (testing "nil permissions falls back to defaults (all :no)"
    (let [scopes (scope/user-metabot-perms->scopes nil)]
      (is (contains? scopes "agent:search"))
      (is (not (contains? scopes "agent:sql:*")))
      (is (not (contains? scopes "agent:notebook:*")))
      (is (not (contains? scopes "agent:viz:*"))))))

(deftest resolve-user-permissions-test
  (testing "nil user-id returns defaults"
    (let [perms (scope/resolve-user-permissions nil)]
      (is (= (:permission/metabot-sql-generation scope/perm-type-defaults)
             (:permission/metabot-sql-generation perms)))
      (is (= (:permission/metabot-nql scope/perm-type-defaults)
             (:permission/metabot-nql perms)))
      (is (= (:permission/metabot-other-tools scope/perm-type-defaults)
             (:permission/metabot-other-tools perms)))))

  (testing "OSS always returns defaults regardless of user-id"
    (let [perms (scope/resolve-user-permissions 1)]
      (is (= scope/perm-type-defaults perms)))))
