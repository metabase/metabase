(ns metabase.metabot.agent.prompt-gating-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

(def ^:private active-sql-tool-names
  "Active-tool names including a SQL write tool, so SQL guidance gates on permissions rather than on
  the SQL tools being absent."
  ["create_sql_query"])

(defn- render-internal-template
  "Render internal.selmer for `perms` and `active-tool-names` (default [[active-sql-tool-names]]).
  The prompt builder reads only tool names, so a name->nil map stands in for the real name->var one."
  ([perms] (render-internal-template perms active-sql-tool-names))
  ([perms active-tool-names]
   (binding [scope/*current-user-metabot-permissions* perms]
     (prompts/build-system-message-content
      {:prompt-template "internal.selmer"}
      {:current_time "2026-03-25T12:00:00Z"}
      (zipmap active-tool-names (repeat nil))
      []))))

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

;; Gating is asserted on real, intentional content: the section headings that only
;; appear when a capability is enabled, and the "You cannot …" denial sentences that
;; only appear when it's disabled. These are load-bearing prose we keep regardless, so
;; the tests track the gating contract without coupling to incidental wording.

(deftest ^:parallel prompt-includes-sql-sections-when-permitted-test
  (let [rendered (render-internal-template all-yes-perms)]
    (testing "SQL section is included"
      (is (re-find #"# Writing SQL" rendered)))))

(deftest ^:parallel prompt-excludes-sql-sections-when-not-permitted-test
  (let [rendered (render-internal-template no-sql-perms)]
    (testing "SQL section is excluded"
      (is (not (re-find #"# Writing SQL" rendered))))
    (testing "explicit denial for SQL is included"
      (is (re-find #"You cannot write SQL" rendered)))
    (testing "denial suggests NLQ as alternative"
      (is (re-find #"natural language query builder" rendered)))))

(deftest ^:parallel prompt-excludes-sql-sections-when-tools-inactive-test
  (testing "SQL permission alone does not render SQL guidance when no SQL write tool is active
           (the tools are capability-gated, so the prompt must not cite tools/skills that are absent)"
    (let [rendered (render-internal-template all-yes-perms ["construct_notebook_query"])]
      (is (not (re-find #"# Writing SQL" rendered)))
      (is (re-find #"You cannot write SQL" rendered)))))

(deftest ^:parallel prompt-gates-nql-section-test
  (let [with-nql    (render-internal-template all-yes-perms)
        without-nql (render-internal-template no-nql-perms)]
    (testing "NLQ guidance included when permitted"
      (is (re-find #"Natural-language querying is your default" with-nql)))
    (testing "NLQ guidance excluded when not permitted"
      (is (not (re-find #"Natural-language querying is your default" without-nql))))
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
    (testing "dashboard guidance included when permitted"
      (is (re-find #"X-ray auto-generated dashboards" with-other)))
    (testing "dashboard guidance excluded when not permitted"
      (is (not (re-find #"X-ray auto-generated dashboards" without-other))))
    (testing "explicit denial for other tools is included when not permitted"
      (is (re-find #"You cannot create dashboards or documents" without-other)))))

(deftest ^:parallel prompt-gates-query-tools-sections-test
  (let [with-queries    (render-internal-template all-yes-perms)
        without-queries (render-internal-template
                         {:permission/metabot-sql-generation :no
                          :permission/metabot-nlq            :no
                          :permission/metabot-other-tools    :yes})]
    (testing "query-focused sections included when NLQ or SQL is available"
      ;; the grounding + MBQL-shape includes only render inside the query-tools branch
      (is (re-find #"you cannot see query results" with-queries))
      (is (re-find #"MBQL shape rules" with-queries)))
    (testing "query-focused sections excluded when neither NLQ nor SQL is available"
      (is (not (re-find #"MBQL shape rules" without-queries)))
      (is (re-find #"Discovery only" without-queries)))
    (testing "general sections remain even without query tools"
      (is (re-find #"data analysis assistant" without-queries))
      (is (re-find #"Communicating with the user" without-queries))
      (is (re-find #"Finding data" without-queries)))
    (testing "explicit denial for query tools is included"
      (is (re-find #"You cannot build queries or create charts" without-queries)))
    (testing "no individual SQL/NLQ denials when both are off"
      (is (not (re-find #"You cannot write SQL" without-queries)))
      (is (not (re-find #"You cannot use natural language querying" without-queries))))))

(deftest ^:parallel prompt-all-no-permissions-test
  (let [rendered (render-internal-template all-no-perms)]
    (testing "core prompt structure still renders"
      (is (re-find #"data analysis assistant" rendered))
      (is (re-find #"Communicating with the user" rendered)))
    (testing "all gated sections are excluded"
      (is (not (re-find #"MBQL shape rules" rendered)))
      (is (not (re-find #"Natural-language querying is your default" rendered)))
      (is (not (re-find #"X-ray auto-generated dashboards" rendered)))
      (is (not (re-find #"# Writing SQL" rendered))))
    (testing "denial messages are present"
      (is (re-find #"You cannot build queries or create charts" rendered))
      (is (re-find #"You cannot create dashboards or documents" rendered)))))

(deftest ^:parallel defaults-to-no-permissions-when-unbound-test
  (testing "when *current-user-metabot-permissions* is nil, defaults exclude everything"
    (let [rendered (render-internal-template nil)]
      (is (not (re-find #"MBQL shape rules" rendered)))
      (is (not (re-find #"Natural-language querying is your default" rendered)))
      (is (not (re-find #"X-ray auto-generated dashboards" rendered)))
      (is (re-find #"You cannot build queries or create charts" rendered))
      (is (re-find #"You cannot create dashboards or documents" rendered)))))

(deftest ^:parallel prompt-no-denials-when-all-enabled-test
  (let [rendered (render-internal-template all-yes-perms)]
    (testing "no denial sentences when all permissions are enabled"
      (is (not (re-find #"You cannot build queries" rendered)))
      (is (not (re-find #"You cannot write SQL" rendered)))
      (is (not (re-find #"You cannot use natural language querying" rendered)))
      (is (not (re-find #"You cannot create dashboards" rendered))))))

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
     {}
     [])))

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
     {}
     [])))

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
