(ns metabase.mcp.v2.tools.duplicate-test
  "Contract tests for the `duplicate_content` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, Malli validation, and teaching-error conversion are exercised for free."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.test-util :as documents.tu]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.duplicate :as tools.duplicate]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.duplicate/keep-me)

(defn- call-tool!
  ([user args] (call-tool! user nil args))
  ([user scopes args]
   (mt/with-current-user (mt/user->id user)
     (registry/call-tool scopes nil "duplicate_content" args))))

(defn- tool-result
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

;;; ------------------------------------------------- question -----------------------------------------------------

(deftest duplicate-question-test
  (testing "GHY-4151: a question copy lands in the source's collection under a \"Copy of\" name,
            with the source's query and display intact"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Revenue by region"
                                                :type          :question
                                                :display       :bar
                                                :collection_id coll-id
                                                :dataset_query (mt/mbql-query venues)}]
        (let [result (tool-result (call-tool! :crowberto {:type "question" :id card-id}))
              copy   (t2/select-one :model/Card :id (:id result))]
          (is (=? {:type "question" :name "Copy of Revenue by region" :collection_id coll-id}
                  result))
          (is (not= card-id (:id result)))
          (is (= "Copy of Revenue by region" (:name copy)))
          (is (= coll-id (:collection_id copy)))
          (is (= :bar (:display copy)))
          (is (= :question (:type copy)))
          (is (= (:dataset_query (t2/select-one :model/Card :id card-id))
                 (:dataset_query copy))))))))

(deftest duplicate-question-new-name-and-collection-test
  (testing "GHY-4151: new_name and collection_id override the defaults"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {source-coll :id} {}
                     :model/Collection {dest-coll :id} {}
                     :model/Card {card-id :id} {:name          "Revenue by region"
                                                :type          :question
                                                :collection_id source-coll
                                                :dataset_query (mt/mbql-query venues)}]
        (let [result (tool-result (call-tool! :crowberto {:type          "question"
                                                          :id            card-id
                                                          :new_name      "Revenue by region (EMEA)"
                                                          :collection_id dest-coll}))]
          (is (=? {:name "Revenue by region (EMEA)" :collection_id dest-coll} result))
          (is (=? {:name "Revenue by region (EMEA)" :collection_id dest-coll}
                  (t2/select-one :model/Card :id (:id result)))))))))

(deftest duplicate-question-to-root-test
  (testing "GHY-4151: collection_id \"root\" copies into the root collection"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:type          :question
                                                :collection_id coll-id
                                                :dataset_query (mt/mbql-query venues)}]
        (let [result (tool-result (call-tool! :crowberto {:type "question" :id card-id :collection_id "root"}))]
          (is (nil? (:collection_id result)))
          (is (nil? (:collection_id (t2/select-one :model/Card :id (:id result))))))))))

(deftest duplicate-dashboard-question-test
  (testing "GHY-4151: a question saved inside a dashboard becomes a normal collection question when
            copied — a card cannot live in both a dashboard and a collection"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:name          "Inline question"
                                                :type          :question
                                                :collection_id coll-id
                                                :dashboard_id  dash-id
                                                :dataset_query (mt/mbql-query venues)}]
        (let [result (tool-result (call-tool! :crowberto {:type "question" :id card-id :collection_id coll-id}))
              copy   (t2/select-one :model/Card :id (:id result))]
          (is (nil? (:dashboard_id copy)))
          (is (= coll-id (:collection_id copy))))))))

(deftest duplicate-card-flavor-mismatch-test
  (testing "GHY-4151: a model or metric passed as a question is a teaching error saying so, rather than
            silently copying it as a question — the other card flavors aren't supported yet"
    (mt/with-temp [:model/Card {card-id :id} {:type :model :dataset_query (mt/mbql-query venues)}]
      (is (= (format "Card %d is a model — duplicate_content supports type \"question\" only." card-id)
             (tool-error (call-tool! :crowberto {:type "question" :id card-id})))))))

(deftest duplicate-archived-source-test
  (testing "GHY-4151: a trashed source is refused for every type. Archived content keeps its real
            collection_id (the trash is presentational) and neither copy path carries `:archived`
            over, so duplicating would resurrect a live copy in the collection it was trashed from"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Document]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Trashed question"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (mt/mbql-query venues)}
                     :model/Dashboard {dash-id :id} {:name "Trashed dashboard" :collection_id coll-id}
                     :model/Document {doc-id :id} {:name          "Trashed document"
                                                   :collection_id coll-id
                                                   :document      (documents.tu/text->prose-mirror-ast "Gone.")}]
        (doseq [[model id type] [[:model/Card card-id "question"]
                                 [:model/Dashboard dash-id "dashboard"]
                                 [:model/Document doc-id "document"]]]
          (t2/update! model id {:archived true :archived_directly true})
          (testing type
            (is (= (format "%s %d is in the trash — restore it before duplicating." (name model) id)
                   (tool-error (call-tool! :crowberto {:type type :id id}))))))
        (testing "and nothing was written"
          (is (= 1 (t2/count :model/Card :collection_id coll-id)))
          (is (= 1 (t2/count :model/Dashboard :collection_id coll-id)))
          (is (= 1 (t2/count :model/Document :collection_id coll-id))))))))

;;; ------------------------------------------------- dashboard ----------------------------------------------------

(defn- copied-dashcards
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(deftest duplicate-dashboard-shallow-test
  (testing "GHY-4151: the default shallow copy re-uses the source's cards rather than duplicating them"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (mt/mbql-query venues)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result (tool-result (call-tool! :crowberto {:type "dashboard" :id dash-id}))]
          (is (=? {:type "dashboard" :name "Copy of Sales" :collection_id coll-id} result))
          (is (not= dash-id (:id result)))
          (testing "the copy's dashcards point at the original card"
            (is (= [card-id] (map :card_id (copied-dashcards (:id result))))))
          (testing "no card was duplicated"
            (is (= 1 (t2/count :model/Card :name "Revenue")))))))))

(deftest duplicate-dashboard-deep-test
  (testing "GHY-4151: is_deep_copy also duplicates the dashboard's questions into the destination"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {source-coll :id} {}
                     :model/Collection {dest-coll :id} {}
                     :model/Card {card-id :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id source-coll
                                                :dataset_query (mt/mbql-query venues)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id source-coll}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result    (tool-result (call-tool! :crowberto {:type          "dashboard"
                                                             :id            dash-id
                                                             :collection_id dest-coll
                                                             :is_deep_copy  true}))
              new-cards (map :card_id (copied-dashcards (:id result)))]
          (is (=? {:type "dashboard" :collection_id dest-coll} result))
          (is (= 1 (count new-cards)))
          (is (not= [card-id] new-cards))
          (testing "the duplicated card lands in the destination collection"
            (is (=? {:name "Revenue" :collection_id dest-coll}
                    (t2/select-one :model/Card :id (first new-cards))))))))))

(deftest duplicate-dashboard-deep-uncopied-test
  (testing "GHY-4151: a deep copy reports cards it left behind as `uncopied`, and an unreadable one
            is reported by id alone — the tool must not hand the agent the name or query of a card
            the caller cannot read"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Collection {secret-coll :id} {}
                     :model/Card {secret-card :id} {:name          "Salaries"
                                                    :type          :question
                                                    :collection_id secret-coll
                                                    :dataset_query (mt/mbql-query venues)}
                     :model/Card {ok-card :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (mt/mbql-query venues)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id secret-card}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id ok-card}]
        (mt/with-non-admin-groups-no-collection-perms secret-coll
          (let [result (tool-result (call-tool! :rasta {:type         "dashboard"
                                                        :id           dash-id
                                                        :is_deep_copy true}))]
            (is (= [{:id secret-card}] (:uncopied result))
                "the unreadable card must be reported by id alone — no name, no query")
            (testing "the unreadable card is left out of the copy entirely"
              (is (= 1 (count (copied-dashcards (:id result))))))
            (testing "while the readable card is duplicated (same collection, so name-suffixed)"
              (is (= 1 (t2/count :model/Card :name "Revenue - Duplicate"))))))))))

(deftest duplicate-dashboard-shallow-with-dashboard-questions-test
  (testing "GHY-4151: a shallow copy of a dashboard holding dashboard questions is a teaching error
            naming is_deep_copy"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                   :model/Card _ {:name          "Inline question"
                                  :type          :question
                                  :collection_id coll-id
                                  :dashboard_id  dash-id
                                  :dataset_query (mt/mbql-query venues)}]
      (let [message (tool-error (call-tool! :crowberto {:type "dashboard" :id dash-id}))]
        (is (re-find #"is_deep_copy" message))
        (is (re-find #"questions saved inside it" message))))))

(deftest duplicate-deep-copy-wrong-type-test
  (testing "GHY-4151: is_deep_copy is dashboards-only and says so"
    (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query (mt/mbql-query venues)}]
      (is (= "`is_deep_copy` applies to dashboards only — omit it when duplicating a question."
             (tool-error (call-tool! :crowberto {:type "question" :id card-id :is_deep_copy true})))))))

;;; -------------------------------------------------- document ----------------------------------------------------

(deftest duplicate-document-test
  (testing "GHY-4151: a document copy lands in the source's collection under a \"Copy of\" name"
    (mt/with-model-cleanup [:model/Document]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document {doc-id :id} {:name          "Q3 summary"
                                                   :collection_id coll-id
                                                   :document      (documents.tu/text->prose-mirror-ast "Revenue was up.")}]
        (let [result (tool-result (call-tool! :crowberto {:type "document" :id doc-id}))
              copy   (t2/select-one :model/Document :id (:id result))]
          (is (=? {:type "document" :name "Copy of Q3 summary" :collection_id coll-id} result))
          (is (not= doc-id (:id result)))
          (is (= (:document (t2/select-one :model/Document :id doc-id))
                 (:document copy))))))))

(deftest duplicate-document-copies-its-cards-test
  (testing "GHY-4151: the questions saved inside a document are copied along with it"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {source-coll :id} {}
                     :model/Collection {dest-coll :id} {}
                     :model/Document {doc-id :id} {:name          "Q3 summary"
                                                   :collection_id source-coll
                                                   :document      (documents.tu/text->prose-mirror-ast "Revenue was up.")}
                     :model/Card _ {:name          "Inline chart"
                                    :type          :question
                                    :collection_id source-coll
                                    :document_id   doc-id
                                    :dataset_query (mt/mbql-query venues)}]
        (let [result (tool-result (call-tool! :crowberto {:type          "document"
                                                          :id            doc-id
                                                          :collection_id dest-coll}))]
          (is (=? [{:name "Inline chart" :collection_id dest-coll}]
                  (t2/select :model/Card :document_id (:id result)))))))))

;;; ------------------------------------------- ids, permissions, scopes -------------------------------------------

(deftest entity-id-test
  (testing "GHY-4151: id accepts a 21-char entity_id as well as a numeric id"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Dashboard {dash-id :id dash-eid :entity_id} {:name "Sales"}]
        (let [result (tool-result (call-tool! :crowberto {:type "dashboard" :id dash-eid}))]
          (is (not= dash-id (:id result)))
          (is (= "Copy of Sales" (:name result)))))))
  (testing "GHY-4151: a malformed id is a teaching error naming both accepted shapes"
    (is (= "Invalid id \"nope\" — pass a numeric id or a 21-character entity_id."
           (tool-error (call-tool! :crowberto {:type "dashboard" :id "nope"}))))))

(deftest unknown-type-test
  (testing "GHY-4151: a type outside the enum is rejected by argument validation"
    (is (re-find #"should be either"
                 (tool-error (call-tool! :crowberto {:type "collection" :id 1}))))))

(deftest source-read-permission-test
  (testing "GHY-4151: an unreadable source collapses to not-found — the response is never an existence oracle"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:type          :question
                                                :collection_id coll-id
                                                :dataset_query (mt/mbql-query venues)}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}]
        (is (= (format "Card %d not found — it may not exist, or you may not have access to it." card-id)
               (tool-error (call-tool! :rasta {:type "question" :id card-id}))))
        (is (= (format "Dashboard %d not found — it may not exist, or you may not have access to it." dash-id)
               (tool-error (call-tool! :rasta {:type "dashboard" :id dash-id}))))))))

(deftest destination-write-permission-test
  (testing "GHY-4151: copying into a collection the caller can't curate is refused, and nothing is written"
    (mt/with-temp [:model/Collection {source-coll :id} {}
                   :model/Collection {dest-coll :id} {}
                   :model/Card {card-id :id} {:name          "Revenue"
                                              :type          :question
                                              :collection_id source-coll
                                              :dataset_query (mt/mbql-query venues)}]
      (mt/with-non-admin-groups-no-collection-perms dest-coll
        (is (:isError (call-tool! :rasta {:type "question" :id card-id :collection_id dest-coll})))
        (is (= 1 (t2/count :model/Card :name "Revenue")))))))

(deftest scope-test
  (testing "GHY-4151: the tool itself requires agent:content:duplicate"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
      (is (= "Insufficient scope to call tool: duplicate_content"
             (tool-error (call-tool! :crowberto #{metabot.scope/agent-search}
                                     {:type "dashboard" :id dash-id}))))))
  (testing "GHY-4151: each type additionally requires its own create scope — duplicating is creating"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
        (is (re-find #"agent:dashboard:create"
                     (tool-error (call-tool! :crowberto
                                             #{metabot.scope/agent-content-duplicate
                                               metabot.scope/agent-question-create}
                                             {:type "dashboard" :id dash-id}))))
        (is (=? {:name "Copy of Sales"}
                (tool-result (call-tool! :crowberto
                                         #{metabot.scope/agent-content-duplicate
                                           metabot.scope/agent-dashboard-create}
                                         {:type "dashboard" :id dash-id}))))))))
