(ns metabase-enterprise.metabot.models.metabot-limits-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.models.metabot-group-limit]
   [metabase-enterprise.metabot.models.metabot-instance-limit]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- write-status
  "The status code `thunk`, a write, throws, or `:written`."
  [thunk]
  (try (thunk)
       :written
       (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))

(deftest group-limit-max-usage-is-non-negative-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
    (mt/with-model-cleanup [:model/MetabotGroupLimit]
      (is (= 400 (write-status #(t2/insert! :model/MetabotGroupLimit {:group_id group-id :max_usage -1}))))
      (is (= :written (write-status #(t2/insert! :model/MetabotGroupLimit {:group_id group-id :max_usage 0}))))
      (let [id (t2/select-one-pk :model/MetabotGroupLimit :group_id group-id)]
        (is (= 400 (write-status #(t2/update! :model/MetabotGroupLimit :id id {:max_usage -1}))))
        (is (= :written (write-status #(t2/update! :model/MetabotGroupLimit :id id {:max_usage 5}))))))))

(deftest instance-limit-max-usage-is-non-negative-test
  (mt/with-temp [:model/Tenant {tenant-id :id} {}]
    (mt/with-model-cleanup [:model/MetabotInstanceLimit]
      (is (= 400 (write-status #(t2/insert! :model/MetabotInstanceLimit {:tenant_id tenant-id :max_usage -1}))))
      (is (= :written (write-status #(t2/insert! :model/MetabotInstanceLimit {:tenant_id tenant-id :max_usage 0}))))
      (let [id (t2/select-one-pk :model/MetabotInstanceLimit :tenant_id tenant-id)]
        (is (= 400 (write-status #(t2/update! :model/MetabotInstanceLimit :id id {:max_usage -1}))))
        (is (= :written (write-status #(t2/update! :model/MetabotInstanceLimit :id id {:max_usage nil}))))))))
