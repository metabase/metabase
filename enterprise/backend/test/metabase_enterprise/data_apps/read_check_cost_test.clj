(ns metabase-enterprise.data-apps.read-check-cost-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-cost
  "Rasta's read checks of the first `n` of the DataApps with `ids` selected in one request, and their query count."
  [ids n]
  (request/with-current-user (mt/user->id :rasta)
    (let [apps (t2/select :model/DataApp :id [:in (take n ids)] {:order-by [[:id :asc]]})]
      (t2/with-call-count [call-count]
        [(mapv mi/can-read? apps) (call-count)]))))

(deftest data-app-read-checks-cost-test
  (testing "read checks of DataApps loaded in one request cost the same for two apps as for three"
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp                 {app-1 :id} {:slug "check-cost-1" :name "One"}
                     :model/DataApp                 {app-2 :id} {:slug "check-cost-2" :name "Two"}
                     :model/DataApp                 {app-3 :id} {:slug "check-cost-3" :name "Three"}
                     :model/PermissionsGroup        {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
        (doseq [app-id [app-1 app-3]]
          (perms/grant-collection-read-permissions! group-id (t2/select-one-fn :resource_collection_id :model/DataApp :id app-id)))
        (let [ids [app-1 app-2 app-3]]
          (check-cost ids 2)
          (let [[two two-count] (check-cost ids 2)
                [all all-count] (check-cost ids 3)]
            (is (= [true false true] all))
            (is (= two (take 2 all)))
            (is (= two-count all-count))))))))
