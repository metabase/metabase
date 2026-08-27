(ns metabase.metabot.api.metabot-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.example-question-generator :as metabot.example-question-generator]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.suggested-prompts :as metabot.suggested-prompts]
   [metabase.metabot.task.suggested-prompts-refresh :as metabot.suggested-prompts-refresh]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.premium-features.core :as premium-features]
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
            (let [response (with-redefs [metabot.example-question-generator/generate-example-questions
                                         prompt-generator]
                             ;; Trigger prompt generation by calling the regenerate endpoint
                             (mt/user-http-request
                              :crowberto :post 200
                              (format "metabot/metabot/%d/prompt-suggestions/regenerate" metabot-id)))
                  added-prompts (t2/select [:model/MetabotPrompt [:card.name :model_name] :prompt]
                                           :metabot_id metabot-id
                                           {:join     [[:report_card :card] [:= :card.id :card_id]]
                                            :order-by [:metabot_prompt.id]})]
              (is (=? {:status       "generated"
                       :prompt_count (reduce + (map count (vals prompts)))}
                      response))
              ;; Verify prompts were added to the database
              (is (= prompts
                     (-> (group-by :model_name added-prompts)
                         (update-vals #(map :prompt %)))))
              ;; And that :prompt_count in the response matches the actual DB row count, not
              ;; just the count the mock declared it would generate.
              (is (= (:prompt_count response) (count added-prompts)))))
          ;; --------------------------- Querying sample prompts ---------------------------
          (let [expected-prompts (into #{} (mapcat val) prompts)
                all-prompts (mt/user-http-request :rasta :get 200
                                                  (format "metabot/metabot/%d/prompt-suggestions" metabot-id))]
            (testing "can get all prompts"
              (is (= (count expected-prompts) (:total all-prompts)))
              (is (= expected-prompts  (into #{} (map :prompt) (:prompts all-prompts)))))
            (testing "can page through the prompts"
              (let [offset 3
                    limit 5
                    url (format "metabot/metabot/%d/prompt-suggestions?offset=%d&limit=%d"
                                metabot-id offset limit)
                    page-prompts (mt/user-http-request :rasta :get 200 url)]
                (is (= {:prompts (->> all-prompts :prompts (drop offset) (take limit))
                        :limit limit, :offset offset, :total (:total all-prompts)}
                       page-prompts))))
            (testing "can filter by model type"
              (doseq [model-type ["metric" "model"]]
                (let [url (format "metabot/metabot/%d/prompt-suggestions?model=%s" metabot-id model-type)
                      expected-prompts (->> all-prompts :prompts (filter (comp #{model-type} :model)))
                      filtered-prompts (mt/user-http-request :rasta :get 200 url)]
                  (is (= {:prompts expected-prompts
                          :limit nil, :offset nil, :total (count expected-prompts)}
                         filtered-prompts)))))
            (testing "can filter by model type and model ID"
              (let [selected-prompt (rand-nth (:prompts all-prompts))
                    url (format "metabot/metabot/%d/prompt-suggestions?model=%s&model_id=%d"
                                metabot-id (:model selected-prompt) (:model_id selected-prompt))
                    expected-prompts (->> all-prompts :prompts (filter (comp #{(:model_id selected-prompt)} :model_id)))
                    filtered-prompts (mt/user-http-request :rasta :get 200 url)]
                (is (= {:prompts expected-prompts
                        :limit nil, :offset nil, :total (count expected-prompts)}
                       filtered-prompts))))
            (testing "can return a sample"
              (let [limit 5
                    url (format "metabot/metabot/%d/prompt-suggestions?sample=true&limit=%d"
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
                  url (format "metabot/metabot/%d/prompt-suggestions/%d" metabot-id (:id selected-prompt))
                  remaining-prompt-ids (disj all-prompt-ids (:id selected-prompt))]
              (testing "deleting a specific prompt"
                (testing "normal users cannot delete"
                  (mt/user-http-request :rasta :delete 403 url)
                  (is (= all-prompt-ids (current-prompt-ids))))
                (testing "admins can delete"
                  (mt/user-http-request :crowberto :delete 204 url)
                  (is (= remaining-prompt-ids (current-prompt-ids)))))
              (testing "generating new prompts"
                (let [url (format "metabot/metabot/%d/prompt-suggestions/regenerate" metabot-id)]
                  (testing "normal users are not allowed"
                    (mt/user-http-request :rasta :post 403 url)
                    (is (= remaining-prompt-ids (current-prompt-ids))))
                  (testing "admin users are allowed"
                    (with-redefs [metabot.example-question-generator/generate-example-questions prompt-generator]
                      (is (=? {:status "generated" :prompt_count pos-int?}
                              (mt/user-http-request :crowberto :post 200 url)))))))
              (let [new-prompt-ids (current-prompt-ids)]
                (is (= (count all-prompt-ids) (count new-prompt-ids)))
                (is (empty? (set/intersection all-prompt-ids new-prompt-ids)))
                (testing "can delete all prompts"
                  (let [url (format "metabot/metabot/%d/prompt-suggestions" metabot-id)]
                    (testing "normal users cannot delete"
                      (mt/user-http-request :rasta :delete 403 url)
                      (is (= new-prompt-ids (current-prompt-ids))))
                    (testing "admins can delete"
                      (mt/user-http-request :crowberto :delete 204 url)
                      (is (nil? (current-prompt-ids))))))))))))))

(deftest metabot-list-test
  (testing "GET /api/metabot/metabot"
    (with-clean-metabots
      (mt/with-temp [:model/Metabot {metabot-id-1 :id} {:name "Alpha Metabot"}
                     :model/Metabot {metabot-id-2 :id} {:name "Beta Metabot"}
                     :model/Metabot {metabot-id-3 :id} {:name "Gamma Metabot"}]
        (testing "should return all metabots in alphabetical order by name"
          (let [{response :items} (mt/user-http-request :crowberto :get 200 "metabot/metabot")]
            (is (= 3 (count response)))
            (is (= ["Alpha Metabot" "Beta Metabot" "Gamma Metabot"]
                   (mapv :name response)))
            (is (= [metabot-id-1 metabot-id-2 metabot-id-3]
                   (mapv :id response)))))
        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "metabot/metabot"))))))))

(deftest metabot-get-single-test
  (testing "GET /api/metabot/metabot/:id"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                   :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                    :description "Test Description"
                                                    :use_verified_content true
                                                    :collection_id collection-id}]
      (testing "should return metabot with all fields"
        (let [response (mt/user-http-request :crowberto :get 200
                                             (format "metabot/metabot/%d" metabot-id))]
          (is (= metabot-id (:id response)))
          (is (= "Test Metabot" (:name response)))
          (is (= "Test Description" (:description response)))
          (is (true? (:use_verified_content response)))
          (is (= collection-id (:collection_id response)))))
      (testing "should require superuser permissions"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403
                                     (format "metabot/metabot/%d" metabot-id)))))
      (testing "should return 404 for non-existent metabot"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404
                                     (format "metabot/metabot/%d" Integer/MAX_VALUE))))))))

(deftest metabot-put-test
  (testing "PUT /api/metabot/metabot/:id"
    (mt/with-premium-features #{:content-verification}
      (mt/with-temp [:model/Collection {collection-id-1 :id} {:name "Collection 1"}
                     :model/Collection {collection-id-2 :id} {:name "Collection 2"}
                     :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                      :use_verified_content false
                                                      :collection_id collection-id-1}]
        (testing "should update use_verified_content field"
          (mt/with-dynamic-fn-redefs [metabot.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "metabot/metabot/%d" metabot-id)
                                                 {:use_verified_content true})]
              (is (true? (:use_verified_content response)))
              (is (= collection-id-1 (:collection_id response))) ; Should remain unchanged
              ;; Verify in database
              (let [updated-metabot (t2/select-one :model/Metabot :id metabot-id)]
                (is (true? (:use_verified_content updated-metabot)))))))
        (testing "should update collection_id field"
          (mt/with-dynamic-fn-redefs [metabot.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "metabot/metabot/%d" metabot-id)
                                                 {:collection_id collection-id-2})]
              (is (= collection-id-2 (:collection_id response)))
              (is (true? (:use_verified_content response))) ; Should remain from previous test
              ;; Verify in database
              (let [updated-metabot (t2/select-one :model/Metabot :id metabot-id)]
                (is (= collection-id-2 (:collection_id updated-metabot)))))))
        (testing "should update collection_id to null"
          (mt/with-dynamic-fn-redefs [metabot.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "metabot/metabot/%d" metabot-id)
                                                 {:collection_id nil})]
              (is (= nil (:collection_id response)))
              ;; Verify in database
              (let [updated-metabot (t2/select-one :model/Metabot :id metabot-id)]
                (is (= nil (:collection_id updated-metabot)))))))
        (testing "should update all fields simultaneously"
          (mt/with-dynamic-fn-redefs [metabot.suggested-prompts/generate-sample-prompts (constantly nil)]
            (let [response (mt/user-http-request :crowberto :put 200
                                                 (format "metabot/metabot/%d" metabot-id)
                                                 {:use_verified_content false
                                                  :collection_id collection-id-1})]
              (is (= false (:use_verified_content response)))
              (is (= collection-id-1 (:collection_id response))))))
        (testing "should require superuser permissions"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403
                                       (format "metabot/metabot/%d" metabot-id)
                                       {:use_verified_content true}))))
        (testing "should return 404 for non-existent metabot"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :put 404
                                       (format "metabot/metabot/%d" Integer/MAX_VALUE)
                                       {:use_verified_content true}))))
        (testing "should prevent enabling verified content without premium feature"
          (mt/with-premium-features #{} ; no content-verification
            (is (= "Content verification is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                   (:message (mt/user-http-request :crowberto :put 402
                                                   (format "metabot/metabot/%d" metabot-id)
                                                   {:use_verified_content true}))))))))))

;; PUT now schedules a background refresh (see suggested-prompts-refresh) instead of regenerating
;; inline, so the managed-AI lock / TOCTOU / rollback behavior is covered in
;; metabase.metabot.task.suggested-prompts-refresh-test rather than here.

(deftest metabot-prompt-regenerate-returns-free-trial-limit-error-when-managed-provider-is-locked-test
  (mt/dataset test-data
    (let [model-query {:type :query, :database (mt/id), :query {:source-table (mt/id :products)}}]
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                         "metabase/anthropic/claude-sonnet-4-6"]
        (mt/with-temp [:model/Metabot {metabot-id :id} {:name "Test Metabot"}
                       :model/Card {card-id :id} {:name "Test Model Card"
                                                  :type :model
                                                  :dataset_query model-query}
                       :model/MetabotPrompt {prompt-id :id} {:metabot_id metabot-id
                                                             :prompt "existing prompt"
                                                             :model :model
                                                             :card_id card-id}]
          (mt/with-dynamic-fn-redefs [premium-features/token-status
                                      (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                                 :is-locked   true}}})
                                      metabot.suggested-prompts/delete-all-metabot-prompts
                                      (fn [& _]
                                        (throw (ex-info "should not delete prompts" {})))
                                      metabot.suggested-prompts/generate-sample-prompts
                                      (fn [& _]
                                        (throw (ex-info "should not generate prompts" {})))]
            (let [response (mt/user-http-request :crowberto :post 402
                                                 (format "metabot/metabot/%d/prompt-suggestions/regenerate" metabot-id))]
              (is (= "You've used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key."
                     (:message response))))
            (is (= #{prompt-id}
                   (t2/select-pks-set :model/MetabotPrompt :metabot_id metabot-id)))))))))

(deftest metabot-prompt-regenerate-empty-states-test
  (testing "POST /prompt-suggestions/regenerate returns a structured outcome so the UI can"
    (testing "distinguish a metabot whose library has no models or metrics from a real error"
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Empty Library"}
                     :model/Metabot    {metabot-id :id}    {:name          "Empty metabot"
                                                            :collection_id collection-id}]
        ;; No cards in the collection — the LLM should never be called.
        (mt/with-dynamic-fn-redefs [metabot.example-question-generator/generate-example-questions
                                    (fn [& _] (throw (ex-info "LLM should not be called for an empty library" {})))]
          (is (= {:status "no-library-content"}
                 (mt/user-http-request :crowberto :post 200
                                       (format "metabot/metabot/%d/prompt-suggestions/regenerate" metabot-id)))))))
    (testing "distinguish 'LLM produced nothing' from 'LLM errored'"
      (mt/dataset test-data
        (let [model-query {:type :query :database (mt/id) :query {:source-table (mt/id :products)}}]
          (mt/with-temp [:model/Collection {collection-id :id} {:name "Library with a model"}
                         :model/Card       {card-id :id}       {:name          "Products model"
                                                                :type          :model
                                                                :dataset_query model-query
                                                                :collection_id collection-id}
                         :model/Metabot    {metabot-id :id}    {:name          "Productive metabot"
                                                                :collection_id collection-id}]
            (mt/with-dynamic-fn-redefs [metabot.example-question-generator/generate-example-questions
                                        (constantly {:table_questions  [{:questions []}]
                                                     :metric_questions []})]
              (is (= {:status "ai-produced-no-prompts"}
                     (mt/user-http-request :crowberto :post 200
                                           (format "metabot/metabot/%d/prompt-suggestions/regenerate" metabot-id))))
              (is (empty? (t2/select :model/MetabotPrompt :metabot_id metabot-id))
                  "no prompts should be persisted when the LLM returned none")
              ;; Reference the bound card so kondo doesn't flag it as unused.
              (is (pos-int? card-id)))))))))

(deftest metabot-prompt-regeneration-on-config-change-test
  (testing "PUT /api/metabot/metabot/:id schedules a background prompt refresh when the content scope changes"
    (mt/with-premium-features #{:content-verification}
      (mt/with-temp [:model/Collection {collection-id-1 :id} {:name "Collection 1"}
                     :model/Collection {collection-id-2 :id} {:name "Collection 2"}
                     :model/Metabot {metabot-id :id} {:name "Test Metabot"
                                                      :use_verified_content false
                                                      :collection_id collection-id-1}]
        (let [scheduled (atom [])]
          (mt/with-dynamic-fn-redefs [metabot.suggested-prompts-refresh/schedule-refresh!
                                      (fn [id] (swap! scheduled conj id))]
            (testing "schedules a refresh when use_verified_content changes"
              (reset! scheduled [])
              (mt/user-http-request :crowberto :put 200
                                    (format "metabot/metabot/%d" metabot-id)
                                    {:use_verified_content true})
              (is (= [metabot-id] @scheduled)))
            (testing "schedules a refresh when collection_id changes"
              (reset! scheduled [])
              (mt/user-http-request :crowberto :put 200
                                    (format "metabot/metabot/%d" metabot-id)
                                    {:collection_id collection-id-2})
              (is (= [metabot-id] @scheduled)))
            (testing "does NOT schedule a refresh when no relevant field changes"
              (reset! scheduled [])
              (mt/user-http-request :crowberto :put 200
                                    (format "metabot/metabot/%d" metabot-id)
                                    {:use_verified_content true       ; same as current
                                     :collection_id collection-id-2}) ; same as current
              (is (= [] @scheduled)))))))))

(deftest prompt-suggestions-collection-permissions-test
  (testing "GET /api/metabot/metabot/:id/prompt-suggestions respects collection permissions"
    (mt/dataset test-data
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
                                                 (format "metabot/metabot/%d/prompt-suggestions" metabot-id))
                  prompts (set (map :prompt (:prompts response)))]
              (is (= 2 (:total response)))
              (is (contains? prompts "Accessible prompt"))
              (is (contains? prompts "Restricted prompt"))))
          (testing "non-admin user only sees prompts for cards in accessible collections"
            (let [response (mt/user-http-request :rasta :get 200
                                                 (format "metabot/metabot/%d/prompt-suggestions" metabot-id))
                  prompts (set (map :prompt (:prompts response)))]
              (is (= 1 (:total response)))
              (is (contains? prompts "Accessible prompt"))
              (is (not (contains? prompts "Restricted prompt"))))))))))
