(ns mage.papercuts.transcript-test
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.papercuts.transcript :as transcript]))

(set! *warn-on-reflection* true)

(defn- write-jsonl [records]
  (let [file (str (fs/create-temp-file {:suffix ".jsonl"}))]
    (spit file (str/join "\n" (map #(if (string? %) % (json/write-str %)) records)))
    file))

;; Fake secrets are assembled at runtime so the repository's token scanner doesn't flag this file.
(def ^:private fake-github-token (str "ghp" "_" (apply str (repeat 36 "a"))))
(def ^:private fake-mixed-secret (str "Ab1" (apply str (repeat 12 "xY9"))))

(deftest redact-test
  (testing "sensitive-named assignments keep their name"
    (is (= "MB_DB_PASS=<REDACTED> MB_DB_TYPE=h2"
           (transcript/redact "MB_DB_PASS=hunter22 MB_DB_TYPE=h2"))))
  (testing "known token formats"
    (is (= "token is <REDACTED-TOKEN>" (transcript/redact (str "token is " fake-github-token)))))
  (testing "credentials in URLs"
    (is (= "postgres://metabase:<REDACTED>@localhost:5432/db"
           (transcript/redact "postgres://metabase:s3cret@localhost:5432/db"))))
  (testing "long mixed-case strings"
    (is (= "value <REDACTED-HIGH-ENTROPY>" (transcript/redact (str "value " fake-mixed-secret)))))
  (testing "EDN secrets, as printed from .lein-env"
    (is (= "{:mb-db-pass \"<REDACTED>\" :mb-encryption-secret-key \"<REDACTED>\" :mb-db-type \"h2\"}"
           (transcript/redact "{:mb-db-pass \"hunter22\" :mb-encryption-secret-key \"k3y\" :mb-db-type \"h2\"}"))))
  (is (= ":db/password \"<REDACTED>\" ::api-token \"<REDACTED>\""
         (transcript/redact ":db/password \"hunter22\" ::api-token \"t0ken\"")))
  (testing "bare hex of secret-like length, but not a 40-character git SHA"
    (let [sha (apply str (repeat 40 "a"))]
      (is (= (str "key <REDACTED-HEX> commit " sha)
             (transcript/redact (str "key " (apply str (repeat 64 "f")) " commit " sha))))))
  (testing "a private key printed in part"
    (is (= "<REDACTED-PRIVATE-KEY>" (transcript/redact (str "-----BEGIN " "PRIVATE KEY-----\nMIIEvQIBADAN"))))
    (is (= "<REDACTED-PRIVATE-KEY>\ndone" (transcript/redact (str "MIIEvQIBADAN\n-----END " "PRIVATE KEY-----\ndone"))))
    (is (= "<REDACTED-KEY-LINE>" (transcript/redact (apply str (repeat 64 "Qz+/"))))))
  (testing "git SHAs, UUIDs and paths stay"
    (let [s "commit d3a5a218a55f0e1c2b3a4d5e6f708192a3b4c5d6 session 31b066ea-d480-4a3f-a6f1-0bc74a18367f"]
      (is (= s (transcript/redact s))))))

(deftest claude-entries-test
  (let [file (write-jsonl
              [{:type "file-history-snapshot"}
               {:type "user" :timestamp "2026-09-01T10:00:00Z" :gitBranch "fix-x" :cwd "/w/metabase" :message {:content "run the tests"}}
               {:type "user" :isMeta true :timestamp "2026-09-01T10:00:01Z" :message {:content "caveat"}}
               "not json"
               {:type      "assistant"
                :timestamp "2026-09-01T10:00:02Z"
                :message   {:content [{:type "text" :text "Running them."}
                                      {:type "tool_use" :name "Bash" :input {:command "./bin/test-agent"}}]}}
               {:type      "user"
                :timestamp "2026-09-01T10:00:03Z"
                :message   {:content [{:type "tool_result" :is_error true :content [{:type "text" :text "boom"}]}]}}])]
    (is (= [{:line 2 :ts "2026-09-01T10:00:00Z" :tag "USER" :text "run the tests" :branch "fix-x" :cwd "/w/metabase"}
            {:line 5 :ts "2026-09-01T10:00:02Z" :tag "ASSISTANT" :text "Running them."}
            {:line 5 :ts "2026-09-01T10:00:02Z" :tag "TOOL Bash" :text "./bin/test-agent"}
            {:line 6 :ts "2026-09-01T10:00:03Z" :tag "RESULT ERROR" :text "boom"}]
           (transcript/claude-entries file)))))

(deftest redact-before-truncate-test
  (testing "a secret where a long tool result gets cut is redacted whole, not left as a fragment"
    (let [pem    (str "-----BEGIN RSA " "PRIVATE KEY-----\n" (apply str (repeat 20 "MIIEpAIBAAKCAQEA7x/9Qz+\n"))
                      "-----END RSA " "PRIVATE KEY-----")
          output (str (apply str (repeat 800 "y")) pem)
          file   (write-jsonl [{:type    "user" :timestamp "2026-09-01T10:00:00Z"
                                :message {:content [{:type "tool_result" :content [{:type "text" :text output}]}]}}])
          text   (:text (first (transcript/claude-entries file)))]
      (is (not (str/includes? text "MIIEpAIBAAKCAQEA")))
      (is (not (str/includes? text "PRIVATE KEY-----"))))))

(deftest claude-session-test
  (is (= {:source :claude :id "31b066ea-d480-4a3f-a6f1-0bc74a18367f" :subagent false :project "-Users-me-metabase"}
         (dissoc (transcript/claude-session "/h/.claude/projects/-Users-me-metabase/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl")
                 :path)))
  (is (= "31b066ea-d480-4a3f-a6f1-0bc74a18367f/agent-a12"
         (:id (transcript/claude-session
               "/h/.claude/projects/p/31b066ea-d480-4a3f-a6f1-0bc74a18367f/subagents/agent-a12.jsonl")))))

(deftest codex-entries-test
  (let [file (write-jsonl
              [{:type "session_meta" :payload {:id "01a0" :cwd "/w/metabase" :originator "codex-tui" :source "cli"}}
               {:type    "response_item" :timestamp "2026-09-02T09:00:00Z"
                :payload {:type "message" :role "user" :content [{:type "input_text" :text "# AGENTS.md instructions ..."}]}}
               {:type    "response_item" :timestamp "2026-09-02T09:00:01Z"
                :payload {:type "message" :role "user" :content [{:type "input_text" :text "fix the flaky test"}]}}
               {:type    "response_item" :timestamp "2026-09-02T09:00:02Z"
                :payload {:type "function_call" :name "exec_command" :arguments (json/write-str {:cmd "rg flaky"})}}
               {:type    "response_item" :timestamp "2026-09-02T09:00:03Z"
                :payload {:type "custom_tool_call_output"
                          :output (json/write-str [{:type "input_text" :text "Output:\nfound"}])}}
               {:type    "event_msg" :timestamp "2026-09-02T09:00:04Z" :payload {:type "token_count"}}])]
    (is (= [{:line 3 :ts "2026-09-02T09:00:01Z" :tag "USER" :text "fix the flaky test"}
            {:line 4 :ts "2026-09-02T09:00:02Z" :tag "TOOL exec_command" :text "rg flaky"}
            {:line 5 :ts "2026-09-02T09:00:03Z" :tag "RESULT" :text "Output:\nfound"}]
           (transcript/codex-entries file)))))

(deftest codex-session-test
  (let [session (fn [payload] (transcript/codex-session (write-jsonl [{:type "session_meta" :payload payload}])))]
    (is (= {:id "a" :cwd "/w" :subagent false :guardian false :non-interactive false}
           (select-keys (session {:id "a" :cwd "/w" :originator "codex-tui" :source "cli" :thread_source "user"})
                        [:id :cwd :subagent :guardian :non-interactive])))
    (is (:guardian (session {:id "b" :source {:subagent {:other "guardian"}} :thread_source "guardian_review"})))
    (is (:subagent (session {:id "c" :source {:subagent {:thread_spawn {:parent_thread_id "a"}}}})))
    (is (:non-interactive (session {:id "d" :originator "codex_exec" :source "exec"})))
    (is (= {:branch "fix-x" :sha "b8f3e87" :repository-url "git@github.com:metabase/metabase.git"}
           (:git (session {:id "e" :git {:branch "fix-x" :commit_hash "b8f3e87"
                                         :repository_url "git@github.com:metabase/metabase.git"}}))))))

(deftest agent-dir-test
  (is (= "/h/.claude" (transcript/agent-dir {} "/h" "claude")))
  (is (= "/h/.codex" (transcript/agent-dir {"CODEX_HOME" ""} "/h" :codex)))
  (is (= "/c" (transcript/agent-dir {"CLAUDE_CONFIG_DIR" "/c"} "/h" "claude")))
  (is (= "/x" (transcript/agent-dir {"CODEX_HOME" "/x"} "/h" "codex"))))
