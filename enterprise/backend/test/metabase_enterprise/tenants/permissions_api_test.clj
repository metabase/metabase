(ns metabase-enterprise.tenants.permissions-api-test
  "Tests for `/api/permissions` endpoints with EE features."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest create-group-test
  (testing "POST /permissions/group"
    (testing "creates tenant group when is_tenant_group is true (enterprise only)"
      (mt/with-premium-features #{:tenants}
        (mt/with-model-cleanup [:model/PermissionsGroup]
          (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Tenants Group" :is_tenant_group true})
          (let [group (t2/select-one :model/PermissionsGroup :name "Tenants Group")]
            (is (some? group))
            (is (true? (:is_tenant_group group)))))))

    (testing "validates is_tenant_group parameter type"
      (testing "rejects invalid type"
        (is (= {:errors {:is_tenant_group "nullable boolean"}
                :specific-errors {:is_tenant_group '("should be a boolean, received: \"invalid\"")}}
               (mt/user-http-request :crowberto :post 400 "permissions/group" {:name "Invalid Group" :is_tenant_group "invalid"})))))))

(deftest create-group-test-enterprise-features
  (testing "POST /permissions/group enterprise feature enforcement"
    (testing "allows creating tenant groups with tenants feature enabled"
      (mt/with-premium-features #{:tenants}
        (mt/with-model-cleanup [:model/PermissionsGroup]
          (mt/user-http-request :crowberto :post 200 "permissions/group" {:name "Tenant Group EE" :is_tenant_group true})
          (let [group (t2/select-one :model/PermissionsGroup :name "Tenant Group EE")]
            (is (some? group))
            (is (true? (:is_tenant_group group)))))))))
