(ns metabase.mcp.prompts-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.prompts :as mcp.prompts]))

(set! *warn-on-reflection* true)

(def ^:private read-scopes #{"agent:discover:read" "agent:query:read"})
(def ^:private write-scopes (conj read-scopes "agent:author:write"))

(defn- prompt-names [token-scopes]
  (into #{} (map :name) (:prompts (mcp.prompts/list-prompts token-scopes))))

(deftest ^:parallel list-prompts-is-scope-filtered-test
  (testing "a token that cannot write is not offered a playbook whose fourth step is a write"
    (is (= #{"explore_database"} (prompt-names read-scopes))))
  (testing "a token that can write is offered both"
    (is (= #{"explore_database" "build_dashboard"} (prompt-names write-scopes))))
  (testing "session auth sees everything"
    (is (= #{"explore_database" "build_dashboard"} (prompt-names nil)))))

(deftest ^:parallel list-prompts-declares-its-arguments-test
  (let [prompt (first (filter #(= "build_dashboard" (:name %))
                              (:prompts (mcp.prompts/list-prompts write-scopes))))]
    (is (not (str/blank? (:title prompt))))
    (is (not (str/blank? (:description prompt))))
    (testing "every argument is published with a description and an explicit `required` flag"
      (is (= [{:name "topic" :description "What the dashboard should cover, in the user's words." :required true}
              {:name "collection" :description "Where to save it. Defaults to asking." :required false}]
             (:arguments prompt))))))

(deftest ^:parallel get-prompt-renders-its-arguments-test
  (let [result (mcp.prompts/get-prompt "build_dashboard"
                                       {:topic "churn" :collection "the Growth collection"}
                                       write-scopes)
        text   (get-in result [:messages 0 :content :text])]
    (is (= :ok (:status result)))
    (is (= "user" (get-in result [:messages 0 :role])))
    (is (str/includes? text "churn"))
    (is (str/includes? text "the Growth collection"))
    (testing "the rendered playbook names the tools it walks through"
      (is (str/includes? text "dashboard_write")))))

(deftest ^:parallel get-prompt-fills-omitted-optional-arguments-test
  (testing "an omitted optional argument renders as prose, never as an empty hole in the sentence"
    (let [text (-> (mcp.prompts/get-prompt "build_dashboard" {:topic "churn"} write-scopes)
                   (get-in [:messages 0 :content :text]))]
      (is (str/includes? text "a collection you have chosen with the user"))
      (is (not (str/includes? text "{{"))))))

(deftest ^:parallel get-prompt-requires-its-required-arguments-test
  (testing "a missing required argument names itself, so the client can ask for it"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Missing required argument: topic"
                          (mcp.prompts/get-prompt "build_dashboard" {} write-scopes)))))

(deftest ^:parallel get-prompt-hides-what-the-listing-hides-test
  (testing "a prompt the token may not use is not found, so the listing and the fetch cannot disagree"
    (is (= :not-found (:status (mcp.prompts/get-prompt "build_dashboard" {:topic "churn"} read-scopes)))))
  (testing "an unknown prompt is the same answer"
    (is (= :not-found (:status (mcp.prompts/get-prompt "nope" {} write-scopes))))))
