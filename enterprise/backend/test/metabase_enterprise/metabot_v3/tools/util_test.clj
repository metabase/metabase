(ns metabase-enterprise.metabot-v3.tools.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.util]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]))

(deftest metabot-scope-test
  (mt/dataset test-data
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                          :group_id group-id}
                     :model/Collection container-coll {:name "container coll"}
                     :model/Collection metabot-coll   {:name "mb coll"
                                                       :location (collection/location-path container-coll)}
                     :model/Collection mb-child-coll1 {:name "mbc1"
                                                       :location (collection/location-path container-coll metabot-coll)}
                     :model/Collection mb-child-coll2 {:name "mbc2"
                                                       :location (collection/location-path container-coll metabot-coll)}
                     :model/Collection mb-child-coll3 {:name "mbc3"
                                                       :location (collection/location-path
                                                                  container-coll metabot-coll mb-child-coll2)}
                     :model/Collection non-mb-coll    {:name "non-mbc"
                                                       :location (collection/location-path container-coll)}
                     :model/Card mb-model1  {:type :model,  :collection_id (:id metabot-coll)}
                     :model/Card mb-model2  {:type :model,  :collection_id (:id mb-child-coll1)}
                     :model/Card mb-model3  {:type :model,  :collection_id (:id mb-child-coll1)}
                     :model/Card mb-model4  {:type :model,  :collection_id (:id non-mb-coll)}
                     :model/Card _          {:type :model,  :collection_id (:id non-mb-coll)}
                     :model/Card mb-metric1 {:type :metric, :collection_id (:id metabot-coll)}
                     :model/Card mb-metric2 {:type :metric, :collection_id (:id mb-child-coll2)}
                     :model/Card mb-metric3 {:type :metric, :collection_id (:id mb-child-coll3)}
                     :model/Card mb-metric4 {:type :metric, :collection_id (:id non-mb-coll)}
                     :model/Card _          {:type :metric, :collection_id (:id non-mb-coll)}
                     :model/Metabot metabot {:name "metabot"}
                     :model/MetabotEntity {mb-coll-entity-id :id}   {:metabot_id (:id metabot)
                                                                     :model :collection
                                                                     :model_id (:id metabot-coll)}
                     :model/MetabotEntity {mb-model-entity-id :id}  {:metabot_id (:id metabot)
                                                                     :model :dataset
                                                                     :model_id (:id mb-model4)}
                     :model/MetabotEntity {mb-metric-entity-id :id} {:metabot_id (:id metabot)
                                                                     :model :metric
                                                                     :model_id (:id mb-metric4)}]
        (perms/grant-collection-read-permissions! group-id mb-child-coll2)
        (testing "admins can see all cards"
          (let [admin-result (mt/with-test-user :crowberto
                               (metabot-v3.tools.util/metabot-scope
                                [mb-coll-entity-id mb-model-entity-id mb-metric-entity-id]))]
            (is (= {mb-model1 mb-coll-entity-id
                    mb-model2 mb-coll-entity-id
                    mb-model3 mb-coll-entity-id
                    mb-model4 mb-model-entity-id
                    mb-metric1 mb-coll-entity-id
                    mb-metric2 mb-coll-entity-id
                    mb-metric3 mb-coll-entity-id
                    mb-metric4 mb-metric-entity-id}
                   admin-result))))
        (testing "normal users can see permitted cards"
          (let [user-result (mt/with-test-user :rasta
                              (metabot-v3.tools.util/metabot-scope
                               [mb-coll-entity-id mb-model-entity-id mb-metric-entity-id]))]
            (is (= {mb-metric2 mb-coll-entity-id}
                   user-result))))))))
