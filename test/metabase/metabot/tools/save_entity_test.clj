(ns metabase.metabot.tools.save-entity-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.save-entity :as save-entity]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- chart-memory
  "A memory atom holding one generated chart `c-1` over a real (legacy) query."
  []
  (atom {:state   {:queries {"q-1" (mt/mbql-query venues)}
                   :charts  {"c-1" {:chart_id "c-1"
                                    :query_id "q-1"
                                    :queries  [(mt/mbql-query venues)]
                                    :visualization_settings {:chart_type :bar}}}}
         :context {}}))

(defn- save! [destination]
  (binding [shared/*memory-atom* (chart-memory)]
    (save-entity/save-entity-tool
     {:chart_id    "c-1"
      :name        "Venues by price"
      :description "Count of venues grouped by price."
      :destination destination})))

(deftest save-to-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {:name "Sales analytics"}]
        (let [result (save! {:target_type "collection" :collection_id (:id coll)})
              part   (first (:data-parts result))
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (testing "creates a saved question in the target collection"
            (is (some? card))
            (is (= "Venues by price" (:name card)))
            (is (= :bar (:display card)))
            (is (= (:id coll) (:collection_id card))))
          (testing "emits an entity_saved data part pointing at the chart and location"
            (is (= "entity_saved" (:data-type part)))
            (is (= "c-1" (get-in part [:data :entity_id])))
            (is (= (:id card) (get-in part [:data :card_id])))
            (is (= "Venues by price" (get-in part [:data :name])))
            (is (= (str "/question/" (:id card)) (get-in part [:data :card_url])))
            (is (= {:type "collection" :id (:id coll) :name "Sales analytics"
                    :url (str "/collection/" (:id coll))}
                   (get-in part [:data :location])))))))))

(deftest records-save-in-conversation-state-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {:name "Sales analytics"}]
        (let [memory (chart-memory)]
          (binding [shared/*memory-atom* memory]
            (save-entity/save-entity-tool
             {:chart_id    "c-1"
              :name        "Venues by price"
              :description "Count of venues grouped by price."
              :destination {:target_type "collection" :collection_id (:id coll)}}))
          (testing "records the saved card + location in agent memory so it persists in the conversation"
            (let [saved (get-in @memory [:state :savedCharts "c-1"])]
              (is (some? (:card_id saved)))
              (is (= {:type "collection" :id (:id coll) :name "Sales analytics"
                      :url (str "/collection/" (:id coll))}
                     (:location saved))))))))))

(deftest save-to-root-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [result (save! {:target_type "collection" :collection_id nil})
            card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
        (testing "an explicit null collection_id saves to the root collection"
          (is (nil? (:collection_id card)))
          (is (= "/collection/root" (get-in result [:data-parts 0 :data :location :url]))))))))

(deftest save-to-personal-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [result (save! {:target_type "collection"})
            card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
        (testing "omitting collection_id defaults to the user's personal collection"
          (is (= (t2/select-one-fn :id :model/Collection :personal_owner_id (mt/user->id :crowberto))
                 (:collection_id card))))))))

(deftest save-to-dashboard-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}
                     :model/Dashboard  dash {:name "Ops" :collection_id (:id coll)}]
        (let [result (save! {:target_type "dashboard" :dashboard_id (:id dash)})
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (testing "creates a dashboard question and places it on the dashboard"
            (is (= (:id dash) (:dashboard_id card)))
            (is (t2/exists? :model/DashboardCard :dashboard_id (:id dash) :card_id (:id card))))
          (testing "the location points at the dashboard"
            (is (= {:type "dashboard" :id (:id dash) :name "Ops"
                    :url (str "/dashboard/" (:id dash))}
                   (get-in result [:data-parts 0 :data :location])))))))))

(deftest unknown-chart-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "a missing chart id returns an agent-facing error and creates nothing"
      (let [result (binding [shared/*memory-atom* (chart-memory)]
                     (save-entity/save-entity-tool
                      {:chart_id    "does-not-exist"
                       :name        "x"
                       :description "y"
                       :destination {:target_type "collection" :collection_id nil}}))]
        (is (nil? (:data-parts result)))
        (is (re-find #"No generated chart found" (:output result)))))))
