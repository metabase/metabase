(ns metabase.agent-api.search-test
  "The v2 `search` tool. Three modes, the engine's own filters, and two things layered on top of the
   index — snippets and `collection_path`."
  (:require
   [clojure.test :refer :all]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- search!
  ([body] (search! :rasta 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/search" body)))

(defmacro ^:private with-indexed
  "Run `body` with the search index synchronously up to date, on whichever engine the instance has."
  [& body]
  `(binding [search.ingestion/*force-sync* true]
     (search.tu/with-new-search-if-available-otherwise-legacy
       ~@body)))

(defn- hits [response] (map (juxt :type :name) (:data response)))

(defn- refusal!
  "The message of a refused call. A teaching error surfaces as the message itself, so the model reads
   the fix out of the tool result without any envelope to unwrap."
  [body]
  (let [response (search! :rasta 400 body)]
    (if (string? response) response (pr-str response))))

;;; ──────────────────────────────────────────────────────────────────
;;; Modes
;;; ──────────────────────────────────────────────────────────────────

(deftest no-mode-is-a-teaching-error-test
  (testing "a call that picks no mode names all three, rather than guessing one"
    (let [message (refusal! {})]
      (is (re-find #"term_queries" message))
      (is (re-find #"filter" message))
      (is (re-find #"recent" message)))))

(deftest queries-with-recent-is-a-teaching-error-test
  (testing "recents are a log of what you opened; there is nothing to rank them by"
    (is (re-find #"cannot be ranked by a query"
                 (refusal! {:recent true :term_queries ["orders"]})))))

(deftest query-modes-test
  (with-indexed
    (mt/with-temp [:model/Card      _ {:name "AgentV2 Revenue Question"}
                   :model/Dashboard _ {:name "AgentV2 Revenue Dashboard"}]
      (testing "term queries rank by keyword"
        (is (= #{["question" "AgentV2 Revenue Question"] ["dashboard" "AgentV2 Revenue Dashboard"]}
               (set (hits (search! {:term_queries ["AgentV2 Revenue"]}))))))
      (testing "semantic queries search too — without a semantic engine they run on the default one"
        (is (contains? (set (hits (search! {:semantic_queries ["AgentV2 Revenue Question"]})))
                       ["question" "AgentV2 Revenue Question"])))
      (testing "both together are fused into one ranking, and an entity matched by both appears once"
        (let [rows (hits (search! {:term_queries     ["AgentV2 Revenue"]
                                   :semantic_queries ["AgentV2 revenue"]}))]
          (is (= (count rows) (count (set rows))))
          (is (contains? (set rows) ["question" "AgentV2 Revenue Question"])))))))

(deftest filter-only-listing-test
  (testing "filters with no query are a listing — and it carries an exact total"
    (with-indexed
      (mt/with-temp [:model/Collection coll {:name "AgentV2 Listing Collection"}
                     :model/Dashboard  _    {:name "AgentV2 Listing Dashboard" :collection_id (:id coll)}
                     :model/Card       _    {:name "AgentV2 Listing Question" :collection_id (:id coll)}]
        (let [response (search! {:type ["dashboard"] :collection_id (:id coll)})]
          (is (= [["dashboard" "AgentV2 Listing Dashboard"]] (hits response)))
          (is (= 1 (:total response) (:returned response)))
          (is (not (contains? response :truncated))))))))

(deftest recents-test
  (with-indexed
    (mt/with-temp [:model/Dashboard dash {:name "AgentV2 Recent Dashboard"}]
      (activity-feed/update-users-recent-views! (mt/user->id :rasta) :model/Dashboard (:id dash) :view)
      (testing "recent: true returns what the caller viewed, not what the index matched"
        (is (contains? (set (hits (search! {:recent true})))
                       ["dashboard" "AgentV2 Recent Dashboard"])))
      (testing "type narrows recents server-side — the recents endpoint has no type param"
        (is (every? #(= "dashboard" %) (map :type (:data (search! {:recent true :type ["dashboard"]}))))))
      (testing "a type recents cannot record names the ones it can"
        (let [message (refusal! {:recent true :type ["segment"]})]
          (is (re-find #"Recently viewed items only cover" message))
          (is (re-find #"segment" message))))
      (testing "the search filters have nothing to narrow in a view log"
        (is (re-find #"takes only `type`, `limit`, and `offset`"
                     (refusal! {:recent true :archived true})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Filters
;;; ──────────────────────────────────────────────────────────────────

(deftest created-by-test
  (with-indexed
    (mt/with-temp [:model/Dashboard _ {:name "AgentV2 Mine" :creator_id (mt/user->id :rasta)}
                   :model/Dashboard _ {:name "AgentV2 Theirs" :creator_id (mt/user->id :crowberto)}]
      (testing "created_by: me keeps only the caller's content"
        (let [names (set (map :name (:data (search! {:term_queries ["AgentV2"]
                                                     :type         ["dashboard"]
                                                     :created_by   "me"}))))]
          (is (contains? names "AgentV2 Mine"))
          (is (not (contains? names "AgentV2 Theirs")))))
      (testing "a type with no creator in the index is refused, not silently narrowed to nothing"
        (let [message (refusal! {:type ["table"] :created_by "me"})]
          (is (re-find #"`created_by` only filters" message))
          (is (re-find #"table" message)))))))

(deftest collection-subtree-test
  (with-indexed
    (mt/with-temp [:model/Collection parent {:name "AgentV2 Parent"}
                   :model/Collection child  {:name "AgentV2 Child" :location (format "/%d/" (:id parent))}
                   :model/Card       _      {:name "AgentV2 Nested Question" :collection_id (:id child)}
                   :model/Card       _      {:name "AgentV2 Outside Question"}]
      (testing "collection_id scopes to the subtree, so a card in a descendant collection is in scope"
        (let [names (set (map :name (:data (search! {:term_queries  ["AgentV2"]
                                                     :type          ["question"]
                                                     :collection_id (:id parent)}))))]
          (is (contains? names "AgentV2 Nested Question"))
          (is (not (contains? names "AgentV2 Outside Question")))))
      (testing "an entity_id names the same collection as its numeric id"
        (is (= (map :name (:data (search! {:term_queries ["AgentV2"] :type ["question"]
                                           :collection_id (:id parent)})))
               (map :name (:data (search! {:term_queries ["AgentV2"] :type ["question"]
                                           :collection_id (:entity_id parent)}))))))
      (testing "collection_path is the breadcrumb, so an agent can say where a hit lives without walking the tree"
        (is (= ["Our analytics / AgentV2 Parent / AgentV2 Child"]
               (map :collection_path
                    (:data (search! {:term_queries ["AgentV2 Nested"] :type ["question"]})))))))))

(deftest archived-test
  (with-indexed
    (mt/with-temp [:model/Card _ {:name "AgentV2 Trashed" :archived true :archived_directly true}]
      (testing "the trash is a filter, not a separate tool"
        (is (contains? (set (map :name (:data (search! {:term_queries ["AgentV2 Trashed"] :archived true}))))
                       "AgentV2 Trashed")))
      (testing "and live content is what a search returns by default"
        (is (empty? (:data (search! {:term_queries ["AgentV2 Trashed"]}))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Snippets — the one type that is not in the index
;;; ──────────────────────────────────────────────────────────────────

(deftest snippets-test
  ;; native-query permission is granted per database, so a caller only has it once one exists.
  (mt/id)
  (with-indexed
    (mt/with-temp [:model/NativeQuerySnippet _ {:name "AgentV2 Revenue Snippet" :content "WHERE revenue > 0"}]
      (testing "snippets are served from their own table, since the index excludes them"
        (is (contains? (set (hits (search! {:type ["snippet"] :term_queries ["AgentV2"]})))
                       ["snippet" "AgentV2 Revenue Snippet"])))
      (testing "and never appear in a search that did not ask for them"
        (is (not (contains? (set (map :type (:data (search! {:term_queries ["AgentV2"]}))))
                            "snippet"))))
      (testing "the index's filters do not reach them, and the tool says so instead of ignoring the filter"
        (is (re-find #"Snippets are not in the search index"
                     (refusal! {:type ["snippet"] :created_by "me"}))))
      (testing "a caller without native-query permission gets none — the same check the snippet API makes"
        (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
          (is (empty? (:data (search! {:type ["snippet"]})))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The envelope
;;; ──────────────────────────────────────────────────────────────────

(deftest pagination-test
  (with-indexed
    (mt/with-temp [:model/Dashboard _ {:name "AgentV2 Page One"}
                   :model/Dashboard _ {:name "AgentV2 Page Two"}]
      (let [page-1 (search! {:term_queries ["AgentV2 Page"] :type ["dashboard"] :limit 1})
            page-2 (search! {:term_queries ["AgentV2 Page"] :type ["dashboard"] :limit 1 :offset 1})]
        (testing "a cut page says so, and the message names the next offset and how to narrow"
          (is (= 1 (:returned page-1)))
          (is (true? (:truncated page-1)))
          (is (re-find #"`offset: 1`" (:truncation_message page-1)))
          (is (re-find #"`type`" (:truncation_message page-1))))
        (testing "the next offset returns the next hit, not the same one"
          (is (= 1 (:returned page-2)))
          (is (not= (hits page-1) (hits page-2))))))))

(deftest response-format-test
  (with-indexed
    (mt/with-temp [:model/Card _ {:name "AgentV2 Projected Question" :description "a description"}]
      (testing "concise is the id, name, type, description, and where it lives — nothing else"
        (is (= #{:id :name :type :description :collection_path}
               (set (keys (first (:data (search! {:term_queries ["AgentV2 Projected"]})))))))
        (testing "and it is a subset of REST's own property names"
          (is (=? [{:type "question" :name "AgentV2 Projected Question" :description "a description"}]
                  (:data (search! {:term_queries ["AgentV2 Projected"]}))))))
      (testing "detailed carries what the index has, without the ranking internals"
        (let [row (first (:data (search! {:term_queries ["AgentV2 Projected"] :response_format "detailed"})))]
          (is (contains? row :updated_at))
          (is (not (contains? row :scores)))
          (is (not (contains? row :model))
              "`model` is the engine's word for it; the tool's word is `type`, and there is only one"))))))

(deftest max-limit-test
  (testing "a page bigger than the cap is refused at the schema, before any search runs"
    (is (some? (search! :rasta 400 {:term_queries ["orders"] :limit 500})))))
