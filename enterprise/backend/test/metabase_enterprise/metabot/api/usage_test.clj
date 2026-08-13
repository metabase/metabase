(ns metabase-enterprise.metabot.api.usage-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Instance limits -------------------------------------------------

(deftest get-instance-limit-test
  (testing "GET /api/ee/ai-controls/usage/instance"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/usage/instance"))))
      (testing "returns max_usage: null when no limit is set"
        (t2/delete! :model/MetabotInstanceLimit :tenant_id nil)
        (is (= {:max_usage nil}
               (mt/user-http-request :crowberto :get 200 "ee/ai-controls/usage/instance"))))
      (testing "returns max_usage when set"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 1000}]
          (is (= {:max_usage 1000}
                 (mt/user-http-request :crowberto :get 200 "ee/ai-controls/usage/instance"))))))))

(deftest put-instance-limit-test
  (testing "PUT /api/ee/ai-controls/usage/instance"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/ai-controls/usage/instance" {:max_usage 500}))))
      (testing "creates a new limit when none exists"
        (t2/delete! :model/MetabotInstanceLimit :tenant_id nil)
        (is (= {:max_usage 500}
               (mt/user-http-request :crowberto :put 200 "ee/ai-controls/usage/instance" {:max_usage 500})))
        (t2/delete! :model/MetabotInstanceLimit :tenant_id nil))
      (testing "updates an existing limit"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 1000}]
          (is (= {:max_usage 2000}
                 (mt/user-http-request :crowberto :put 200 "ee/ai-controls/usage/instance" {:max_usage 2000})))))
      (testing "removes the limit when max_usage is null"
        (mt/with-temp [:model/MetabotInstanceLimit _ {:tenant_id nil :max_usage 1000}]
          (is (= {:max_usage nil}
                 (mt/user-http-request :crowberto :put 200 "ee/ai-controls/usage/instance" {:max_usage nil})))
          (is (nil? (t2/select-one :model/MetabotInstanceLimit :tenant_id nil))))))))

;;; ------------------------------------------------- Tenant limits --------------------------------------------------

(deftest get-tenant-limits-test
  (testing "GET /api/ee/ai-controls/usage/tenant"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/usage/tenant"))))
      (testing "returns all tenant limits as a flat list"
        (mt/with-temp [:model/Tenant {tenant-a :id} {}
                       :model/Tenant {tenant-b :id} {}
                       :model/MetabotInstanceLimit _ {:tenant_id tenant-a :max_usage 100}
                       :model/MetabotInstanceLimit _ {:tenant_id tenant-b :max_usage 200}]
          (let [limits    (mt/user-http-request :crowberto :get 200 "ee/ai-controls/usage/tenant")
                by-tenant (into {} (map (juxt :tenant_id :max_usage)) limits)]
            (is (= 100 (get by-tenant tenant-a)))
            (is (= 200 (get by-tenant tenant-b)))
            (is (every? #(not (contains? % :id)) limits))))))))

(deftest get-tenant-limit-test
  (testing "GET /api/ee/ai-controls/usage/tenant/:tenant-id"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/usage/tenant/1"))))
      (testing "returns tenant_id and max_usage: null when no limit is set"
        (mt/with-temp [:model/Tenant {tenant-id :id} {}]
          (is (= {:tenant_id tenant-id :max_usage nil}
                 (mt/user-http-request :crowberto :get 200
                                       (format "ee/ai-controls/usage/tenant/%d" tenant-id))))))
      (testing "returns tenant_id and max_usage when set"
        (mt/with-temp [:model/Tenant {tenant-id :id} {}
                       :model/MetabotInstanceLimit _ {:tenant_id tenant-id :max_usage 500}]
          (is (= {:tenant_id tenant-id :max_usage 500}
                 (mt/user-http-request :crowberto :get 200
                                       (format "ee/ai-controls/usage/tenant/%d" tenant-id)))))))))

(deftest put-tenant-limit-test
  (testing "PUT /api/ee/ai-controls/usage/tenant/:tenant-id"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/ai-controls/usage/tenant/1" {:max_usage 500}))))
      (testing "creates a new limit"
        (mt/with-temp [:model/Tenant {tenant-id :id} {}]
          (is (= {:tenant_id tenant-id :max_usage 300}
                 (mt/user-http-request :crowberto :put 200
                                       (format "ee/ai-controls/usage/tenant/%d" tenant-id)
                                       {:max_usage 300})))
          (t2/delete! :model/MetabotInstanceLimit :tenant_id tenant-id)))
      (testing "updates an existing limit"
        (mt/with-temp [:model/Tenant {tenant-id :id} {}
                       :model/MetabotInstanceLimit _ {:tenant_id tenant-id :max_usage 300}]
          (is (= {:tenant_id tenant-id :max_usage 600}
                 (mt/user-http-request :crowberto :put 200
                                       (format "ee/ai-controls/usage/tenant/%d" tenant-id)
                                       {:max_usage 600})))))
      (testing "removes the limit when max_usage is null"
        (mt/with-temp [:model/Tenant {tenant-id :id} {}
                       :model/MetabotInstanceLimit _ {:tenant_id tenant-id :max_usage 300}]
          (is (= {:tenant_id tenant-id :max_usage nil}
                 (mt/user-http-request :crowberto :put 200
                                       (format "ee/ai-controls/usage/tenant/%d" tenant-id)
                                       {:max_usage nil})))
          (is (nil? (t2/select-one :model/MetabotInstanceLimit :tenant_id tenant-id))))))))

;;; -------------------------------------------------- Group limits ---------------------------------------------------

(deftest get-group-limits-test
  (testing "GET /api/ee/ai-controls/usage/group"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/usage/group"))))
      (testing "returns all group limits as a flat list"
        (mt/with-temp [:model/PermissionsGroup {group-a :id} {:name "Limit Group A"}
                       :model/PermissionsGroup {group-b :id} {:name "Limit Group B"}
                       :model/MetabotGroupLimit _ {:group_id group-a :max_usage 100}
                       :model/MetabotGroupLimit _ {:group_id group-b :max_usage 200}]
          (let [limits   (mt/user-http-request :crowberto :get 200 "ee/ai-controls/usage/group")
                by-group (into {} (map (juxt :group_id :max_usage)) limits)]
            (is (= 100 (get by-group group-a)))
            (is (= 200 (get by-group group-b)))
            (is (every? #(not (contains? % :id)) limits))))))))

(deftest get-group-limit-test
  (testing "GET /api/ee/ai-controls/usage/group/:group-id"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/usage/group/1"))))
      (testing "returns group_id and max_usage: null when no limit is set"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "No Limit Group"}]
          (is (= {:group_id group-id :max_usage nil}
                 (mt/user-http-request :crowberto :get 200
                                       (format "ee/ai-controls/usage/group/%d" group-id))))))
      (testing "returns group_id and max_usage when set"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Limited Group"}
                       :model/MetabotGroupLimit _ {:group_id group-id :max_usage 500}]
          (is (= {:group_id group-id :max_usage 500}
                 (mt/user-http-request :crowberto :get 200
                                       (format "ee/ai-controls/usage/group/%d" group-id)))))))))

(deftest put-group-limit-test
  (testing "PUT /api/ee/ai-controls/usage/group/:group-id"
    (mt/with-premium-features #{:ai-controls}
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/ai-controls/usage/group/1" {:max_usage 500}))))
      (testing "creates a new limit"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "New Limit Group"}]
          (is (= {:group_id group-id :max_usage 300}
                 (mt/user-http-request :crowberto :put 200
                                       (format "ee/ai-controls/usage/group/%d" group-id)
                                       {:max_usage 300})))
          (t2/delete! :model/MetabotGroupLimit :group_id group-id)))
      (testing "updates an existing limit"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Update Limit Group"}
                       :model/MetabotGroupLimit _ {:group_id group-id :max_usage 300}]
          (is (= {:group_id group-id :max_usage 600}
                 (mt/user-http-request :crowberto :put 200
                                       (format "ee/ai-controls/usage/group/%d" group-id)
                                       {:max_usage 600})))))
      (testing "removes the limit when max_usage is null"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Remove Limit Group"}
                       :model/MetabotGroupLimit _ {:group_id group-id :max_usage 300}]
          (is (= {:group_id group-id :max_usage nil}
                 (mt/user-http-request :crowberto :put 200
                                       (format "ee/ai-controls/usage/group/%d" group-id)
                                       {:max_usage nil})))
          (is (nil? (t2/select-one :model/MetabotGroupLimit :group_id group-id))))))))
