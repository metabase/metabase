(ns metabase-enterprise.metabot-v3.api.metabot-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api.metabot :as metabot-v3.api.metabot]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(deftest metabot-entities-get-cards-test
  (testing "GET /api/ee/metabot-v3/metabot/:id/entities"
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
                                               (format "ee/metabot-v3/metabot/%d/entities" metabot-id))]
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
                                               (format "ee/metabot-v3/metabot/%d/entities?limit=1" metabot-id))]
            (is (= 2 (:total response)))
            (is (= 1 (count (:items response))))
            (is (= 1 (:limit response)))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (format "ee/metabot-v3/metabot/%d/entities" metabot-id)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       (format "ee/metabot-v3/metabot/%d/entities" Integer/MAX_VALUE)))))))))

(deftest metabot-entities-get-collections-test
  (testing "GET /api/ee/metabot-v3/metabot/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/MetabotEntity _ {:metabot_id metabot-id
                                             :model "collection"
                                             :model_id collection-id}]

        (testing "should return entities for a metabot"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabot/%d/entities" metabot-id))]
            (is (= #{collection-id}
                   (set (map :model_id (:items response)))))
            (is (= #{"Test Collection"} (into #{} (map :name (:items response)))))
            (is (= #{nil} (into #{} (map :collection_id (:items response)))))
            (is (= #{nil} (into #{} (map :collection_name (:items response)))))))

        (testing "should support pagination"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabot/%d/entities?limit=1" metabot-id))]
            (is (= 1 (:total response)))
            (is (= 1 (count (:items response))))
            (is (= 1 (:limit response)))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (format "ee/metabot-v3/metabot/%d/entities" metabot-id)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       (format "ee/metabot-v3/metabot/%d/entities" Integer/MAX_VALUE)))))))))

(deftest metabot-entities-put-test-add-entities
  (testing "PUT /api/ee/metabot-v3/metabot/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id
                                                  :type :model}
                     :model/Card {card-id-2 :id} {:name "Test Card 2"
                                                  :collection_id collection-id
                                                  :type :metric}]

        (testing "should add entities to metabot access list"
          (let [entities {:items [{:id card-id-1 :model "dataset"}
                                  {:id card-id-2 :model "metric"}]}]

            ;; Make the API call to add entities
            (with-redefs [metabot-v3.api.metabot/generate-sample-prompts identity]
              (mt/user-http-request :crowberto :put 204
                                    (format "ee/metabot-v3/metabot/%d/entities" metabot-id)
                                    entities))

            ;; Verify entities were added to the database
            (let [added-entities (t2/select :model/MetabotEntity
                                            :metabot_id metabot-id)]
              (is (= #{card-id-1 card-id-2}
                     (set (map :model_id added-entities))))
              (is (= [:dataset :metric] (mapv :model added-entities))))))))))

(deftest metabot-entities-put-test-add-entities-collections
  (testing "PUT /api/ee/metabot-v3/metabot/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}]

        (testing "should add entities to metabot access list"
          (let [entities {:items [{:id collection-id :model "collection"}]}]

            ;; Make the API call to add entities
            (with-redefs [metabot-v3.api.metabot/generate-sample-prompts identity]
              (mt/user-http-request :crowberto :put 204
                                    (format "ee/metabot-v3/metabot/%d/entities" metabot-id)
                                    entities))

            ;; Verify entities were added to the database
            (let [added-entities (t2/select :model/MetabotEntity
                                            :metabot_id metabot-id)]
              (is (= #{collection-id}
                     (set (map :model_id added-entities))))
              (is (= [:collection] (mapv :model added-entities))))))))))

(deftest metabot-entities-put-duplicates-test
  (testing "PUT /api/ee/metabot-v3/metabot/:id/entities"
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
            (with-redefs [metabot-v3.api.metabot/generate-sample-prompts identity]
              (mt/user-http-request :crowberto :put 204
                                    (format "ee/metabot-v3/metabot/%d/entities" metabot-id)
                                    entities))

            ;; Verify no new entities were added
            (is (= 2 (t2/count :model/MetabotEntity :metabot_id metabot-id)))))))))

(deftest metabot-entities-put-super-user-only-test
  (testing "PUT /api/ee/metabot-v3/metabot/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                     :model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}]
        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403
                                       (format "ee/metabot-v3/metabot/%d/entities" metabot-id)
                                       {:items [{:id (str card-id-1) :model "metric"}]}))))))))

(deftest metabot-entities-put-404-non-existent-test
  (testing "PUT /api/ee/metabot-v3/metabot/:id/entities"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Card {card-id-1 :id} {:name "Test Card 1"
                                                  :collection_id collection-id}]
        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404
                                       (format "ee/metabot-v3/metabot/%d/entities" Integer/MAX_VALUE)
                                       {:items [{:id (str card-id-1) :model "dataset"}]}))))))))

(deftest sample-prompts-e2e-test
  (let [mp (mt/metadata-provider)
        model-source-query (lib/query mp (lib.metadata/table mp (mt/id :products)))
        metric-source-query (-> model-source-query
                                (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating))))
                                (lib/breakout (lib/with-temporal-bucket
                                                (lib.metadata/field mp (mt/id :products :created_at)) :week)))
        metric-data  {:description "Metric description"
                      :dataset_query (lib/->legacy-MBQL metric-source-query)
                      :type :metric}
        model-data   {:description "Model desc"
                      :dataset_query (lib/->legacy-MBQL model-source-query)
                      :type :model}]
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Collection {coll-id :id}   {}
                     :model/Collection {child-id1 :id} {:location (collection/location-path coll-id)}
                     :model/Collection {child-id2 :id} {:location (collection/location-path coll-id)}
                     :model/Collection {child-id3 :id} {:location (collection/location-path coll-id child-id2)}
                     :model/Card _ (assoc model-data  :name "Model1"  :collection_id coll-id)
                     :model/Card _ (assoc metric-data :name "Metric1" :collection_id child-id1)
                     :model/Card _ (assoc model-data  :name "Model2"  :collection_id child-id2)
                     :model/Card _ (assoc metric-data :name "Metric2" :collection_id child-id3)
                     :model/Metabot {metabot-id :id} {:name "metabot"}]
        (let [entities {:items [{:id coll-id :model "collection"}]}
              prompts {"Metric1" ["metric question1" "metric question2" "metric question3"]
                       "Metric2" ["metric question4" "metric question5" "metric question6"]
                       "Model1"  ["model question1"  "model question2"  "model question3"]
                       "Model2"  ["model question4"  "model question5"  "model question6"]}
              generate-prompt (fn [promptables]
                                (map (fn [promptable]
                                       {:questions (-> promptable :name prompts)})
                                     promptables))
              prompt-generator (fn [request]
                                 (-> request
                                     (update :metrics generate-prompt)
                                     (update :tables  generate-prompt)
                                     (set/rename-keys {:metrics :metric_questions
                                                       :tables :table_questions})))]
          ;; --------------------------- Generating sample prompts ---------------------------
          (testing "should add entities to metabot access list and generate prompt suggestions"
            (with-redefs [metabot-v3.client/generate-example-questions prompt-generator]
              ;; Make the API call to add entities
              (mt/user-http-request :crowberto :put 204
                                    (format "ee/metabot-v3/metabot/%d/entities" metabot-id)
                                    entities))
            (let [entity-id     (t2/select-one-fn :id :model/MetabotEntity :metabot_id metabot-id)
                  added-prompts (t2/select [:model/MetabotPrompt [:card.name :model_name] :prompt]
                                           :metabot_entity_id entity-id
                                           {:join     [[:report_card :card] [:= :card.id :card_id]]
                                            :order-by [:metabot_prompt.id]})]
              ;; Verify prompts were added to the database
              (is (= prompts
                     (-> (group-by :model_name added-prompts)
                         (update-vals #(map :prompt %)))))))
          ;; --------------------------- Querying sample prompts ---------------------------
          (let [expected-prompts (into #{} (mapcat val) prompts)
                all-prompts (mt/user-http-request :rasta :get 200
                                                  (format "ee/metabot-v3/metabot/%d/prompt-suggestions" metabot-id))]
            (testing "can get all prompts"
              (is (= (count expected-prompts) (:total all-prompts)))
              (is (= expected-prompts  (into #{} (map :prompt) (:prompts all-prompts)))))
            (testing "can page through the prompts"
              (let [offset 3
                    limit 5
                    url (format "ee/metabot-v3/metabot/%d/prompt-suggestions?offset=%d&limit=%d"
                                metabot-id offset limit)
                    page-prompts (mt/user-http-request :rasta :get 200 url)]
                (is (= {:prompts (->> all-prompts :prompts (drop offset) (take limit))
                        :limit limit, :offset offset, :total (:total all-prompts)}
                       page-prompts))))
            (testing "can filter by model type"
              (doseq [model-type ["metric" "model"]]
                (let [url (format "ee/metabot-v3/metabot/%d/prompt-suggestions?model=%s" metabot-id model-type)
                      expected-prompts (->> all-prompts :prompts (filter (comp #{model-type} :model)))
                      filtered-prompts (mt/user-http-request :rasta :get 200 url)]
                  (is (= {:prompts expected-prompts
                          :limit nil, :offset nil, :total (count expected-prompts)}
                         filtered-prompts)))))
            (testing "can filter by model type and model ID"
              (let [selected-prompt (rand-nth (:prompts all-prompts))
                    url (format "ee/metabot-v3/metabot/%d/prompt-suggestions?model=%s&model_id=%d"
                                metabot-id (:model selected-prompt) (:model_id selected-prompt))
                    expected-prompts (->> all-prompts :prompts (filter (comp #{(:model_id selected-prompt)} :model_id)))
                    filtered-prompts (mt/user-http-request :rasta :get 200 url)]
                (is (= {:prompts expected-prompts
                        :limit nil, :offset nil, :total (count expected-prompts)}
                       filtered-prompts))))
            (testing "can return a sample"
              (let [limit 5
                    url (format "ee/metabot-v3/metabot/%d/prompt-suggestions?sample=true&limit=%d"
                                metabot-id limit)
                    expected-prompts? (fn [prompts]
                                        (and (= (count prompts) limit)
                                             (set/subset? (set prompts) (set (:prompts all-prompts)))))
                    sample-prompts (mt/user-http-request :rasta :get 200 url)]
                (is (=? {:prompts expected-prompts?
                         :limit limit, :offset nil, :total (:total all-prompts)}
                        sample-prompts))))
            ;; --------------------------- Deleting & regenerating sample prompts ---------------------------
            (let [all-prompt-ids (into #{} (map :id) (:prompts all-prompts))
                  current-prompt-ids #(t2/select-pks-set :model/MetabotPrompt
                                                         {:join [[:metabot_entity :mbe]
                                                                 [:= :mbe.id :metabot_prompt.metabot_entity_id]]
                                                          :where [:= :mbe.metabot_id metabot-id]})
                  selected-prompt (rand-nth (:prompts all-prompts))
                  url (format "ee/metabot-v3/metabot/%d/prompt-suggestions/%d" metabot-id (:id selected-prompt))
                  remaining-prompt-ids (disj all-prompt-ids (:id selected-prompt))]

              (testing "deleting a specific prompt"
                (testing "normal users cannot delete"
                  (mt/user-http-request :rasta :delete 403 url)
                  (is (= all-prompt-ids (current-prompt-ids))))
                (testing "admins can delete"
                  (mt/user-http-request :crowberto :delete 204 url)
                  (is (= remaining-prompt-ids (current-prompt-ids)))))

              (testing "generating new prompts"
                (let [url (format "ee/metabot-v3/metabot/%d/prompt-suggestions/regenerate" metabot-id)]
                  (testing "normal users are not allowed"
                    (mt/user-http-request :rasta :post 403 url)
                    (is (= remaining-prompt-ids (current-prompt-ids))))
                  (testing "admin users are allowed"
                    (with-redefs [metabot-v3.client/generate-example-questions prompt-generator]
                      (mt/user-http-request :crowberto :post 204 url)))))

              (let [new-prompt-ids (current-prompt-ids)]
                (is (= (count all-prompt-ids) (count new-prompt-ids)))
                (is (empty? (set/intersection all-prompt-ids new-prompt-ids)))
                (testing "can delete all prompts"
                  (let [url (format "ee/metabot-v3/metabot/%d/prompt-suggestions" metabot-id)]
                    (testing "normal users cannot delete"
                      (mt/user-http-request :rasta :delete 403 url)
                      (is (= new-prompt-ids (current-prompt-ids))))
                    (testing "admins can delete"
                      (mt/user-http-request :crowberto :delete 204 url)
                      (is (nil? (current-prompt-ids))))))))))))))

(deftest metabot-list-test
  (testing "GET /api/ee/metabot-v3/metabot"
    (mt/with-premium-features #{:metabot-v3}
      (with-clean-metabots
        (mt/with-temp [:model/Metabot {metabot-id-1 :id} {:name "Alpha Metabot"}
                       :model/Metabot {metabot-id-2 :id} {:name "Beta Metabot"}
                       :model/Metabot {metabot-id-3 :id} {:name "Gamma Metabot"}]

          (testing "should return all metabots in alphabetical order by name"
            (let [{response :items} (mt/user-http-request :crowberto :get 200 "ee/metabot-v3/metabot")]
              (is (= 3 (count response)))
              (is (= ["Alpha Metabot" "Beta Metabot" "Gamma Metabot"]
                     (mapv :name response)))
              (is (= [metabot-id-1 metabot-id-2 metabot-id-3]
                     (mapv :id response)))))

          (testing "should require superuser permissions"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "ee/metabot-v3/metabot")))))))))

(deftest metabot-entities-delete-collection-test
  (testing "DELETE /api/ee/metabot-v3/metabot/:id/entities/:model-type/:model-id"
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
                                (format "ee/metabot-v3/metabot/%d/entities/collection/%d"
                                        metabot-id collection-id))

          (let [remaining-entities (t2/select :model/MetabotEntity :metabot_id metabot-id)]
            (is (= 0 (count remaining-entities)))))))))

(deftest metabot-entities-delete-test
  (testing "DELETE /api/ee/metabot-v3/metabot/:id/entities/:model-type/:model-id"
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
                                (format "ee/metabot-v3/metabot/%d/entities/dataset/%d"
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
                                       (format "ee/metabot-v3/metabot/%d/entities/metric/%d"
                                               metabot-id card-id-2)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404
                                       (format "ee/metabot-v3/metabot/%d/entities/metric/%d"
                                               Integer/MAX_VALUE card-id-2)))))

        (testing "should return 204 even if entity doesn't exist"
          ;; This tests idempotency - deleting a non-existent entity should still return success
          (mt/user-http-request :crowberto :delete 204
                                (format "ee/metabot-v3/metabot/%d/entities/dataset/%d"
                                        metabot-id 99999)))))))
