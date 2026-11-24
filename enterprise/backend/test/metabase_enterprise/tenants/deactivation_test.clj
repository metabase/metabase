(ns metabase-enterprise.tenants.deactivation-test
  "Deactivating a Tenant, and turning the Tenants feature off, end the sessions and revoke the OAuth tokens of the
  tenant Users."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.tenants.models :as tenants.model]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.users.access-test-util :as access.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest tenant-deactivation-revokes-access-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant {tenant-id :id}       {}
                     :model/Tenant {other-tenant-id :id} {}
                     :model/User   {user-id :id}         {:tenant_id tenant-id}
                     :model/User   {other-id :id}        {:tenant_id other-tenant-id}]
        (mt/with-model-cleanup [:model/OAuthAccessToken]
          (let [access       (access.tu/give-access! user-id)
                other-access (access.tu/give-access! other-id)]
            (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" tenant-id) {:is_active false})
            (is (= access.tu/revoked (access.tu/access-state access)))
            (is (= access.tu/live (access.tu/access-state other-access))
                "the Users of another Tenant keep their access")))))))

(deftest turning-tenants-off-revokes-access-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant {tenant-id :id}   {}
                     :model/User   {user-id :id}     {:tenant_id tenant-id}
                     :model/User   {internal-id :id} {}]
        (mt/with-model-cleanup [:model/OAuthAccessToken]
          (let [active-ids      (t2/select-pks-set :model/Tenant :is_active true)
                access          (access.tu/give-access! user-id)
                internal-access (access.tu/give-access! internal-id)]
            (try
              (setting/set! :use-tenants false)
              (is (= access.tu/revoked (access.tu/access-state access)))
              (is (= access.tu/live (access.tu/access-state internal-access))
                  "a User outside any Tenant keeps its access")
              (finally
                (tenants.model/update-tenants! (mapv #(hash-map :id % :is_active true) active-ids))))))))))
