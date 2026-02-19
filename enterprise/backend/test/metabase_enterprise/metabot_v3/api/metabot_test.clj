(ns metabase-enterprise.metabot-v3.api.metabot-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.suggested-prompts :as metabot-v3.suggested-prompts]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
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

(deftest sample-prompts-e2e-test
  (mt/dataset test-data
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
                       :model/Metabot {metabot-id :id} {:name "metabot" :collection_id coll-id}]
          (let [prompts {"Metric1" ["metric question1" "metric question2" "metric question3"]
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
            (testing "should generate prompt suggestions for metabot"
              (with-redefs [metabot-v3.client/generate-example-questions prompt-generator]
                          ;; Trigger prompt generation by calling the regenerate endpoint
                (mt/user-http-request :crowberto :post 204
                                      (format "ee/metabot-v3/metabot/%d/prompt-suggestions/regenerate" metabot-id)))
              (let [added-prompts (t2/select [:model/MetabotPrompt [:card.name :model_name] :prompt]
                                             :metabot_id metabot-id
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
                    current-prompt-ids #(t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id)
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
                        (is (nil? (current-prompt-ids)))))))))))))))

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

(deftest metabot-get-single-test
  (testing "GET /api/ee/metabot-v3/metabot/:id"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                     :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                      :description "Test Description"
                                                      :use_verified_content true
                                                      :collection_id collection-id}]

        (testing "should return metabot with all fields"
          (let [response (mt/user-http-request :crowberto :get 200
                                               (format "ee/metabot-v3/metabot/%d" metabot-id))]
            (is (= metabot-id (:id response)))
            (is (= "Test Metabot" (:name response)))
            (is (= "Test Description" (:description response)))
            (is (true? (:use_verified_content response)))
            (is (= collection-id (:collection_id response)))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403
                                       (format "ee/metabot-v3/metabot/%d" metabot-id)))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404
                                       (format "ee/metabot-v3/metabot/%d" Integer/MAX_VALUE)))))))))

(deftest metabot-put-test
  (testing "PUT /api/ee/metabot-v3/metabot/:id"
    (mt/with-premium-features #{:metabot-v3 :content-verification}
      (mt/with-temp [:model/Collection {collection-id-1 :id} {:name "Collection 1"}
                     :model/Collection {collection-id-2 :id} {:name "Collection 2"}
                     :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                      :use_verified_content false
                                                      :collection_id collection-id-1}]

        (testing "should update use_verified_content field"
          (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "ee/metabot-v3/metabot/%d" metabot-id)
                                                 {:use_verified_content true})]
              (is (true? (:use_verified_content response)))
              (is (= collection-id-1 (:collection_id response))) ; Should remain unchanged
              ;; Verify in database
              (let [updated-metabot (t2/select-one :model/Metabot :id metabot-id)]
                (is (true? (:use_verified_content updated-metabot)))))))

        (testing "should update collection_id field"
          (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "ee/metabot-v3/metabot/%d" metabot-id)
                                                 {:collection_id collection-id-2})]
              (is (= collection-id-2 (:collection_id response)))
              (is (true? (:use_verified_content response))) ; Should remain from previous test
              ;; Verify in database
              (let [updated-metabot (t2/select-one :model/Metabot :id metabot-id)]
                (is (= collection-id-2 (:collection_id updated-metabot)))))))

        (testing "should update collection_id to null"
          (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "ee/metabot-v3/metabot/%d" metabot-id)
                                                 {:collection_id nil})]
              (is (= nil (:collection_id response)))
              ;; Verify in database
              (let [updated-metabot (t2/select-one :model/Metabot :id metabot-id)]
                (is (= nil (:collection_id updated-metabot)))))))

        (testing "should update all fields simultaneously"
          (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "ee/metabot-v3/metabot/%d" metabot-id)
                                                 {:use_verified_content false
                                                  :collection_id collection-id-1})]
              (is (= false (:use_verified_content response)))
              (is (= collection-id-1 (:collection_id response))))))

        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403
                                       (format "ee/metabot-v3/metabot/%d" metabot-id)
                                       {:use_verified_content true}))))

        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404
                                       (format "ee/metabot-v3/metabot/%d" Integer/MAX_VALUE)
                                       {:use_verified_content true}))))

        (testing "should prevent enabling verified content without premium feature"
          (mt/with-premium-features #{:metabot-v3}  ; Only metabot-v3, no content-verification
            (is (= "Content verification is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                   (:message (mt/user-http-request :crowberto :put 402
                                                   (format "ee/metabot-v3/metabot/%d" metabot-id)
                                                   {:use_verified_content true}))))))))))

(deftest metabot-prompt-regeneration-on-config-change-test
  (mt/dataset test-data
    (testing "PUT /api/ee/metabot-v3/metabot/:id should regenerate prompts when config changes"
      (mt/with-premium-features #{:metabot-v3 :content-verification}
        (let [metric-query {:type :query, :database (mt/id), :query {:source-table (mt/id :products)}}
              model-query {:type :query, :database (mt/id), :query {:source-table (mt/id :products)}}]
          (mt/with-temp [:model/Collection {collection-id-1 :id} {:name "Collection 1"}
                         :model/Collection {collection-id-2 :id} {:name "Collection 2"}
                         :model/Card {card-id-1 :id} {:name "Test Metric Card"
                                                      :type :metric
                                                      :dataset_query metric-query}
                         :model/Card {card-id-2 :id} {:name "Test Model Card"
                                                      :type :model
                                                      :dataset_query model-query}
                         :model/Card {card-id-3 :id} {:name "Test Card for New Prompt"
                                                      :type :metric
                                                      :dataset_query metric-query}
                         :model/Card {card-id-4 :id} {:name "Test Card for Collection Change"
                                                      :type :model
                                                      :dataset_query model-query}
                         :model/Card {card-id-5 :id} {:name "Test Card for Baseline"
                                                      :type :metric
                                                      :dataset_query metric-query}
                         :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                          :use_verified_content false
                                                          :collection_id collection-id-1}
                         :model/MetabotPrompt {prompt-id-1 :id} {:metabot_id metabot-id
                                                                 :prompt "old prompt 1"
                                                                 :model :metric
                                                                 :card_id card-id-1}
                         :model/MetabotPrompt {prompt-id-2 :id} {:metabot_id metabot-id
                                                                 :prompt "old prompt 2"
                                                                 :model :model
                                                                 :card_id card-id-2}]

            (let [original-prompt-ids #{prompt-id-1 prompt-id-2}]

              (testing "should regenerate prompts when use_verified_content changes"
                (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts
                              (fn [metabot-id]
                                (t2/insert! :model/MetabotPrompt {:metabot_id metabot-id
                                                                  :prompt "new prompt after verified change"
                                                                  :model :metric
                                                                  :card_id card-id-3}))]
                  (mt/user-http-request :crowberto :put 200
                                        (format "ee/metabot-v3/metabot/%d" metabot-id)
                                        {:use_verified_content true})

                            ;; Verify old prompts were deleted and new ones created
                  (let [current-prompts (t2/select :model/MetabotPrompt :metabot_id metabot-id)
                        current-prompt-ids (set (map :id current-prompts))]
                    (is (= 1 (count current-prompts)))
                    (is (empty? (set/intersection original-prompt-ids current-prompt-ids)))
                    (is (= "new prompt after verified change" (:prompt (first current-prompts)))))))

              (testing "should regenerate prompts when collection_id changes"
                (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts
                              (fn [metabot-id]
                                (t2/insert! :model/MetabotPrompt {:metabot_id metabot-id
                                                                  :prompt "new prompt after collection change"
                                                                  :model :model
                                                                  :card_id card-id-4}))]
                  (mt/user-http-request :crowberto :put 200
                                        (format "ee/metabot-v3/metabot/%d" metabot-id)
                                        {:collection_id collection-id-2})

                            ;; Verify prompts were regenerated again
                  (let [current-prompts (t2/select :model/MetabotPrompt :metabot_id metabot-id)]
                    (is (= 1 (count current-prompts)))
                    (is (= "new prompt after collection change" (:prompt (first current-prompts)))))))

              (testing "should NOT regenerate prompts when no relevant fields change"
                          ;; First, establish a baseline
                (t2/delete! :model/MetabotPrompt :metabot_id metabot-id)
                (t2/insert! :model/MetabotPrompt {:metabot_id metabot-id
                                                  :prompt "baseline prompt"
                                                  :model :metric
                                                  :card_id card-id-5})
                (let [baseline-prompts (t2/select :model/MetabotPrompt :metabot_id metabot-id)
                      baseline-ids (set (map :id baseline-prompts))]

                            ;; Make a PUT request that doesn't change verified content or collection_id
                            ;; (This would be if we add other fields to update in the future)
                  (with-redefs [metabot-v3.suggested-prompts/generate-sample-prompts
                                (fn [_] (throw (Exception. "Should not be called")))]
                    (mt/user-http-request :crowberto :put 200
                                          (format "ee/metabot-v3/metabot/%d" metabot-id)
                                          {:use_verified_content true  ; Same as current value
                                           :collection_id collection-id-2})) ; Same as current value

                            ;; Verify prompts were NOT changed
                  (let [current-prompts (t2/select :model/MetabotPrompt :metabot_id metabot-id)
                        current-ids (set (map :id current-prompts))]
                    (is (= baseline-ids current-ids))
                    (is (= "baseline prompt" (:prompt (first current-prompts))))))))))))))

(deftest prompt-suggestions-collection-permissions-test
  (testing "GET /api/ee/metabot-v3/metabot/:id/prompt-suggestions respects collection permissions"
    (mt/dataset test-data
      (mt/with-premium-features #{:metabot-v3}
        (let [mp (mt/metadata-provider)
              model-query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
          (mt/with-temp [:model/Collection {accessible-coll-id :id} {:name "Accessible Collection"}
                         :model/Collection {restricted-coll-id :id} {:name "Restricted Collection"}
                         :model/Card {accessible-card-id :id} {:name "Accessible Model"
                                                               :type :model
                                                               :collection_id accessible-coll-id
                                                               :dataset_query model-query}
                         :model/Card {restricted-card-id :id} {:name "Restricted Model"
                                                               :type :model
                                                               :collection_id restricted-coll-id
                                                               :dataset_query model-query}
                         :model/Metabot {metabot-id :id} {:name "Test Metabot"}
                         :model/MetabotPrompt _ {:metabot_id metabot-id
                                                 :prompt "Accessible prompt"
                                                 :model :model
                                                 :card_id accessible-card-id}
                         :model/MetabotPrompt _ {:metabot_id metabot-id
                                                 :prompt "Restricted prompt"
                                                 :model :model
                                                 :card_id restricted-card-id}]
            ;; Revoke default All Users access to restricted collection
            (perms/revoke-collection-permissions! (perms-group/all-users) restricted-coll-id)

            (testing "admin sees all prompts"
              (let [response (mt/user-http-request :crowberto :get 200
                                                   (format "ee/metabot-v3/metabot/%d/prompt-suggestions" metabot-id))
                    prompts (set (map :prompt (:prompts response)))]
                (is (= 2 (:total response)))
                (is (contains? prompts "Accessible prompt"))
                (is (contains? prompts "Restricted prompt"))))

            (testing "non-admin user only sees prompts for cards in accessible collections"
              (let [response (mt/user-http-request :rasta :get 200
                                                   (format "ee/metabot-v3/metabot/%d/prompt-suggestions" metabot-id))
                    prompts (set (map :prompt (:prompts response)))]
                (is (= 1 (:total response)))
                (is (contains? prompts "Accessible prompt"))
                (is (not (contains? prompts "Restricted prompt")))))))))))
