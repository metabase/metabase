(ns metabase.mcp.v2.common-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]))

(set! *warn-on-reflection* true)

(deftest ^:parallel list-envelope-test
  (is (= {:data [{:id 1} {:id 2}] :returned 2 :total 214}
         (common/list-envelope [{:id 1} {:id 2}] 214)))
  (testing "total is omitted when unknown"
    (is (= {:data [] :returned 0} (common/list-envelope [])))))

(deftest ^:parallel truncation-line-test
  (testing "a truncated page names the narrowing parameter and the next offset"
    (let [line (common/truncation-line {:param "search" :offset 0 :limit 50 :total 214})]
      (is (str/includes? line "`search`"))
      (is (str/includes? line "offset: 50"))))
  (testing "the final page gets no steering line"
    (is (nil? (common/truncation-line {:param "search" :offset 200 :limit 50 :total 214})))))

(deftest ^:parallel teaching-error-test
  (testing "teaching errors surface their message as MCP error content"
    (let [content (try
                    (common/throw-teaching-error "Use `fields` OR `response_format`, not both.")
                    (catch clojure.lang.ExceptionInfo e
                      (common/->mcp-error-content e)))]
      (is (:isError content))
      (is (= "Use `fields` OR `response_format`, not both."
             (-> content :content first :text))))))

(deftest ^:parallel success-content-test
  (testing "read responses default to text-only"
    (is (= {:content [{:type "text" :text "hi"}]} (common/success-content "hi"))))
  (testing "structuredContent is emitted only when explicitly passed"
    (is (= {:ok true} (:structuredContent (common/success-content "hi" {:ok true}))))))

(deftest ^:parallel response-format-test
  (is (= :concise (common/response-format {})))
  (is (= :concise (common/response-format {:response_format "concise"})))
  (is (= :detailed (common/response-format {:response_format "detailed"})))
  (is (thrown-with-msg? Exception #"concise"
                        (common/response-format {:response_format "verbose"}))))

(deftest ^:parallel resolve-id-test
  (testing "numeric ids pass through without a lookup"
    (is (= 7 (common/resolve-id-or-404 :model/Card 7))))
  (testing "anything that is neither numeric nor a 21-char entity_id is a teaching error"
    (is (thrown-with-msg? Exception #"entity_id"
                          (common/resolve-id-or-404 :model/Card "abc")))))

(deftest ^:parallel resolve-and-read-collapses-existence-test
  (testing "\"exists but unreadable\" throws the same not-found error as \"doesn't exist\""
    (let [denied  (try (common/resolve-and-read :model/Card 7
                                                (fn [_] (throw (ex-info "You don't have permission." {:status-code 403}))))
                       (catch Exception e (ex-message e)))
          missing (try (common/resolve-and-read :model/Card 7
                                                (fn [_] (throw (ex-info "Not found." {:status-code 404}))))
                       (catch Exception e (ex-message e)))]
      (is (= denied missing))
      (is (str/includes? denied "not found")))))

(deftest ^:parallel resolve-collection-id-test
  (is (nil? (common/resolve-collection-id nil)))
  (is (nil? (common/resolve-collection-id "root")))
  (is (= 99 (common/resolve-collection-id "trash" {:trash-collection-id 99})))
  (is (thrown? Exception (common/resolve-collection-id "trash"))))

(deftest ^:parallel select-fields-test
  (let [row {:id 5 :name "Fin" :description "d" :location "/" :archived false}]
    (testing "narrows to the requested paths"
      (is (= {:id 5 :name "Fin"} (common/select-fields :collection row ["id" "name"]))))
    (testing "an unknown path is a teaching error naming the nearest valid paths"
      (is (thrown-with-msg? Exception #"name"
                            (common/select-fields :collection row ["nmae"]))))
    (testing "mutual exclusion with response_format/include"
      (is (thrown-with-msg? Exception #"not both"
                            (common/select-fields :collection row ["id"] {:response-format "detailed"})))))
  (testing "paths are item-relative inside arrays"
    (let [row {:id 1 :parameters [{:id "p1" :name "Cat" :type "category"}
                                  {:id "p2" :name "State" :type "category"}]}]
      (is (= {:parameters [{:name "Cat"} {:name "State"}]}
             (common/select-fields :question row ["parameters.name"])))
      (testing "a whole-subtree path absorbs a deeper path under it, in either order"
        (doseq [fields [["parameters" "parameters.name"]
                        ["parameters.name" "parameters"]]]
          (is (= {:parameters (:parameters row)}
                 (common/select-fields :question row fields))))))))

(deftest ^:parallel projections-test
  (let [row {:id 5 :name "Fin" :description "d" :location "/" :archived false
             :personal_owner_id nil :entity_id "eid" :slug "fin" :created_at "t"}]
    (testing "concise is a subset of the REST response with the same property names"
      (is (= {:id 5 :name "Fin" :description "d" :location "/" :archived false}
             (projections/project :collection :concise row))))
    (testing "the catalog is generated from the detailed projection shape"
      (is (contains? (set (projections/catalog :collection)) "name"))
      (is (contains? (set (projections/catalog :question)) "parameters.name")))))

;; not ^:parallel: the kondo deftest lint treats the `!` suffix as destructive
(deftest check-update-scope-test
  (testing "a scoped token without the update scope is rejected with a teaching message"
    (is (thrown-with-msg? Exception #"method: update"
                          (common/check-update-scope! #{"agent:question:create"}
                                                      "agent:question:update"
                                                      "question_write"))))
  (testing "cookie sessions (unrestricted sentinel) bypass"
    (is (nil? (common/check-update-scope! #{::scope/unrestricted}
                                          "agent:question:update"
                                          "question_write")))))

(deftest ^:parallel dispatch-write-test
  (let [entry {:tool-name       "collection_write"
               :update-scope    "agent:collection:update"
               :create-required [:name]}]
    (testing "create enforces (create)-required fields"
      (is (= [:create {:name "X"}] (common/dispatch-write entry nil {:method "create" :name "X"})))
      (is (thrown-with-msg? Exception #"`name` is required"
                            (common/dispatch-write entry nil {:method "create"}))))
    (testing "update requires id and re-checks the update scope at runtime"
      (is (= [:update 3 {:name "Y"}]
             (common/dispatch-write entry #{::scope/unrestricted} {:method "update" :id 3 :name "Y"})))
      (is (thrown-with-msg? Exception #"`id` is required"
                            (common/dispatch-write entry #{::scope/unrestricted} {:method "update"})))
      (is (thrown-with-msg? Exception #"method: update"
                            (common/dispatch-write entry #{"agent:collection:create"} {:method "update" :id 3}))))
    (testing "an unknown method is a teaching error"
      (is (thrown-with-msg? Exception #"create.*update"
                            (common/dispatch-write entry nil {:method "delete"}))))))
