(ns metabase.agent-api.browse-collection-test
  "The v2 `browse_collection` tool. The app's own item listing behind two modes: `items` (pinned first, filtered,
   sorted, paged) and `tree` (collections only, re-rooting instead of paging)."
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.browse-collection :as browse-collection]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- browse!
  ([body] (browse! :rasta 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/browse-collection" body)))

(defn- refusal!
  ([body] (refusal! 400 body))
  ([status body]
   (let [response (browse! :rasta status body)]
     (if (string? response) response (pr-str response)))))

(defn- names [response]
  (mapv :name (:data response)))

;;; ──────────────────────────────────────────────────────────────────
;;; items
;;; ──────────────────────────────────────────────────────────────────

(deftest items-lists-every-content-type-test
  (mt/with-temp [:model/Collection coll      {:name "AgentV2 Browse"}
                 :model/Collection _child    {:name "AgentV2 Child" :location (format "/%d/" (:id coll))}
                 :model/Card       _question {:name "AgentV2 Question" :collection_id (:id coll)}
                 :model/Card       _model    {:name "AgentV2 Model" :type :model :collection_id (:id coll)}
                 :model/Dashboard  _dash     {:name "AgentV2 Dashboard" :collection_id (:id coll)}]
    (let [response (browse! {:id (:id coll)})
          by-name  (into {} (map (juxt :name identity)) (:data response))]
      (testing "the items are the collection's contents, typed in the catalog's vocabulary"
        (is (= {"AgentV2 Child"     "collection"
                "AgentV2 Question"  "question"
                "AgentV2 Model"     "model"
                "AgentV2 Dashboard" "dashboard"}
               (update-vals by-name :type))))
      (testing "concise rows carry the collection-item projection, and never the listing's own `model` key"
        (is (= #{:id :name :type :description :collection_id :collection_position :archived}
               (set (keys (by-name "AgentV2 Question"))))))
      (testing "the envelope counts the whole set"
        (is (= 4 (:total response) (:returned response)))))))

(deftest items-type-filter-test
  (mt/with-temp [:model/Collection coll {:name "AgentV2 Types"}
                 :model/Card       _    {:name "AgentV2 Q" :collection_id (:id coll)}
                 :model/Dashboard  _    {:name "AgentV2 D" :collection_id (:id coll)}]
    (is (= ["AgentV2 D"] (names (browse! {:id (:id coll) :type ["dashboard"]}))))
    (is (= ["AgentV2 Q"] (names (browse! {:id (:id coll) :type ["question"]}))))))

(deftest items-pinned-come-first-test
  (mt/with-temp [:model/Collection coll {:name "AgentV2 Pinned"}
                 :model/Card       _    {:name "AgentV2 Aaa" :collection_id (:id coll)}
                 :model/Card       _    {:name "AgentV2 Zzz" :collection_id (:id coll)
                                         :collection_position 1}]
    (testing "a pinned item leads the listing even when the sort would put it last"
      (is (= ["AgentV2 Zzz" "AgentV2 Aaa"] (names (browse! {:id (:id coll)})))))
    (testing "and the row says where it is pinned"
      (is (= 1 (:collection_position (first (:data (browse! {:id (:id coll)})))))))))

(deftest items-sort-test
  (mt/with-temp [:model/Collection coll {:name "AgentV2 Sort"}
                 :model/Card       _    {:name "AgentV2 Aaa" :collection_id (:id coll)}
                 :model/Card       _    {:name "AgentV2 Zzz" :collection_id (:id coll)}]
    (is (= ["AgentV2 Aaa" "AgentV2 Zzz"] (names (browse! {:id (:id coll) :sort_column "name"}))))
    (is (= ["AgentV2 Zzz" "AgentV2 Aaa"]
           (names (browse! {:id (:id coll) :sort_column "name" :sort_direction "desc"}))))))

(deftest items-pagination-test
  (mt/with-temp [:model/Collection coll {:name "AgentV2 Page"}
                 :model/Card       _    {:name "AgentV2 P1" :collection_id (:id coll) :collection_position 1}
                 :model/Card       _    {:name "AgentV2 P2" :collection_id (:id coll)}
                 :model/Card       _    {:name "AgentV2 P3" :collection_id (:id coll)}]
    (let [page-1 (browse! {:id (:id coll) :limit 2})
          page-2 (browse! {:id (:id coll) :limit 2 :offset 2})]
      (testing "a cut page says so, and the message names the collection, the narrowing param, and the next offset"
        (is (= 2 (:returned page-1)))
        (is (= 3 (:total page-1)))
        (is (true? (:truncated page-1)))
        (is (re-find #"`type`" (:truncation_message page-1)))
        (is (re-find #"`offset: 2`" (:truncation_message page-1))))
      (testing "the page runs from the pinned block into the unpinned listing without repeating an item"
        (is (= ["AgentV2 P1" "AgentV2 P2"] (names page-1)))
        (is (= ["AgentV2 P3"] (names page-2)))
        (is (not (contains? page-2 :truncated)))))))

(deftest items-root-and-trash-test
  (mt/with-temp [:model/Card _ {:name "AgentV2 Root Question" :collection_id nil}
                 :model/Card _ {:name "AgentV2 Trashed" :collection_id nil :archived true
                                :archived_directly true}]
    (testing "\"root\" lists the top level"
      (is (contains? (set (names (browse! {:id "root" :type ["question"]}))) "AgentV2 Root Question")))
    (testing "\"trash\" lists what was archived, so a restore is discoverable"
      (let [trashed (set (names (browse! {:id "trash" :type ["question"]})))]
        (is (contains? trashed "AgentV2 Trashed"))
        (is (not (contains? trashed "AgentV2 Root Question")))))))

(deftest items-permission-filtered-test
  (mt/with-temp [:model/Collection coll {:name "AgentV2 Private"}
                 :model/Card       _    {:name "AgentV2 Secret" :collection_id (:id coll)}]
    (mt/with-non-admin-groups-no-collection-perms coll
      (testing "a collection the caller cannot read is a refusal, exactly as it is in the app"
        (is (some? (browse! :rasta 403 {:id (:id coll)})))
        (is (contains? (set (names (browse! :crowberto 200 {:id (:id coll)}))) "AgentV2 Secret"))))))

(deftest items-namespaces-are-invisible-test
  (testing "a snippet folder is not reachable — snippets are discovered through `search`"
    (mt/with-temp [:model/Collection folder  {:name "AgentV2 Snippet Folder" :namespace "snippets"}
                   :model/NativeQuerySnippet _ {:name "AgentV2 Snippet" :content "1 = 1"
                                                :collection_id (:id folder)}]
      (is (empty? (:data (browse! :crowberto 200 {:id (:id folder)})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; items — fields
;;; ──────────────────────────────────────────────────────────────────

(deftest items-fields-test
  (mt/with-temp [:model/Collection coll {:name "AgentV2 Fields"}
                 :model/Card       _    {:name "AgentV2 Picked" :collection_id (:id coll)}]
    (testing "`fields` picks exactly the named paths, and overrides response_format"
      (is (= [{:id (:id (first (:data (browse! {:id (:id coll)})))) :name "AgentV2 Picked"}]
             (:data (browse! {:id              (:id coll)
                              :fields          ["id" "name"]
                              :response_format "detailed"})))))
    (testing "an unknown path teaches the paths that exist"
      (let [message (refusal! {:id (:id coll) :fields ["naem"]})]
        (is (re-find #"Unknown field \"naem\"" message))
        (is (re-find #"name" message))))))

;;; ──────────────────────────────────────────────────────────────────
;;; tree
;;; ──────────────────────────────────────────────────────────────────

(deftest tree-test
  (mt/with-temp [:model/Collection parent {:name "AgentV2 Parent"}
                 :model/Collection child  {:name "AgentV2 Child" :location (format "/%d/" (:id parent))}
                 :model/Collection _grand {:name "AgentV2 Grandchild"
                                           :location (format "/%d/%d/" (:id parent) (:id child))}
                 :model/Card       _      {:name "AgentV2 Leaf" :collection_id (:id parent)}]
    (let [response  (browse! {:id (:id parent) :mode "tree"})
          child-node (first (:data response))]
      (testing "a tree is collections only — a question in the collection is not a node"
        (is (= ["AgentV2 Child"] (names response))))
      (testing "and it walks to the default depth of two"
        (is (= ["AgentV2 Grandchild"] (mapv :name (:children child-node)))))
      (testing "depth 1 stops at the immediate children, and a node it stopped short of says it has more below"
        (let [stopped (first (:data (browse! {:id (:id parent) :mode "tree" :depth 1})))]
          (is (= [] (:children stopped)))
          (is (re-find #"not expanded" (:truncation_message stopped))))))))

(deftest tree-truncation-names-the-expansion-call-test
  (with-redefs [browse-collection/max-children-per-node 1]
    (mt/with-temp [:model/Collection parent {:name "AgentV2 Wide"}
                   :model/Collection _a     {:name "AgentV2 A" :location (format "/%d/" (:id parent))}
                   :model/Collection _b     {:name "AgentV2 B" :location (format "/%d/" (:id parent))}]
      (let [response (browse! {:id (:id parent) :mode "tree"})]
        (testing "a cut branch names the call that re-roots on it, because a tree does not page"
          (is (= 1 (:returned response)))
          (is (= 2 (:total response)))
          (is (true? (:truncated response)))
          (is (re-find #"1 more under \"AgentV2 Wide\"" (:truncation_message response)))
          (is (re-find (re-pattern (str "id: " (:id parent))) (:truncation_message response))))))))

(deftest tree-argument-contract-test
  (testing "the items-only arguments are refused rather than silently ignored"
    (is (re-find #"`limit` applies to `mode: \"items\"`"
                 (refusal! {:id "root" :mode "tree" :limit 10})))
    (is (re-find #"`type` applies to `mode: \"items\"`"
                 (refusal! {:id "root" :mode "tree" :type ["dashboard"]})))
    (is (re-find #"`fields` picks fields from an item"
                 (refusal! {:id "root" :mode "tree" :fields ["id"]}))))
  (testing "and `depth` belongs to the tree"
    (is (re-find #"`depth` applies to `mode: \"tree\"`"
                 (refusal! {:id "root" :depth 2})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events
;;; ──────────────────────────────────────────────────────────────────

(deftest items-leave-the-collection-read-trail-test
  (testing "browsing a collection publishes the read event its REST endpoint publishes, so the view is logged exactly
            as opening the collection in the app logs it"
    (mt/with-temp [:model/Collection coll {:name "AgentV2 Read Trail"}]
      (let [events (atom [])]
        (mt/with-test-user :rasta
          (with-redefs [events/publish-event! (fn [topic event] (swap! events conj [topic event]) event)]
            (browse-collection/browse-collection {:id (:id coll)})))
        (is (= [[:event/collection-read {:object (:id coll) :user-id (mt/user->id :rasta)}]]
               (for [[topic {:keys [object user-id]}] @events]
                 [topic {:object (:id object) :user-id user-id}])))))))
