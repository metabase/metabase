(ns metabase.metabot.agent.prompt-gating-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]))

(defn- render-internal-template
  "Render the internal.selmer template with given permission flags."
  [perms]
  (binding [scope/*current-user-metabot-permissions* perms]
    (prompts/build-system-message-content
     {:prompt-template "internal.selmer"}
     {:current_time "2026-03-25T12:00:00Z"}
     {})))

(def ^:private all-yes-perms
  {:permission/metabot-sql-generation :yes
   :permission/metabot-nql            :yes
   :permission/metabot-other-tools    :yes
   :permission/metabot-model          :large})

(def ^:private no-sql-perms
  {:permission/metabot-sql-generation :no
   :permission/metabot-nql            :yes
   :permission/metabot-other-tools    :yes
   :permission/metabot-model          :large})

(def ^:private no-nql-perms
  {:permission/metabot-sql-generation :yes
   :permission/metabot-nql            :no
   :permission/metabot-other-tools    :yes
   :permission/metabot-model          :large})

(def ^:private all-no-perms
  {:permission/metabot-sql-generation :no
   :permission/metabot-nql            :no
   :permission/metabot-other-tools    :no
   :permission/metabot-model          :small})

(deftest prompt-includes-sql-sections-when-permitted-test
  (let [rendered (render-internal-template all-yes-perms)]
    (testing "SQL construction section is included"
      (is (re-find #"sql_construction" rendered)))
    (testing "SQL routing option is included"
      (is (re-find #"Use SQL tools" rendered)))
    (testing "SQL examples are included"
      (is (re-find #"sql_writing" rendered)))
    (testing "SQL tool selection guidance is included"
      (is (re-find #"Explicitly requested.*Write SQL" rendered)))
    (testing "SQL anti-pattern example is included"
      (is (re-find #"Not checking field formats before SQL" rendered)))))

(deftest prompt-excludes-sql-sections-when-not-permitted-test
  (let [rendered (render-internal-template no-sql-perms)]
    (testing "SQL construction section is excluded"
      (is (not (re-find #"sql_construction" rendered))))
    (testing "SQL routing option is excluded"
      (is (not (re-find #"Use SQL tools" rendered))))
    (testing "SQL examples are excluded"
      (is (not (re-find #"sql_writing" rendered))))
    (testing "SQL tool selection guidance is excluded"
      (is (not (re-find #"Explicitly requested.*Write SQL" rendered))))
    (testing "SQL anti-pattern example is excluded"
      (is (not (re-find #"Not checking field formats before SQL" rendered))))))

(deftest prompt-gates-nql-section-test
  (let [with-nql    (render-internal-template all-yes-perms)
        without-nql (render-internal-template no-nql-perms)]
    (testing "NLQ guidance included when permitted"
      (is (re-find #"Natural Language Querying" with-nql)))
    (testing "NLQ routing included when permitted"
      (is (re-find #"Use natural language querying \(your default mode\)" with-nql)))
    (testing "NLQ guidance excluded when not permitted"
      (is (not (re-find #"Natural Language Querying" without-nql))))
    (testing "NLQ routing excluded when not permitted"
      (is (not (re-find #"Use natural language querying \(your default mode\)" without-nql))))))

(deftest prompt-gates-other-tools-section-test
  (let [with-other    (render-internal-template all-yes-perms)
        without-other (render-internal-template
                       {:permission/metabot-sql-generation :yes
                        :permission/metabot-nql            :yes
                        :permission/metabot-other-tools    :no
                        :permission/metabot-model          :large})]
    (testing "dashboard routing included when permitted"
      (is (re-find #"Use dashboard tools" with-other)))
    (testing "dashboard routing excluded when not permitted"
      (is (not (re-find #"Use dashboard tools" without-other))))))

(deftest prompt-gates-query-tools-sections-test
  (let [with-queries    (render-internal-template all-yes-perms)
        without-queries (render-internal-template
                         {:permission/metabot-sql-generation :no
                          :permission/metabot-nql            :no
                          :permission/metabot-other-tools    :yes
                          :permission/metabot-model          :large})]
    (testing "query-focused sections included when NQL or SQL is available"
      (is (re-find #"CRITICAL CONSTRAINTS" with-queries))
      (is (re-find #"Verify Data Structure" with-queries))
      (is (re-find #"Anti-Patterns" with-queries))
      (is (re-find #"value_in_samples" with-queries))
      (is (re-find #"Show me X" with-queries)))
    (testing "query-focused sections excluded when neither NQL nor SQL is available"
      (is (not (re-find #"CRITICAL CONSTRAINTS" without-queries)))
      (is (not (re-find #"Verify Data Structure" without-queries)))
      (is (not (re-find #"Anti-Patterns" without-queries)))
      (is (not (re-find #"value_in_samples" without-queries)))
      (is (not (re-find #"Show me X" without-queries))))
    (testing "general sections remain even without query tools"
      (is (re-find #"Metabot" without-queries))
      (is (re-find #"Context Grounding" without-queries))
      (is (re-find #"Communication Style" without-queries))
      (is (re-find #"search_request" without-queries))
      (is (re-find #"Find \[existing content\]" without-queries)))))

(deftest prompt-all-no-permissions-test
  (let [rendered (render-internal-template all-no-perms)]
    (testing "core prompt structure still renders"
      (is (re-find #"Metabot" rendered))
      (is (re-find #"Context Grounding" rendered))
      (is (re-find #"Communication Style" rendered)))
    (testing "all gated sections are excluded"
      (is (not (re-find #"sql_construction" rendered)))
      (is (not (re-find #"Natural Language Querying" rendered)))
      (is (not (re-find #"Use dashboard tools" rendered)))
      (is (not (re-find #"CRITICAL CONSTRAINTS" rendered)))
      (is (not (re-find #"Verify Data Structure" rendered))))))

(deftest defaults-to-no-permissions-when-unbound-test
  (testing "when *current-user-metabot-permissions* is nil, defaults exclude everything"
    (let [rendered (render-internal-template nil)]
      (is (not (re-find #"sql_construction" rendered)))
      (is (not (re-find #"Natural Language Querying" rendered)))
      (is (not (re-find #"Use dashboard tools" rendered)))
      (is (not (re-find #"CRITICAL CONSTRAINTS" rendered))))))
