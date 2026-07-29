(ns metabase.mcp.v2.tools.learn-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.skills :as skills]
   [metabase.mcp.v2.tools.learn :as learn]))

(set! *warn-on-reflection* true)

(comment learn/keep-me)

(defn- call
  [args]
  (registry/call-tool nil (str (random-uuid)) "learn" args))

(defn- text-of
  [result]
  (-> result :content first :text))

(deftest catalog-test
  (testing "learn() lists every pack with its description"
    (let [result (call {})]
      (is (not (:isError result)) (text-of result))
      (doseq [topic (skills/topics)]
        (is (str/includes? (text-of result) topic))))))

(deftest every-pack-loads-test
  (testing "learn(topic) returns each pack's whole SKILL.md, frontmatter included"
    (doseq [topic (skills/topics)]
      (let [result (call {:topic topic})]
        (is (not (:isError result)) (text-of result))
        (is (str/starts-with? (text-of result) "---")
            (str topic " should start with skill frontmatter"))
        (is (str/includes? (text-of result) (str "name: " topic)))))))

(deftest references-load-test
  (testing "every reference a pack declares is fetchable by name"
    (doseq [topic (skills/topics)
            ref   (skills/reference-names topic)]
      (let [result (call {:topic topic :reference ref})]
        (is (not (:isError result)) (text-of result))
        (is (pos? (count (text-of result)))))))
  (testing "a skill with references names them in its footer"
    (is (str/includes? (text-of (call {:topic "query-dialect"})) "operators"))))

(deftest pack-size-budget-test
  (testing "no SKILL.md exceeds the pack size budget (roughly 6k tokens)"
    (doseq [topic (skills/topics)]
      (is (< (count (skills/skill-text topic)) 24000)
          (str topic " exceeds the SKILL.md size budget")))))

(deftest unknown-topic-and-reference-test
  (testing "an unknown topic is a teaching error listing what exists"
    (let [result (call {:topic "nope"})]
      (is (:isError result))
      (is (str/includes? (text-of result) "query-dialect"))))
  (testing "an unknown reference is a teaching error naming the topic's references"
    (let [result (call {:topic "query-dialect" :reference "nope"})]
      (is (:isError result))
      (is (str/includes? (text-of result) "operators"))))
  (testing "a reference without a topic is a teaching error"
    (let [result (call {:reference "operators"})]
      (is (:isError result))
      (is (str/includes? (text-of result) "topic")))))

(deftest examples-speak-the-v2-dialect-test
  (testing "packs never teach the CLI/REST dialects the v2 tools don't accept"
    (doseq [topic (skills/topics)
            :let [text (str (skills/skill-text topic)
                            (str/join (map #(skills/reference-text topic %)
                                           (skills/reference-names topic))))]
            leaked ["mb card" "mb dashboard" "mb query" "mb skills" "mb uuid" "--profile" "--dry-run"]]
      (testing (str topic " must not mention " (pr-str leaked))
        (is (not (str/includes? text leaked)))))))
