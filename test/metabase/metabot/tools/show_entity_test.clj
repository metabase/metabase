(ns metabase.metabot.tools.show-entity-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.test-utils :as collections.test-utils]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.show-entity :as show-entity]
   [metabase.test :as mt]))

(deftest show-card-test
  (doseq [card-type [:question :model :metric]]
    (mt/with-temp [:model/Card card {:type card-type :name "Bird sightings"}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [result (show-entity/show-entity-tool {:entity_type (name card-type) :entity_id (:id card)})
              part   (first (:data-parts result))]
          (is (= [{:type :data
                   :data-type "shown_entity"
                   :data {:type (name card-type)
                          :id (:id card)
                          :title "Bird sightings"
                          :url (str "/" (name card-type) "/" (:id card))}}]
                 (:data-parts result)))
          (is (streaming/persistable-data-part? part))
          (is (not (contains? result :state))))))))

(deftest show-dashboard-test
  (mt/with-temp [:model/Dashboard dashboard {:name "Bird dashboard"}]
    (mt/with-current-user (mt/user->id :rasta)
      (is (= {:type "dashboard" :id (:id dashboard) :title "Bird dashboard"
              :url (str "/dashboard/" (:id dashboard))}
             (-> (show-entity/show-entity-tool {:entity_type "dashboard" :entity_id (:id dashboard)})
                 :data-parts first :data))))))

(deftest cannot-show-unreadable-entity-test
  (mt/with-temp [:model/Card card {:collection_id (collections.test-utils/personal-collection-id (mt/user->id :crowberto))}
                 :model/Dashboard dashboard {:collection_id (:collection_id card)}]
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [[entity-type entity] [["question" card] ["dashboard" dashboard]]]
        (is (thrown? clojure.lang.ExceptionInfo
                     (show-entity/show-entity-tool {:entity_type entity-type :entity_id (:id entity)})))))))

(deftest show-table-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [result (show-entity/show-entity-tool {:entity_type "table" :entity_id (mt/id :venues)})]
      (is (=? {:type "table" :id (mt/id :venues) :title "Venues" :url #"^/question#.*"}
              (-> result :data-parts first :data))))))

(deftest show-document-test
  (mt/with-premium-features #{:documents}
    (mt/with-temp [:model/Document document {:name "Bird report"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= {:type "document" :id (:id document) :title "Bird report"
                :url (str "/document/" (:id document))}
               (-> (show-entity/show-entity-tool {:entity_type "document" :entity_id (:id document)})
                   :data-parts first :data)))))))

(deftest cannot-show-unreadable-table-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-current-user (mt/user->id :rasta)
      (is (thrown? clojure.lang.ExceptionInfo
                   (show-entity/show-entity-tool {:entity_type "table" :entity_id (mt/id :venues)}))))))

(deftest cannot-show-inactive-table-test
  (mt/with-temp [:model/Table table {:db_id (mt/id) :active false}]
    (mt/with-current-user (mt/user->id :crowberto)
      (is (thrown? clojure.lang.ExceptionInfo
                   (show-entity/show-entity-tool {:entity_type "table" :entity_id (:id table)}))))))

(deftest cannot-show-archived-or-missing-entity-test
  (mt/with-temp [:model/Card card {:archived true}
                 :model/Dashboard dashboard {:archived true}]
    (mt/with-current-user (mt/user->id :crowberto)
      (doseq [[entity-type id] [["question" (:id card)] ["dashboard" (:id dashboard)] ["question" Integer/MAX_VALUE]]]
        (is (thrown? clojure.lang.ExceptionInfo
                     (show-entity/show-entity-tool {:entity_type entity-type :entity_id id})))))))

(deftest ^:parallel discovery-only-users-can-show-entities-test
  (binding [scope/*current-user-scope* scope/always-granted-scopes]
    (is (contains? (profiles/get-tools-for-profile :internal []) "show_entity"))))
