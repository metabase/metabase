(ns metabase-enterprise.metabot-v3.api-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.tools.api :as metabot-v3.tools.api]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro with-clean-metabots
  "Macro to reset the Metabots table to an empty state before a test and restore it after the test runs."
  [& body]
  `(let [original-entities# (t2/select [:model/Metabot])]
     (try
       (t2/delete! :model/Metabot)
       ~@body
       (finally
         (t2/delete! :model/Metabot)
         (when (seq original-entities#)
           (t2/insert! :model/Metabot original-entities#))))))

(set! *warn-on-reflection* true)

(deftest metabot-entities-get-cards-test
  (testing "GET /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-name-1 :name
                                  card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}
                     :model/Card {card-name-2 :name
                                  card-id-2 :id} {:name "Test Card 2"
                                                  :collection_id nil}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model "dataset"
                                             :model_id card-id-1}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model "dataset"
                                             :model_id card-id-2}]

        (testing "should return entities for a metabot"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabots/%d/entities" metabot-id))]
            (is (= 2 (:total response)))
            (is (= 2 (count (:items response))))
            (is (= #{card-name-1 card-name-2}
                   (set (map :name (:items response)))))
            (is (= #{card-id-1 card-id-2}
                   (set (map :model_id (:items response)))))
            (is (= #{collection-id "root"} (into #{} (map :collection_id (:items response)))))
            (is (= #{"Test Collection" "Our analytics"} (into #{} (map :collection_name (:items response)))))))

        (testing "should support pagination"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabots/%d/entities?limit=1" metabot-id))]
            (is (= 2 (:total response)))
            (is (= 1 (count (:items response))))
            (is (= 1 (:limit response)))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (format "ee/metabot-v3/metabots/%d/entities" metabot-id)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       (format "ee/metabot-v3/metabots/%d/entities" Integer/MAX_VALUE)))))))))

(deftest metabot-entities-get-collections-test
  (testing "GET /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model "collection"
                                             :model_id collection-id}]

        (testing "should return entities for a metabot"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabots/%d/entities" metabot-id))]
            (is (= #{collection-id}
                   (set (map :model_id (:items response)))))
            (is (= #{"Test Collection"} (into #{} (map :name (:items response)))))
            (is (= #{nil} (into #{} (map :collection_id (:items response)))))
            (is (= #{nil} (into #{} (map :collection_name (:items response)))))))

        (testing "should support pagination"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabots/%d/entities?limit=1" metabot-id))]
            (is (= 1 (:total response)))
            (is (= 1 (count (:items response))))
            (is (= 1 (:limit response)))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (format "ee/metabot-v3/metabots/%d/entities" metabot-id)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       (format "ee/metabot-v3/metabots/%d/entities" Integer/MAX_VALUE)))))))))
(deftest metabot-entities-put-test-add-entities
  (testing "PUT /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}
                     :model/Card {card-id-2 :id} {:name "Test Card 2"
                                                  :collection_id collection-id}]

        (testing "should add entities to metabot access list"
          (let [entities {:items [{:id card-id-1 :model "dataset"}
                                  {:id card-id-2 :model "dataset"}]}]

            ;; Make the API call to add entities
            (mt/user-http-request :crowberto :put 204
                                  (format "ee/metabot-v3/metabots/%d/entities" metabot-id)
                                  entities)

            ;; Verify entities were added to the database
            (let [added-entities (t2/select :model/MetabotEntity
                                            :metabot_id metabot-id)]
              (is (= #{card-id-1 card-id-2}
                     (set (map :model_id added-entities))))
              (is (= [:dataset :dataset] (mapv :model added-entities))))))))))

(deftest metabot-entities-put-test-add-entities-collections
  (testing "PUT /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}]

        (testing "should add entities to metabot access list"
          (let [entities {:items [{:id collection-id :model "collection"}]}]

            ;; Make the API call to add entities
            (mt/user-http-request :crowberto :put 204
                                  (format "ee/metabot-v3/metabots/%d/entities" metabot-id)
                                  entities)

            ;; Verify entities were added to the database
            (let [added-entities (t2/select :model/MetabotEntity
                                            :metabot_id metabot-id)]
              (is (= #{collection-id}
                     (set (map :model_id added-entities))))
              (is (= [:collection] (mapv :model added-entities))))))))))

(deftest metabot-entities-put-duplicates-test
  (testing "PUT /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}
                     :model/Card {card-id-2 :id} {:name "Test Card 2"
                                                  :collection_id collection-id}
                     :model/MetabotEntity _ {:metabot_id metabot-id :model_id card-id-1 :model "metric"}
                     :model/MetabotEntity _ {:metabot_id metabot-id :model_id card-id-2 :model "dataset"}]
        (testing "should not add duplicate entities"
          (let [entities {:items [{:id card-id-1 :model "metric"}]}] ;; This entity already exists

            ;; Make the API call again with an existing entity
            (mt/user-http-request :crowberto :put 204
                                  (format "ee/metabot-v3/metabots/%d/entities" metabot-id)
                                  entities)

            ;; Verify no new entities were added
            (is (= 2 (t2/count :model/MetabotEntity :metabot_id metabot-id)))))))))

(deftest metabot-entities-put-super-user-only-test
  (testing "PUT /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}]
        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403
                                       (format "ee/metabot-v3/metabots/%d/entities" metabot-id)
                                       {:items [{:id (str card-id-1) :model "metric"}]}))))))))

(deftest metabot-entities-put-404-non-existent-test
  (testing "PUT /api/ee/metabot-v3/metabots/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}]
        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404
                                       (format "ee/metabot-v3/metabots/%d/entities" Integer/MAX_VALUE)
                                       {:items [{:id (str card-id-1) :model "dataset"}]}))))))))

(deftest metabots-list-test
  (testing "GET /api/ee/metabot-v3/metabots"
    (mt/with-premium-features #{:metabot-v3}
      (with-clean-metabots
        (mt/with-temp [:model/Metabot {metabot-id-1 :id} {:name "Alpha Metabot"}
                       :model/Metabot {metabot-id-2 :id} {:name "Beta Metabot"}
                       :model/Metabot {metabot-id-3 :id} {:name "Gamma Metabot"}]

          (testing "should return all metabots in alphabetical order by name"
            (let [{response :items} (mt/user-http-request :crowberto :get 200 "ee/metabot-v3/metabots")]
              (is (= 3 (count response)))
              (is (= ["Alpha Metabot" "Beta Metabot" "Gamma Metabot"]
                     (mapv :name response)))
              (is (= [metabot-id-1 metabot-id-2 metabot-id-3]
                     (mapv :id response)))))

          (testing "should require superuser permissions"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "ee/metabot-v3/metabots")))))))))

(deftest metabot-entities-delete-collection-test
  (testing "DELETE /api/ee/metabot-v3/metabots/:id/entities/:model-type/:model-id"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model_id collection-id
                                             :model "collection"}]

        (testing "should delete the specified entity"
          (is (= 1 (t2/count :model/MetabotEntity :metabot_id metabot-id)))

          ;; Delete one entity
          (mt/user-http-request :crowberto :delete 204
                                (format "ee/metabot-v3/metabots/%d/entities/collection/%d"
                                        metabot-id collection-id))

          (let [remaining-entities (t2/select :model/MetabotEntity :metabot_id metabot-id)]
            (is (= 0 (count remaining-entities)))))))))

(deftest metabot-entities-delete-test
  (testing "DELETE /api/ee/metabot-v3/metabots/:id/entities/:model-type/:model-id"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}
                     :model/Card {card-id-2 :id} {:name "Test Card 2"
                                                  :collection_id collection-id}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model_id card-id-1
                                             :model "dataset"}
                     :model/MetabotEntity {entity-id-2 :id} {:metabot_id metabot-id
                                                             :model_id card-id-2
                                                             :model "metric"}]

        (testing "should delete the specified entity"
          ;; Verify both entities exist before deletion
          (is (= 2 (t2/count :model/MetabotEntity :metabot_id metabot-id)))

          ;; Delete one entity
          (mt/user-http-request :crowberto :delete 204
                                (format "ee/metabot-v3/metabots/%d/entities/dataset/%d"
                                        metabot-id card-id-1))

          ;; Verify only one entity remains and it's the correct one
          (let [remaining-entities (t2/select :model/MetabotEntity :metabot_id metabot-id)]
            (is (= 1 (count remaining-entities)))
            (is (= entity-id-2 (:id (first remaining-entities))))
            (is (= card-id-2 (:model_id (first remaining-entities))))
            (is (= :metric (:model (first remaining-entities))))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403
                                       (format "ee/metabot-v3/metabots/%d/entities/metric/%d"
                                               metabot-id card-id-2)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404
                                       (format "ee/metabot-v3/metabots/%d/entities/metric/%d"
                                               Integer/MAX_VALUE card-id-2)))))

        (testing "should return 204 even if entity doesn't exist"
          ;; This tests idempotency - deleting a non-existent entity should still return success
          (mt/user-http-request :crowberto :delete 204
                                (format "ee/metabot-v3/metabots/%d/entities/dataset/%d"
                                        metabot-id 99999)))))))

(deftest agent-test
  (let [ai-requests (atom [])
        conversation-id (str (random-uuid))
        question "what can you do?"
        navigation-target "url"
        historical-message {:role "user", :content "hello?"}
        agent-message {:role :assistant, :navigate-to navigation-target}
        agent-state {:key "value"}]
    (mt/with-premium-features #{:metabot-v3}
      (with-redefs [metabot-v3.client/request (fn [e]
                                                (swap! ai-requests conj e)
                                                {:messages [agent-message]
                                                 :state agent-state})]
        (testing "Trivial request"
          (doseq [metabot-id [nil (str (random-uuid))]]
            (reset! ai-requests [])
            (let [response (mt/user-http-request :rasta :post 200 "ee/metabot-v3/v2/agent"
                                                 (-> {:message question
                                                      :context {}
                                                      :conversation_id conversation-id
                                                      :history [historical-message]
                                                      :state {}}
                                                     (m/assoc-some :metabot_id metabot-id)))]
              (is (=? [{:context {:current_user_time (every-pred string? java.time.Instant/parse)}
                        :messages [(update historical-message :role keyword) {:role :user, :content question}]
                        :state {}
                        :conversation-id conversation-id
                        :profile-id (when-not metabot-id
                                      (get-in metabot-v3.config/metabot-config
                                              [metabot-v3.config/internal-metabot-id :profile-id]))
                        :session-id (fn [session-id]
                                      (when-let [token (#'metabot-v3.tools.api/decode-ai-service-token session-id)]
                                        (and (= (:metabot-id token) (or metabot-id
                                                                        metabot-v3.config/internal-metabot-id))
                                             (= (:user token) (mt/user->id :rasta)))))}]
                      @ai-requests))
              (is (=? {:reactions [{:type "metabot.reaction/redirect", :url navigation-target}]
                       :history [historical-message
                                 {:role "user", :content question}
                                 (update agent-message :role name)]
                       :state agent-state
                       :conversation_id conversation-id}
                      response)))))))))
