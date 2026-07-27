(ns metabase.mcp.v2.tools.bookmark-test
  "Contract tests for the `bookmark_content` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, Malli validation, and teaching-error conversion are exercised for free."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.bookmark :as tools.bookmark]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.bookmark/keep-me)

(defn- call-tool!
  ([user args] (call-tool! user nil args))
  ([user scopes args]
   (mt/with-current-user (mt/user->id user)
     (registry/call-tool scopes nil "bookmark_content" args))))

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

(deftest bookmark-and-unbookmark-test
  (testing "GHY-4152: bookmarked true/false creates and removes the calling user's bookmark row"
    (mt/with-temp [:model/Card {card-id :id} {:name "Orders over time" :type :question}]
      (let [user-id (mt/user->id :rasta)]
        (is (=? {:type "question" :id card-id :name "Orders over time" :bookmarked true}
                (tool-result (call-tool! :rasta {:type "question" :id card-id :bookmarked true}))))
        (is (t2/exists? :model/CardBookmark :card_id card-id :user_id user-id))
        (is (=? {:type "question" :id card-id :bookmarked false}
                (tool-result (call-tool! :rasta {:type "question" :id card-id :bookmarked false}))))
        (is (not (t2/exists? :model/CardBookmark :card_id card-id :user_id user-id)))))))

(deftest idempotent-test
  (testing "GHY-4152: both directions are idempotent — unlike REST, a repeat call succeeds instead of
            surfacing the 400, so an agent that can't observe its prior calls never has to guess"
    (mt/with-temp [:model/Card {card-id :id} {:type :question}]
      (let [user-id (mt/user->id :rasta)]
        (testing "re-bookmarking succeeds and leaves exactly one row"
          (call-tool! :rasta {:type "question" :id card-id :bookmarked true})
          (is (=? {:bookmarked true}
                  (tool-result (call-tool! :rasta {:type "question" :id card-id :bookmarked true}))))
          (is (= 1 (t2/count :model/CardBookmark :card_id card-id :user_id user-id))))
        (testing "un-bookmarking something that isn't bookmarked succeeds"
          (call-tool! :rasta {:type "question" :id card-id :bookmarked false})
          (is (=? {:bookmarked false}
                  (tool-result (call-tool! :rasta {:type "question" :id card-id :bookmarked false}))))
          (is (= 0 (t2/count :model/CardBookmark :card_id card-id :user_id user-id))))))))

(deftest every-type-routes-to-its-bookmark-table-test
  (testing "GHY-4152: each type reaches the right bookmark table; the three card flavors share `card`"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {question-id :id} {:type :question :collection_id coll-id}
                   :model/Card {model-id :id} {:type :model :collection_id coll-id}
                   :model/Card {metric-id :id} {:type :metric :collection_id coll-id}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Document {doc-id :id} {:collection_id coll-id :document {}}]
      (doseq [[type id] [["question" question-id] ["model" model-id] ["metric" metric-id]]]
        (testing type
          (is (=? {:bookmarked true} (tool-result (call-tool! :rasta {:type type :id id :bookmarked true}))))
          (is (t2/exists? :model/CardBookmark :card_id id :user_id (mt/user->id :rasta)))))
      (testing "dashboard"
        (call-tool! :rasta {:type "dashboard" :id dash-id :bookmarked true})
        (is (t2/exists? :model/DashboardBookmark :dashboard_id dash-id :user_id (mt/user->id :rasta))))
      (testing "collection"
        (call-tool! :rasta {:type "collection" :id coll-id :bookmarked true})
        (is (t2/exists? :model/CollectionBookmark :collection_id coll-id :user_id (mt/user->id :rasta))))
      (testing "document"
        (call-tool! :rasta {:type "document" :id doc-id :bookmarked true})
        (is (t2/exists? :model/DocumentBookmark :document_id doc-id :user_id (mt/user->id :rasta)))))))

(deftest entity-id-test
  (testing "GHY-4152: id accepts a 21-char entity_id as well as a numeric id"
    (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
      (is (=? {:type "collection" :id coll-id :bookmarked true}
              (tool-result (call-tool! :rasta {:type "collection" :id coll-eid :bookmarked true}))))
      (is (t2/exists? :model/CollectionBookmark :collection_id coll-id :user_id (mt/user->id :rasta)))))
  (testing "GHY-4152: a malformed id is a teaching error naming both accepted shapes"
    (is (= "Invalid id \"nope\" — pass a numeric id or a 21-character entity_id."
           (tool-error (call-tool! :rasta {:type "collection" :id "nope" :bookmarked true}))))))

(deftest card-flavor-mismatch-test
  (testing "GHY-4152: bookmarking a card under the wrong flavor is a teaching error naming the right type"
    (mt/with-temp [:model/Card {card-id :id} {:type :metric}]
      (is (= (format "Card %d is a metric — bookmark it with type: \"metric\"." card-id)
             (tool-error (call-tool! :rasta {:type "question" :id card-id :bookmarked true}))))
      (is (not (t2/exists? :model/CardBookmark :card_id card-id))))))

(deftest read-permission-test
  (testing "GHY-4152: an unreadable item collapses to not-found — the response is never an existence oracle"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:type :question :collection_id coll-id}]
        (is (= (format "Card %d not found — it may not exist, or you may not have access to it." card-id)
               (tool-error (call-tool! :rasta {:type "question" :id card-id :bookmarked true}))))
        (is (not (t2/exists? :model/CardBookmark :card_id card-id))))))
  (testing "GHY-4152: a nonexistent id gets the same message"
    (is (= "Card 999999999 not found — it may not exist, or you may not have access to it."
           (tool-error (call-tool! :rasta {:type "question" :id 999999999 :bookmarked true}))))))

(deftest per-user-test
  (testing "GHY-4152: bookmarks are per-user — one user's bookmark is invisible to another's un-bookmark"
    (mt/with-temp [:model/Card {card-id :id} {:type :question}]
      (call-tool! :rasta {:type "question" :id card-id :bookmarked true})
      (call-tool! :lucky {:type "question" :id card-id :bookmarked false})
      (is (t2/exists? :model/CardBookmark :card_id card-id :user_id (mt/user->id :rasta)))
      (is (not (t2/exists? :model/CardBookmark :card_id card-id :user_id (mt/user->id :lucky)))))))

(deftest scope-test
  (testing "GHY-4152: the tool requires agent:bookmark:write"
    (mt/with-temp [:model/Card {card-id :id} {:type :question}]
      (is (= "Insufficient scope to call tool: bookmark_content"
             (tool-error (call-tool! :rasta #{metabot.scope/agent-search}
                                     {:type "question" :id card-id :bookmarked true}))))
      (is (=? {:bookmarked true}
              (tool-result (call-tool! :rasta #{metabot.scope/agent-bookmark-write}
                                       {:type "question" :id card-id :bookmarked true})))))))
