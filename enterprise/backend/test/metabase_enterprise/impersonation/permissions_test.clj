(ns metabase-enterprise.impersonation.permissions-test
  (:require
   [clojure.test :refer [deftest testing are]]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]))

(deftest ^:parallel impersonation-coalesce-test
  (testing "with advanced permissions, impersonation is more permissive than blocked"
    (mt/with-premium-features #{:advanced-permissions}
      (are [expected args] (= expected (apply data-perms/coalesce args))
        :unrestricted  [:perms/view-data #{:unrestricted :sandboxed :impersonated :legacy-no-self-service :blocked}]
        :impersonated  [:perms/view-data #{:impersonated :legacy-no-self-service :blocked}]
        :impersonated  [:perms/view-data #{:impersonated :blocked}]
        :impersonated  [:perms/view-data #{:impersonated}]
        :impersonated  [:perms/view-data #{:impersonated :sandboxed :legacy-no-self-service :blocked}])))
  (testing "without advanced permissions, impersonated is equivalent to blocked"
    (mt/with-premium-features #{}
      (are [expected args] (= expected (apply data-perms/coalesce args))
        :unrestricted  [:perms/view-data #{:unrestricted :sandboxed :impersonated :legacy-no-self-service :blocked}]
        :blocked       [:perms/view-data #{:sandboxed :legacy-no-self-service :blocked}]
        :blocked       [:perms/view-data #{:sandboxed :blocked}]
        :blocked       [:perms/view-data #{:sandboxed}]
        :blocked       [:perms/view-data #{:impersonated :sandboxed :legacy-no-self-service :blocked}]))))

