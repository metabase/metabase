(ns metabase-enterprise.impersonation.permissions-test
  (:require
   [clojure.test :refer [deftest testing are is]]
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

(deftest ^:parallel impersonation-at-least-as-permissive?-test
  (testing "when advanced-permissions are *enabled*, `:impersonated` is equivalent to `:unrestricted`"
    (mt/with-premium-features #{:advanced-permissions}
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :unrestricted))
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :sandboxed))
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :impersonated))
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :legacy-no-self-service))
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :blocked)))))

(deftest ^:parallel impersonation-at-least-as-permissive?-with-feature-test
  (testing "With :advanced-permissions feature enabled, :impersonated is treated as :unrestricted for permission checks"
    (mt/with-premium-features #{:advanced-permissions}
      ;; :impersonated is now considered at least as permissive as :unrestricted
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :unrestricted)
          ":impersonated should be at least as permissive as :unrestricted when feature is enabled")
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :sandboxed))
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :impersonated))
      (is (data-perms/at-least-as-permissive? :perms/view-data :impersonated :blocked)))))

(deftest ^:parallel impersonated-permission-ee-test
  (testing "With :advanced-permissions feature enabled, :impersonated works normally"
    (mt/with-premium-features #{:advanced-permissions}
      (is (= :impersonated (data-perms/coalesce :perms/view-data #{:impersonated})))
      (is (= :impersonated (data-perms/coalesce :perms/view-data #{:impersonated :blocked})))
      (is (= :unrestricted (data-perms/coalesce :perms/view-data #{:unrestricted :impersonated}))))))
