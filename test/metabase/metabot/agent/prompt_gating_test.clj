(ns metabase.metabot.agent.prompt-gating-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]
   [metabase.test :as mt]))

(def ^:private active-sql-tool-names
  "Active-tool names including the notebook builder and a SQL write tool, so guidance gates on permissions rather
  than on those tools being absent."
  ["construct_notebook_query" "create_sql_query"])

(def ^:private query-templates
  "The system prompts of the profiles that build queries."
  ["embedding-next.selmer"
   "internal.selmer"
   "natural-language-querying-fallback.selmer"
   "natural-language-querying-only.selmer"
   "slackbot.selmer"
   "sql-querying-only.selmer"])

(defn- render-template
  "Render `template` for `perms` and the scopes they grant. `active-tool-names` defaults to none. The prompt builder
  reads only tool names, so a name->nil map stands in for the real name->var one."
  ([template perms]
   (render-template template perms []))
  ([template perms active-tool-names]
   (binding [scope/*current-user-metabot-permissions* perms
             scope/*current-user-scope*               (scope/user-metabot-perms->scopes perms)]
     (prompts/build-system-message-content
      {:prompt-template template}
      {:current_time "2026-03-25T12:00:00Z"}
      (zipmap active-tool-names (repeat nil))
      []))))

(defn- render-internal-template
  "Render internal.selmer for `perms` and `active-tool-names` (default [[active-sql-tool-names]])."
  ([perms] (render-internal-template perms active-sql-tool-names))
  ([perms active-tool-names]
   (render-template "internal.selmer" perms active-tool-names)))

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
    (testing "denial points to SQL instead"
      (is (re-find #"offer to write SQL for them instead" without-nql)))))

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
      (is (re-find #"You cannot build queries" without-queries)))
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
      (is (re-find #"You cannot build queries" rendered))
      (is (re-find #"You cannot create dashboards or documents" rendered)))))

(deftest ^:parallel defaults-to-no-permissions-when-unbound-test
  (testing "when *current-user-metabot-permissions* is nil, defaults exclude everything"
    (let [rendered (render-internal-template nil)]
      (is (not (re-find #"MBQL shape rules" rendered)))
      (is (not (re-find #"Natural-language querying is your default" rendered)))
      (is (not (re-find #"X-ray auto-generated dashboards" rendered)))
      (is (re-find #"You cannot build queries" rendered))
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
  (render-template "slackbot.selmer" perms))

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
      (is (re-find #"Saved questions and metrics" with-other))
      (is (re-find #"Visual Previews" with-other)))
    (testing "other-tools sections excluded when not permitted"
      (is (not (re-find #"static_viz" without-other)))
      (is (not (re-find #"Saved questions and metrics" without-other)))
      (is (not (re-find #"Visual Previews" without-other))))
    (testing "visualization titles heading still covers nlq ad-hoc queries when other-tools is off"
      (is (re-find #"Visualization Titles" without-other))
      (is (re-find #"Ad-hoc queries" without-other)))
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

(deftest ^:parallel slackbot-prompt-teaches-standard-markdown-test
  ;; The channel answer goes in a `markdown` block, which renders standard markdown rather than
  ;; Slack's `mrkdwn`. Measured against the API: `*one*` comes back italic and `~one~` is not
  ;; parsed at all, so the old dialect would silently lose every bold and strikethrough.
  (testing "the prompt teaches the dialect the answer block actually renders (BOT-2010)"
    (let [rendered (render-slackbot-template all-yes-perms)]
      (testing "standard markdown is prescribed"
        (is (re-find #"`\*\*text\*\*` for bold text" rendered))
        (is (re-find #"`~~text~~` for strikethrough text" rendered)))
      (testing "and the Slack-only dialect is not"
        (is (not (re-find #"`\*text\*` for bold text" rendered)))
        (is (not (re-find #"`~text~` for strikethrough text" rendered))))
      (testing "Slack's link syntax is kept -- it does render inside a markdown block (measured)"
        (is (re-find #"<https://example\.com\|Link Text>" rendered))
        (is (re-find #"metabase://dashboard/123\|Dashboard Name" rendered))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Custom system prompt injection
;;; ──────────────────────────────────────────────────────────────────

(deftest custom-chat-instructions-injected-when-set-test
  (mt/with-premium-features #{:ai-controls}
    (mt/with-temporary-setting-values [metabot-chat-system-prompt "Always respond in French."]
      (doseq [template ["internal.selmer" "slackbot.selmer"]]
        (testing template
          (let [rendered (render-template template all-yes-perms)]
            (is (re-find #"Custom Instructions" rendered))
            (is (re-find #"Always respond in French" rendered))))))))

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

(deftest ^:parallel every-query-prompt-has-the-save-rule-test
  (testing "every prompt that builds queries tells the model when it can say that something is saved"
    (doseq [template query-templates]
      (testing template
        (is (re-find #"Say that it is saved only when a tool result says that it was saved"
                     (render-template template all-yes-perms active-sql-tool-names)))))))

(deftest ^:parallel communication-guidance-gates-on-reasoning-ui-test
  (testing "templates for surfaces with a reasoning timeline skip the narration guidance"
    (doseq [template ["internal.selmer"
                      "natural-language-querying-only.selmer"
                      "natural-language-querying-fallback.selmer"]]
      (let [rendered (render-template template all-yes-perms)]
        (is (not (re-find #"silent between tool calls" rendered))
            template))))
  (testing "the embedding SDK template (loader only) keeps the narration guidance"
    (let [rendered (render-template "embedding-next.selmer" all-yes-perms)]
      (is (re-find #"silent between tool calls" rendered)))))

(deftest ^:parallel prompt-gates-query-results-grounding-test
  (testing "without run_query the model is told it cannot see query results"
    (let [rendered (render-internal-template all-yes-perms ["construct_notebook_query"])]
      (is (re-find #"# Hard constraint: you cannot see query results" rendered))
      (is (not (re-find #"run_query" rendered)))))
  (testing "with run_query the model is told how to read results"
    (let [rendered (render-internal-template all-yes-perms ["construct_notebook_query" "run_query"])]
      (is (re-find #"# You can see results only by running a query" rendered))
      (is (re-find #"To read a saved question or model, run it with `run_query`" rendered))
      (is (re-find #"pass `show_chart: false` to `construct_notebook_query`" rendered))
      (is (not (re-find #"you cannot see query results" rendered))))))

(deftest ^:parallel prompt-answers-questions-about-the-screen-from-it-test
  (let [rendered (render-internal-template all-yes-perms ["construct_notebook_query" "run_query"])]
    (testing "with run_query, a request to analyze or explain what the user is viewing is answered from that query"
      (is (re-find #"When the user asks you to analyze or explain what they are viewing" rendered))
      (is (re-find #"answer from the query on their screen and don't build another one" rendered)))
    (testing "an answer from rows that were cut off says so and offers a query over all of them"
      (is (re-find #"If only its first rows are shown, say that your answer covers only those rows" rendered))
      (is (re-find #"offer a query that computes the answer over all of them" rendered)))
    (testing "a chart that needs a measure the query lacks still gets a query that computes it"
      (is (re-find #"a pie of a list with no numeric column, also gets a query that computes the measure" rendered))))
  (testing "without run_query it can't read that query, so it is not told to"
    (is (not (re-find #"answer from the query on their screen"
                      (render-internal-template all-yes-perms ["construct_notebook_query"]))))))

(deftest ^:parallel prompt-keeps-tools-out-of-answers-test
  (doseq [template ["embedding-next.selmer"
                    "internal.selmer"
                    "natural-language-querying-fallback.selmer"
                    "natural-language-querying-only.selmer"]]
    (testing template
      (is (re-find #"Don't mention your tools in your answer" (render-template template all-yes-perms))))))

(deftest prompt-gates-sql-execution-guidance-test
  (let [tools ["construct_notebook_query" "create_sql_query" "run_query"]]
    (testing "with SQL execution off the model is told run_query runs notebook queries only"
      (mt/with-temporary-setting-values [metabot-sql-execution-enabled? false]
        (let [rendered (render-internal-template all-yes-perms tools)]
          (is (re-find #"`run_query` runs notebook queries only" rendered))
          (is (not (re-find #"write SQL with `create_sql_query` and run it" rendered))))))
    (testing "with SQL execution on the model is told to prefer the notebook and run SQL for shapes it can't express"
      (mt/with-temporary-setting-values [metabot-sql-execution-enabled? true]
        (let [rendered (render-internal-template all-yes-perms tools)]
          (is (re-find #"Prefer a notebook query" rendered))
          (is (re-find #"write SQL with `create_sql_query` and run it with `run_query`" rendered))
          (is (not (re-find #"notebook queries only" rendered)))
          (is (re-find #"A count or total of 0 is a real answer" rendered)))))
    (testing "without the SQL tools the setting does not tell the model to write SQL"
      (mt/with-temporary-setting-values [metabot-sql-execution-enabled? true]
        (let [rendered (render-internal-template all-yes-perms ["construct_notebook_query" "run_query"])]
          (is (re-find #"`run_query` runs notebook queries only" rendered))
          (is (not (re-find #"write SQL with `create_sql_query`" rendered))))))
    (testing "without Metabot's SQL generation permission the setting does not tell the model to run SQL"
      (mt/with-temporary-setting-values [metabot-sql-execution-enabled? true]
        (let [rendered (render-internal-template no-sql-perms tools)]
          (is (re-find #"`run_query` runs notebook queries only" rendered))
          (is (not (re-find #"write SQL with `create_sql_query`" rendered))))))
    (testing "without the agent:sql:run scope the setting does not tell the model to run SQL"
      (mt/with-temporary-setting-values [metabot-sql-execution-enabled? true]
        (binding [scope/*current-user-metabot-permissions* all-yes-perms
                  scope/*current-user-scope*               #{"agent:query:*" "agent:sql:create"}]
          (let [rendered (prompts/build-system-message-content
                          {:prompt-template "internal.selmer"} {} (zipmap tools (repeat nil)) [])]
            (is (re-find #"`run_query` runs notebook queries only" rendered))
            (is (not (re-find #"write SQL with `create_sql_query`" rendered)))))))))

(deftest every-results-template-follows-sql-execution-test
  (doseq [template query-templates
          [sql-on? expected] [[true #"write SQL with `create_sql_query` and run it"]
                              [false #"`run_query` runs notebook queries only"]]]
    (testing (str template ", SQL execution " (if sql-on? "on" "off"))
      (mt/with-temporary-setting-values [metabot-sql-execution-enabled? sql-on?]
        (is (re-find expected (render-template template all-yes-perms
                                               ["construct_notebook_query" "create_sql_query" "run_query"])))))))

(deftest no-template-says-results-are-hidden-when-run-query-is-active-test
  (doseq [template query-templates
          [tools hidden?] [[["construct_notebook_query" "create_sql_query" "run_query"] false]
                           [["construct_notebook_query" "create_sql_query"] true]]]
    (testing (str template (if hidden? " without run_query" " with run_query"))
      (is (= hidden?
             (some? (re-find #"(?i)cannot (see (the actual |query )?results|execute queries)"
                             (render-template template all-yes-perms tools))))))))

(deftest ^:parallel every-query-template-gates-one-query-per-database-test
  (doseq [template query-templates
          [tools readable?] [[(conj active-sql-tool-names "run_query") true]
                             [active-sql-tool-names false]]]
    (testing (str template (if readable? " with run_query" " without run_query"))
      (let [rendered (render-template template all-yes-perms tools)]
        (testing "every profile is told that one query reads one database"
          (is (re-find #"don't combine data from two databases in Metabase" rendered)))
        (testing "a profile that can read rows runs one query per database, and refuses only when a result is truncated"
          (is (= readable?
                 (some? (re-find #"build one query for each database and run each one with `run_query`" rendered))))
          (is (= readable?
                 (some? (re-find #"If a result is truncated, the rows you can't see can change the answer" rendered)))))
        (testing "a profile that can't read rows tells the user that it can't combine the data"
          (is (= (not readable?)
                 (some? (re-find #"tell the user that you can't combine it in one query" rendered)))))))))

(deftest prompt-without-notebook-builder-test
  (testing "with NLQ permitted but no construct_notebook_query, as in :internal-sql, nothing names the builder"
    (let [tools ["create_sql_query" "run_query"]]
      (testing "and with SQL execution on, the model is told to get values by writing SQL and running it"
        (mt/with-temporary-setting-values [metabot-sql-execution-enabled? true]
          (let [rendered (render-internal-template all-yes-perms tools)]
            (is (re-find #"# You can see results only by running a query" rendered))
            (is (re-find #"When the answer needs a value, write SQL with `create_sql_query` and run it with `run_query`"
                         rendered))
            (is (re-find #"# Writing SQL" rendered))
            (is (re-find #"You cannot use natural language querying" rendered))
            (is (not (re-find #"construct_notebook_query" rendered)))
            (is (not (re-find #"source-card" rendered)))
            (is (not (re-find #"Prefer a notebook query" rendered)))
            (is (not (re-find #"notebook queries only" rendered)))
            (is (not (re-find #"MBQL shape rules" rendered)))
            (is (not (re-find #"Natural-language querying is your default" rendered)))
            (is (re-find #"build one query for each database and run each one with `run_query`" rendered)))))
      (testing "and with SQL execution off, run_query can read nothing, so the model is told it can't see results"
        (mt/with-temporary-setting-values [metabot-sql-execution-enabled? false]
          (let [rendered (render-internal-template all-yes-perms tools)]
            (is (re-find #"# Hard constraint: you cannot see query results" rendered))
            (is (re-find #"tell the user that you can't combine it in one query" rendered))
            (is (not (re-find #"construct_notebook_query" rendered)))
            (is (not (re-find #"run_query" rendered)))))))))
