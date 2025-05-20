(ns metabase-enterprise.tenants.api-test
  (:require
   [clojure.test :refer [deftest testing is use-fixtures]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn with-premium-feature-fixture [f]
  (mt/with-premium-features #{:tenants}
    (f)))

(use-fixtures :each with-premium-feature-fixture)

(deftest can-create-tenants
  (testing "I can create a tenant with a unique name"
    (mt/with-model-cleanup [:model/Tenant]
      (mt/user-http-request :crowberto :post 200 "ee/tenants/"
                            {:name "My Tenant"
                             :slug "my-tenant"})
      (is (t2/exists? :model/Tenant :name "My Tenant"))))
  (testing "Duplicate names results in an error"
    (mt/with-model-cleanup [:model/Tenant]
      (mt/user-http-request :crowberto :post 200 "ee/tenants/"
                            {:name "My Tenant" :slug "my-tenant"})
      (is (t2/exists? :model/Tenant :name "My Tenant"))
      (is (= "This tenant name or slug is already taken."
             (mt/user-http-request :crowberto :post 400 "ee/tenants/"
                                   {:name "My Tenant" :slug "foo"})))
      (is (= "This tenant name or slug is already taken."
             (mt/user-http-request :crowberto :post 400 "ee/tenants/"
                                   {:name "Foo" :slug "my-tenant"}))))))

(deftest can-list-tenants
  (testing "I can list tenants"
    (mt/with-temp [:model/Tenant {id1 :id} {:name "Name 1" :slug "Slug 1"}
                   :model/User {} {:tenant_id id1}
                   :model/Tenant {id2 :id} {:name "Name 2" :slug "Slug 2"}]
      (is (=? [{:id id1 :member_count 1}
               {:id id2 :member_count 0}]
              (mt/user-http-request :crowberto :get 200 "ee/tenants/")))
      (is (=? [{:id id1 :name "Name 1" :slug "Slug 1"}]
              (mt/user-http-request :crowberto :get 200 "ee/tenants/?limit=1")))
      (is (=? [{:id id2}]
              (mt/user-http-request :crowberto :get 200 "ee/tenants/?offset=1"))))))
