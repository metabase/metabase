(ns metabase.mcp.v2.tools.learn-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   ;; every tool namespace, so the pointer sweep below sees every registered description
   [metabase.mcp.v2.api]
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

(defn- tool-descriptions
  "Every registered tool's description. `nil` token-scopes sees the whole surface."
  []
  (keep :description (registry/list-tools nil)))

(defn- learn-description
  []
  (->> (registry/list-tools nil)
       (filter #(= "learn" (:name %)))
       first
       :description))

(deftest catalog-reaches-the-tool-description-test
  (testing "the learn description names every pack and reference — it is the catalog a client
            that never calls learn() sees, and nothing else ties it to skills/packs, so a new
            pack lands in the registry while the advertised catalog silently omits it"
    (let [description (learn-description)]
      (is (some? description) "the learn tool is registered")
      (doseq [topic (skills/topics)]
        (is (str/includes? description topic)
            (str topic " is in skills/packs but missing from the learn tool description")))
      (doseq [topic (skills/topics)
              ref   (skills/reference-names topic)]
        (is (str/includes? description ref)
            (str "reference " ref " of " topic " is missing from the learn tool description"))))))

(def ^:private learn-pointer-re
  "Matches learn(\"topic\") and learn(\"topic\", \"reference\") as they read at runtime. Excluding
   `<` from both names skips the `learn(\"<topic>\", \"<name>\")` placeholders the skill footer
   and the tool descriptions spell out — a real pack or reference name never contains one."
  #"learn\(\"([^\"<]+)\"(?:,\s*\"([^\"<]+)\")?\)")

(deftest learn-pointers-resolve-test
  (testing "every learn(...) pointer in a tool description or pack body names a topic and
            reference that exist — renaming a pack otherwise leaves pointers aimed at nothing,
            and the model only finds out by calling learn() and getting a teaching error"
    (let [pack-texts (concat (map skills/skill-text (skills/topics))
                             (for [topic (skills/topics)
                                   ref   (skills/reference-names topic)]
                               (skills/reference-text topic ref)))
          pointers   (for [text  (concat (tool-descriptions) pack-texts)
                           match (re-seq learn-pointer-re (str text))]
                       match)
          topics     (set (skills/topics))]
      (is (seq pointers) "the sweep found pointers — an empty sweep would pass vacuously")
      (doseq [[whole topic ref] pointers]
        (is (contains? topics topic)
            (str whole " names a topic that does not exist"))
        (when ref
          (is (contains? (set (skills/reference-names topic)) ref)
              (str whole " names a reference that does not exist")))))))
