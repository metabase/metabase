(ns metabase.metabot.agent.prompt-gating-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

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
   :permission/metabot-nlq            :yes
   :permission/metabot-other-tools    :yes})

(def ^:private no-sql-perms
  {:permission/metabot-sql-generation :no
   :permission/metabot-nlq            :yes
   :permission/metabot-other-tools    :yes})

(def ^:private no-nql-perms
  {:permission/metabot-sql-generation :yes
   :permission/metabot-nlq            :no
   :permission/metabot-other-tools    :yes})

(def ^:private all-no-perms
  {:permission/metabot-sql-generation :no
   :permission/metabot-nlq            :no
   :permission/metabot-other-tools    :no})

(deftest ^:parallel prompt-includes-sql-sections-when-permitted-test
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

(deftest ^:parallel prompt-excludes-sql-sections-when-not-permitted-test
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
      (is (not (re-find #"Not checking field formats before SQL" rendered))))
    (testing "explicit denial for SQL is included"
      (is (re-find #"You cannot write SQL" rendered)))
    (testing "denial suggests NLQ as alternative"
      (is (re-find #"natural language query builder" rendered)))))

(deftest ^:parallel prompt-gates-nql-section-test
  (let [with-nql    (render-internal-template all-yes-perms)
        without-nql (render-internal-template no-nql-perms)]
    (testing "NLQ guidance included when permitted"
      (is (re-find #"Natural Language Querying" with-nql)))
    (testing "NLQ routing included when permitted"
      (is (re-find #"Use natural language querying \(your default mode\)" with-nql)))
    (testing "NLQ guidance excluded when not permitted"
      (is (not (re-find #"Natural Language Querying" without-nql))))
    (testing "NLQ routing excluded when not permitted"
      (is (not (re-find #"Use natural language querying \(your default mode\)" without-nql))))
    (testing "explicit denial for NLQ is included when not permitted"
      (is (re-find #"You cannot use natural language querying" without-nql)))
    (testing "denial suggests SQL as alternative"
      (is (re-find #"offer to write SQL" without-nql)))))

(deftest ^:parallel prompt-gates-other-tools-section-test
  (let [with-other    (render-internal-template all-yes-perms)
        without-other (render-internal-template
                       {:permission/metabot-sql-generation :yes
                        :permission/metabot-nlq            :yes
                        :permission/metabot-other-tools    :no})]
    (testing "dashboard routing included when permitted"
      (is (re-find #"Use X-ray auto-generated dashboard tool" with-other)))
    (testing "dashboard routing excluded when not permitted"
      (is (not (re-find #"Use dashboard tools" without-other))))
    (testing "explicit denial for other tools is included when not permitted"
      (is (re-find #"You cannot create dashboards or documents" without-other)))))

(deftest ^:parallel prompt-gates-query-tools-sections-test
  (let [with-queries    (render-internal-template all-yes-perms)
        without-queries (render-internal-template
                         {:permission/metabot-sql-generation :no
                          :permission/metabot-nlq            :no
                          :permission/metabot-other-tools    :yes})]
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
      (is (re-find #"data analysis assistant" without-queries))
      (is (re-find #"Communication Style" without-queries))
      (is (re-find #"search_request" without-queries))
      (is (re-find #"Find \[existing content\]" without-queries)))
    (testing "explicit denial for query tools is included"
      (is (re-find #"You cannot build queries or create charts" without-queries)))
    (testing "no individual SQL/NQL denials when both are off"
      (is (not (re-find #"You cannot write SQL" without-queries)))
      (is (not (re-find #"You cannot use natural language querying" without-queries))))))

(deftest ^:parallel prompt-all-no-permissions-test
  (let [rendered (render-internal-template all-no-perms)]
    (testing "core prompt structure still renders"
      (is (re-find #"data analysis assistant" rendered))
      (is (re-find #"Communication Style" rendered)))
    (testing "all gated sections are excluded"
      (is (not (re-find #"sql_construction" rendered)))
      (is (not (re-find #"Natural Language Querying" rendered)))
      (is (not (re-find #"Use X-ray auto-generated dashboard tool" rendered)))
      (is (not (re-find #"CRITICAL CONSTRAINTS" rendered)))
      (is (not (re-find #"Verify Data Structure" rendered))))
    (testing "denial messages are present"
      (is (re-find #"You cannot build queries or create charts" rendered))
      (is (re-find #"You cannot create dashboards or documents" rendered)))))

(deftest ^:parallel defaults-to-no-permissions-when-unbound-test
  (testing "when *current-user-metabot-permissions* is nil, defaults exclude everything"
    (let [rendered (render-internal-template nil)]
      (is (not (re-find #"sql_construction" rendered)))
      (is (not (re-find #"Natural Language Querying" rendered)))
      (is (not (re-find #"Use X-ray auto-generated dashboard tool" rendered)))
      (is (not (re-find #"CRITICAL CONSTRAINTS" rendered)))
      (is (re-find #"You cannot build queries or create charts" rendered))
      (is (re-find #"You cannot create dashboards or documents" rendered)))))

(deftest ^:parallel prompt-no-denials-when-all-enabled-test
  (let [rendered (render-internal-template all-yes-perms)]
    (testing "no denial messages when all permissions are enabled"
      (is (not (re-find #"You cannot" rendered))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Slackbot template gating
;;; ──────────────────────────────────────────────────────────────────

(defn- render-slackbot-template
  "Render the slackbot.selmer template with given permission flags."
  [perms]
  (binding [scope/*current-user-metabot-permissions* perms]
    (prompts/build-system-message-content
     {:prompt-template "slackbot.selmer"}
     {:current_time "2026-03-25T12:00:00Z"}
     {})))

(deftest ^:parallel slackbot-nlq-sections-gated-test
  (let [with-nlq    (render-slackbot-template all-yes-perms)
        without-nlq (render-slackbot-template {:permission/metabot-sql-generation :yes
                                               :permission/metabot-nlq            :no
                                               :permission/metabot-other-tools    :yes})]
    (testing "NLQ sections included when permitted"
      (is (re-find #"construct_notebook_query" with-nlq))
      (is (re-find #"Data Exploration Workflow" with-nlq))
      (is (re-find #"Request Modification Workflow" with-nlq))
      (is (re-find #"CSV File Uploads" with-nlq)))
    (testing "NLQ sections excluded when not permitted"
      (is (not (re-find #"construct_notebook_query" without-nlq)))
      (is (not (re-find #"Data Exploration Workflow" without-nlq)))
      (is (not (re-find #"Request Modification Workflow" without-nlq)))
      (is (not (re-find #"CSV File Uploads" without-nlq))))
    (testing "NLQ denial message present when not permitted"
      (is (re-find #"You cannot build custom queries" without-nlq)))))

(deftest ^:parallel slackbot-other-tools-sections-gated-test
  (let [with-other    (render-slackbot-template all-yes-perms)
        without-other (render-slackbot-template {:permission/metabot-sql-generation :yes
                                                 :permission/metabot-nlq            :yes
                                                 :permission/metabot-other-tools    :no})]
    (testing "other-tools sections included when permitted"
      (is (re-find #"static_viz" with-other))
      (is (re-find #"Visualization Titles" with-other))
      (is (re-find #"Visual Previews" with-other)))
    (testing "other-tools sections excluded when not permitted"
      (is (not (re-find #"static_viz" without-other)))
      (is (not (re-find #"Visualization Titles" without-other)))
      (is (not (re-find #"Visual Previews" without-other))))
    (testing "other-tools denial message present when not permitted"
      (is (re-find #"You cannot create inline visualizations" without-other)))))

(deftest ^:parallel slackbot-all-no-permissions-test
  (let [rendered (render-slackbot-template all-no-perms)]
    (testing "core structure still renders"
      (is (re-find #"expert data analyst" rendered))
      (is (re-find #"business-validated insights" rendered)))
    (testing "NLQ and viz sections excluded"
      (is (not (re-find #"construct_notebook_query" rendered)))
      (is (not (re-find #"static_viz" rendered))))
    (testing "denial messages present"
      (is (re-find #"You cannot build custom queries" rendered))
      (is (re-find #"You cannot create inline visualizations" rendered)))))

(deftest ^:parallel slackbot-no-denials-when-all-enabled-test
  (let [rendered (render-slackbot-template all-yes-perms)]
    (testing "no denial messages when all permissions are enabled"
      (is (not (re-find #"You cannot build custom queries" rendered)))
      (is (not (re-find #"You cannot create inline visualizations" rendered))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Custom system prompt injection
;;; ──────────────────────────────────────────────────────────────────

(defn- render-template
  "Render a template with given permission flags and optional setting overrides."
  [template-name perms]
  (binding [scope/*current-user-metabot-permissions* perms]
    (prompts/build-system-message-content
     {:prompt-template template-name}
     {:current_time "2026-03-25T12:00:00Z"}
     {})))

(deftest custom-chat-instructions-injected-when-set-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [metabot-chat-system-prompt "Always respond in French."]
      (let [rendered (render-template "internal.selmer" all-yes-perms)]
        (is (re-find #"Custom Instructions" rendered))
        (is (re-find #"Always respond in French" rendered))))))

(deftest custom-sql-instructions-injected-when-set-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [metabot-sql-system-prompt "Always respond in French."]
      (let [rendered (render-template "sql-querying-only.selmer" all-yes-perms)]
        (is (re-find #"Custom Instructions" rendered))
        (is (re-find #"Always respond in French" rendered))))))

(deftest custom-nlq-instructions-injected-when-set-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [metabot-nlq-system-prompt "Always respond in French."]
      (let [rendered (render-template "natural-language-querying-only.selmer" all-yes-perms)]
        (is (re-find #"Custom Instructions" rendered))
        (is (re-find #"Always respond in French" rendered))))))

(deftest custom-instructions-absent-when-empty-test
  (mt/with-temporary-setting-values [metabot-chat-system-prompt ""
                                     metabot-nlq-system-prompt ""
                                     metabot-sql-system-prompt ""]
    (testing "internal template has no custom instructions section"
      (let [rendered (render-template "internal.selmer" all-yes-perms)]
        (is (not (re-find #"Custom Instructions" rendered)))))
    (testing "sql template has no custom instructions section"
      (let [rendered (render-template "sql-querying-only.selmer" all-yes-perms)]
        (is (not (re-find #"Custom Instructions" rendered)))))
    (testing "nlq template has no custom instructions section"
      (let [rendered (render-template "natural-language-querying-only.selmer" all-yes-perms)]
        (is (not (re-find #"Custom Instructions" rendered)))))))

(deftest custom-instructions-isolated-per-template-test
  (testing "chat prompt does not appear in sql template"
    (mt/with-temporary-setting-values [metabot-chat-system-prompt "Chat only instruction."
                                       metabot-sql-system-prompt ""]
      (let [rendered (render-template "sql-querying-only.selmer" all-yes-perms)]
        (is (not (re-find #"Chat only instruction" rendered))))))
  (testing "sql prompt does not appear in nlq template"
    (mt/with-temporary-setting-values [metabot-sql-system-prompt "SQL only instruction."
                                       metabot-nlq-system-prompt ""]
      (let [rendered (render-template "natural-language-querying-only.selmer" all-yes-perms)]
        (is (not (re-find #"SQL only instruction" rendered))))))
  (testing "nlq prompt does not appear in chat template"
    (mt/with-temporary-setting-values [metabot-nlq-system-prompt "NLQ only instruction."
                                       metabot-chat-system-prompt ""]
      (let [rendered (render-template "internal.selmer" all-yes-perms)]
        (is (not (re-find #"NLQ only instruction" rendered)))))))
