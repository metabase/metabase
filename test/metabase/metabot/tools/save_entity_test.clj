(ns metabase.metabot.tools.save-entity-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.save-entity :as save-entity]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- venues-query []
  (lib/query (mt/metadata-provider)
             (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(defn- chart-memory
  "A memory atom holding one generated chart `c-1` over a real query."
  []
  (let [query (venues-query)]
    (atom {:state   {:queries {"q-1" query}
                     :charts  {"c-1" {:chart_id "c-1"
                                      :query_id "q-1"
                                      :queries  [query]
                                      :visualization_settings {:chart_type :bar}}}}
           :context {}})))

(defn- rehydrated-chart-memory
  "A chart memory whose query has crossed the JSON persistence boundary between turns."
  []
  (let [query (-> (venues-query)
                  (dissoc :lib/metadata)
                  json/encode
                  json/decode+kw)]
    (atom {:state   {:queries {"q-1" query}
                     :charts  {"c-1" {:chart_id "c-1"
                                      :query_id "q-1"
                                      :queries  [query]
                                      :visualization_settings {:chart_type "bar"}}}}
           :context {}})))

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
          (testing "emits an entity_saved data part pointing at the chart and destination"
            (is (= "entity_saved" (:data-type part)))
            (is (= "c-1" (get-in part [:data :chart_id])))
            (is (= (:id card) (get-in part [:data :card_id])))
            (is (= {:type "collection" :id (:id coll)}
                   (get-in part [:data :destination])))))))))

(deftest save-rehydrated-chart-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {:name "Persisted charts"}]
        (let [result (binding [shared/*memory-atom* (rehydrated-chart-memory)]
                       (save-entity/save-entity-tool
                        {:chart_id    "c-1"
                         :name        "Venues by price"
                         :description "Count of venues grouped by price."
                         :destination {:target_type "collection" :collection_id (:id coll)}}))]
          (testing "saves a generated query after its enum values were stringified between turns"
            (is (integer? (get-in result [:structured-output :card-id])))))))))

(deftest save-stamps-card-origin-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}
                     :model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :crowberto)}]
        (let [memory (doto (chart-memory) (swap! assoc :conversation-id convo-id))
              result (binding [shared/*memory-atom* memory]
                       (save-entity/save-entity-tool
                        {:chart_id    "c-1"
                         :name        "Venues by price"
                         :description "Count of venues grouped by price."
                         :destination {:target_type "collection" :collection_id (:id coll)}}))
              card-id (get-in result [:structured-output :card-id])]
          (testing "the card records which conversation + chart it was saved from"
            (is (= {:metabot_conversation_id convo-id
                    :metabot_chart_id        "c-1"}
                   (t2/select-one [:model/Card :metabot_conversation_id :metabot_chart_id]
                                  :id card-id)))))))))

(deftest save-without-conversation-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (testing "saving outside a conversation-backed run leaves the origin columns nil"
        (let [result  (save! {:target_type "collection" :collection_id nil})
              card-id (get-in result [:structured-output :card-id])]
          (is (= {:metabot_conversation_id nil :metabot_chart_id nil}
                 (t2/select-one [:model/Card :metabot_conversation_id :metabot_chart_id]
                                :id card-id))))))))

(deftest save-to-root-collection-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (let [result (save! {:target_type "collection" :collection_id nil})
            card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
        (testing "an explicit null collection_id saves to the root collection"
          (is (nil? (:collection_id card)))
          (is (nil? (get-in result [:data-parts 0 :data :destination :id]))))))))

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
          (testing "the destination points at the dashboard"
            (is (= {:type "dashboard" :id (:id dash)}
                   (get-in result [:data-parts 0 :data :destination])))))))))

(deftest save-seeded-chart-display-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (testing "charts seeded from the viewing context carry no :visualization_settings, so the display falls back to :chart_config :display_type"
        (let [query  (venues-query)
              memory (atom {:state   {:queries {}
                                      :charts  {"c-2" {:chart_id "c-2"
                                                       :queries  [query]
                                                       :visualization_settings nil
                                                       :chart_config {:display_type "line"}}}}
                            :context {}})
              result (binding [shared/*memory-atom* memory]
                       (save-entity/save-entity-tool
                        {:chart_id    "c-2"
                         :name        "Seeded chart"
                         :description "Seeded from the viewing context."
                         :destination {:target_type "collection" :collection_id nil}}))
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (is (= :line (:display card))))))))

(def ^:private document-ast
  {:type "doc"
   :content [{:type "paragraph" :content [{:type "text" :text "Intro"}]}
             {:type "paragraph" :content [{:type "text" :text "Outro"}]}]})

(defn- card-embed [card-id]
  {:type "resizeNode"
   :content [{:type "cardEmbed" :attrs {:id card-id}}]})

(deftest save-to-document-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection coll {}
                     :model/Document  doc  {:name          "Q3 report"
                                            :collection_id (:id coll)
                                            :document      document-ast}]
        (let [result (save! {:target_type "document" :document_id (:id doc)})
              card   (t2/select-one :model/Card :id (get-in result [:structured-output :card-id]))]
          (testing "creates a document question inheriting the document's collection"
            (is (= (:id doc) (:document_id card)))
            (is (= (:id coll) (:collection_id card)))
            (is (= "Venues by price" (:name card))))
          (testing "omitting position appends a card embed at the end of the document"
            (is (= (conj (:content document-ast) (card-embed (:id card)))
                   (get-in (t2/select-one :model/Document :id (:id doc)) [:document :content]))))
          (testing "the location points at the document"
            (is (= {:type "document" :id (:id doc)}
                   (get-in result [:data-parts 0 :data :location])))))))))

(deftest save-to-document-position-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Document doc {:name "Q3 report" :document document-ast}]
        (let [result (save! {:target_type "document" :document_id (:id doc) :position 1})
              card-id (get-in result [:structured-output :card-id])]
          (testing "an explicit position inserts before the block at that index"
            (is (= [(first (:content document-ast))
                    (card-embed card-id)
                    (second (:content document-ast))]
                   (get-in (t2/select-one :model/Document :id (:id doc)) [:document :content])))))))))

(deftest save-to-document-requires-id-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "a missing document_id fails destination schema validation"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"document_id"
                            (save! {:target_type "document"}))))))

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
