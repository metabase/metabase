(ns metabase-enterprise.tenants.init-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.core.init]
   [metabase.auth-identity.provider :as auth-identity.provider]
   [methodical.core :as methodical]))

(deftest tenant-auth-provider-registered-on-init-test
  (testing (str "UXW-4898: the enterprise init chain must load metabase-enterprise.tenants.auth-provider. "
                "The SSO providers only `derive` from its dispatch keyword, which does not load the namespace — "
                "if this method is missing, JWT/SAML logins silently skip tenant validation and provision tenant "
                "users as internal users.")
    (is (some? (methodical/primary-method auth-identity.provider/login!
                                          :metabase-enterprise.tenants.auth-provider/create-tenant-if-not-exists)))))
