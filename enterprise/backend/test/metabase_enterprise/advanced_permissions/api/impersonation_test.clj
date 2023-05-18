(ns metabase-enterprise.advanced-permissions.api.impersonation-test
  "Tests for creating and updating Connection Impersonation configs via the permisisons API"
  (:require
   [clojure.test :refer :all]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest create-impersonation-policy-test
  (premium-features-test/with-premium-features #{:advanced-permissions}
    (testing "/api/permissions/graph"
      (testing "A connection impersonation policy can be created via the permissions graph endpoint"
        (mt/with-user-in-groups
          [group {:name "New Group"}
           _  [group]]
          (let [impersonation {:group_id  (u/the-id group)
                               :db_id     (mt/id)
                               :attribute "Attribute Name"}
                graph         (assoc (perms/data-perms-graph) :impersonations [impersonation])
                result        (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)]
            (def result result)
            (is (= [(assoc impersonation :id (-> result :impersonations first :id))]
                   (t2/select :model/ConnectionImpersonation :group_id (u/the-id group)))))

          (testing "A connection impersonation policy can be updated via the permissions graph endpoint"
            (let [impersonation (-> (t2/select :model/ConnectionImpersonation
                                               :group_id (u/the-id group))
                                    first
                                    (assoc :attribute "New Attribute Name"))
                  graph         (assoc (perms/data-perms-graph) :impersonations [impersonation])]
              (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)
              (is (= [impersonation]
                   (t2/select :model/ConnectionImpersonation
                              :group_id (u/the-id group)))))))))))
