(ns metabase.metabot.defendpoint-bridge-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.defendpoint-bridge :as bridge]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(deftest manifest-includes-collection-tools-test
  (testing "the four annotated collection endpoints show up in the manifest"
    (let [names (bridge/manifest-tool-names)]
      (is (contains? names "list_collections"))
      (is (contains? names "get_collection"))
      (is (contains? names "list_collection_items"))
      (is (contains? names "create_collection")))))

(deftest endpoint-tools-shape-test
  (testing "endpoint-tools returns tool defs with the keys the agent loop expects"
    (binding [scope/*current-user-scope* #{"agent:collection:*"}]
      (let [tools (bridge/endpoint-tools #{"list_collections" "get_collection"})]
        (is (= #{"list_collections" "get_collection"} (set (keys tools))))
        (doseq [[_ tool-def] tools]
          (is (string? (:tool-name tool-def)))
          (is (string? (:doc tool-def)))
          (is (map? (:schema tool-def)))
          (is (= "object" (get-in tool-def [:schema :type])))
          (is (fn? (:fn tool-def))))))))

(deftest endpoint-tools-scope-filtering-test
  (testing "scope-restricted tools are excluded when the user lacks the scope"
    (binding [scope/*current-user-scope* #{}]
      (let [tools (bridge/endpoint-tools #{"list_collections" "create_collection"})]
        (is (empty? tools)
            "no scopes ⇒ no bridge tools"))))
  (testing "read scope grants list/get tools but not create"
    (binding [scope/*current-user-scope* #{"agent:collection:read"}]
      (let [tools (bridge/endpoint-tools #{"list_collections" "create_collection"})]
        (is (contains? tools "list_collections"))
        (is (not (contains? tools "create_collection")))))))

(deftest list-collections-happy-path-test
  (testing "list_collections returns the visible collections for the current user"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection _ {:name "Bridge POC Marketing"}]
        (binding [scope/*current-user-scope* #{"agent:collection:*"}]
          (let [tools  (bridge/endpoint-tools #{"list_collections"})
                tool   (get tools "list_collections")
                result ((:fn tool) {:q "bridge poc marketing"})]
            (is (string? (:output result)))
            (is (some #(= "Bridge POC Marketing" (:name %))
                      (:structured-output result))
                "the seeded collection appears in the structured output")
            (testing "instructions are appended for LLM consumption"
              (is (some? (:instructions result))))))))))

(deftest list-collections-limit-test
  (testing "list_collections respects the limit cap"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"list_collections"}) "list_collections")
              result ((:fn tool) {:limit 1})]
          (is (= 1 (count (:structured-output result)))
              "limit caps the result to N rows"))))))

(deftest get-collection-not-found-test
  (testing "missing collection produces a readable error, not a stack trace"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"get_collection"}) "get_collection")
              result ((:fn tool) {:id 999999999})]
          (is (re-find #"(?i)error" (:output result))))))))

(deftest path-interpolation-test
  (testing "path placeholders fail loudly when arguments are missing"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"get_collection"}) "get_collection")
              result ((:fn tool) {})]
          (is (re-find #"(?i)error.*id" (:output result))))))))

(deftest output-structured-payload-is-json-encodable-test
  (testing "the LLM-visible :output is a JSON string we can round-trip"
    (mt/with-current-user (mt/user->id :crowberto)
      (binding [scope/*current-user-scope* #{"agent:collection:*"}]
        (let [tool   (get (bridge/endpoint-tools #{"list_collections"}) "list_collections")
              result ((:fn tool) {:limit 1})
              [_ encoded] (re-find #"(?s)Result.*?:\n(.*)" (:output result))]
          (is (some? encoded))
          (is (sequential? (json/decode encoded))))))))
