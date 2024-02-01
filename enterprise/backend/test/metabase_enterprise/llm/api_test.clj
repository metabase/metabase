(ns metabase-enterprise.llm.api-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase-enterprise.llm.client :as llm-client]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def card-defaults
  "The default card params."
  {:archived            false
   :collection_id       nil
   :collection_position nil
   :collection_preview  true
   :dataset_query       {}
   :dataset             false
   :description         nil
   :display             "scalar"
   :enable_embedding    false
   :entity_id           nil
   :embedding_params    nil
   :made_public_by_id   nil
   :parameters          []
   :parameter_mappings  []
   :moderation_reviews  ()
   :public_uuid         nil
   :query_type          nil
   :cache_ttl           nil
   :average_query_time  nil
   :last_query_start    nil
   :result_metadata     nil})

(defn mbql-count-query
  ([]
   (mbql-count-query (mt/id) (mt/id :venues)))

  ([db-or-id table-or-id]
   {:database (u/the-id db-or-id)
    :type     :query
    :query    {:source-table (u/the-id table-or-id), :aggregation [[:count]]}}))

(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))

  ([card-name]
   (card-with-name-and-query card-name (mbql-count-query)))

  ([card-name query]
   {:name                   card-name
    :display                "scalar"
    :dataset_query          query
    :visualization_settings {:global {:title nil}}}))


(deftest summarize-card-test
  (testing "POST /api/ee/autodescribe/card/summarize"
    (testing "Test ability to summarize a card"
      (mt/with-premium-features #{:llm-autodescription}
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-model-cleanup [:model/Card]
            (let [fake-response {:title       "Title"
                                 :description "Description"}]
              (with-redefs [llm-client/*create-chat-completion-endpoint*
                            (fn [_ _]
                              {:choices [{:message
                                          {:content
                                           (json/generate-string
                                             fake-response)}}]})]

                (let [card (assoc (card-with-name-and-query (mt/random-name)
                                                            (mbql-count-query (mt/id) (mt/id :venues)))
                             :parameters [{:id "abc123", :name "test", :type "date"}]
                             :parameter_mappings [{:parameter_id "abc123", :card_id 10,
                                                   :target       [:dimension [:template-tags "category"]]}])]
                  (is (= {:summary fake-response}
                         (mt/user-http-request :rasta :post 200 "ee/autodescribe/card/summarize" card))))))))))))
