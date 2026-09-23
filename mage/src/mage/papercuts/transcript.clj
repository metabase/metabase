(ns mage.papercuts.transcript
  "Reads Claude Code and Codex session transcripts into redacted, line-numbered entries.
  An entry is `{:line n :ts \"2026-09-23T10:00:00Z\" :tag \"USER\" :text \"...\"}`, where `:line` is the 1-based
  line of the `.jsonl` record it came from, so a papercut can cite it."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;;; Redaction

(def ^:private sensitive-name
  "[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE|DSN|CONN)[A-Za-z0-9_]*")

(def ^:private redactions
  [[#"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----" "<REDACTED-PRIVATE-KEY>"]
   ;; A key printed only in part, say by `head`, has one marker and not the other.
   [#"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*" "<REDACTED-PRIVATE-KEY>"]
   [#"(?s)\A.*?-----END [A-Z ]*PRIVATE KEY-----" "<REDACTED-PRIVATE-KEY>"]
   ;; Lines of a key body with neither marker in view.
   [#"(?m)^[A-Za-z0-9+/]{60,}={0,2}$" "<REDACTED-KEY-LINE>"]
   [(re-pattern (str "(?i)\\b(" sensitive-name ")(\\s*[=:]\\s*|\"\\s*:\\s*\")([^\\s\"',;]+)")) "$1$2<REDACTED>"]
   ;; EDN, as in `.lein-env`: `:mb-db-pass "..."`.
   [#"(?i)(:[\w.*+!?-]*(?:key|token|secret|password|passwd|pass|pwd|auth|credential|cookie|session|private|dsn|conn)[\w.*+!?-]*)(\s+)\"(?:[^\"\\]|\\.)*\""
    "$1$2\"<REDACTED>\""]
   [#"(?i)(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{12,}" "$1 <REDACTED>"]
   [#"(?i)(x-api-key|x-metabase-session|authorization)(\"?\s*[:=]\s*\"?)[^\s\"']+" "$1$2<REDACTED>"]
   [(re-pattern (str "\\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9]{20,}"
                     "|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}"
                     "|AIza[0-9A-Za-z_-]{30,}|lin_api_[A-Za-z0-9]{20,}|mb_[A-Za-z0-9+/=]{20,})"))
    "<REDACTED-TOKEN>"]
   [#"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}" "<REDACTED-JWT>"]
   [#"([a-z][a-z0-9+.-]*://[^\s:/@]+:)[^\s@/]+@" "$1<REDACTED>@"]
   [#"(?i)(-p|--password)(\s+|=)\S+" "$1$2<REDACTED>"]
   ;; Bare hex of secret-like length: encryption keys, API keys, sha256 digests. 40 characters is a git SHA and stays.
   ;; Last, so a known token format that happens to be hex keeps its own label.
   [#"(?i)(?<![0-9a-f])(?:[0-9a-f]{32,39}|[0-9a-f]{41,})(?![0-9a-f])" "<REDACTED-HEX>"]])

(def ^:private high-entropy #"(?<![A-Za-z0-9/._-])[A-Za-z0-9+_=-]{32,}(?![A-Za-z0-9/._-])")

(defn- redact-high-entropy [token]
  (if (and (not (re-matches #"[0-9a-f]{7,40}|[0-9a-f-]{36}" token)) ; git shas and uuids stay
           (>= (count (filter #(Character/isDigit ^char %) token)) 3)
           (some #(Character/isUpperCase ^char %) token)
           (some #(Character/isLowerCase ^char %) token))
    "<REDACTED-HIGH-ENTROPY>"
    token))

(defn redact
  "Replace likely secrets in `s`: sensitive-named assignments, auth headers, known token formats, credentials in
  URLs, private keys and long mixed-case strings. Git SHAs and UUIDs are kept."
  [s]
  (str/replace (reduce (fn [s [pattern replacement]] (str/replace s pattern replacement)) s redactions)
               high-entropy
               redact-high-entropy))

;;; Rendering helpers

(defn- truncate
  "Redact `s`, then keep the first two thirds and the last third when it is longer than `n`.
  Redacting first matters: a cut through a secret leaves a fragment no pattern recognizes."
  [s n]
  (let [s (redact (if (string? s) s (json/write-str s)))]
    (if (<= (count s) n)
      s
      (str (subs s 0 (quot (* n 2) 3))
           " …[" (- (count s) n) " chars cut]… "
           (subs s (- (count s) (quot n 3)))))))

(defn- read-records
  "Parse each line of a `.jsonl` file, keeping its 1-based line number. Unparseable lines are skipped."
  [path]
  (with-open [rdr (io/reader (str path))]
    (into []
          (keep-indexed (fn [i raw]
                          (when-let [record (try (json/read-str raw) (catch Exception _ nil))]
                            [(inc i) record])))
          (line-seq rdr))))

(defn- entry [line ts tag text]
  (when-not (str/blank? text)
    {:line line :ts ts :tag tag :text text}))

;;; Claude Code

(defn- claude-tool-input [tool input]
  (case tool
    "Bash"  (truncate (:command input "") 500)
    "Edit"  (str (:file_path input) " OLD=" (truncate (:old_string input "") 250)
                 " NEW=" (truncate (:new_string input "") 350))
    "Write" (str (:file_path input) " " (truncate (:content input "") 300))
    "Read"  (str (:file_path input))
    "Agent" (truncate (str (:description input) ": " (:prompt input)) 400)
    (truncate input 300)))

(defn- block-text [content]
  (if (sequential? content)
    (str/join "\n" (keep #(when (map? %) (:text %)) content))
    (str content)))

(defn- claude-record-entries [line {:keys [type message timestamp isMeta]}]
  (let [content (:content message)]
    (when (#{"user" "assistant"} type)
      (if (string? content)
        (cond
          (str/includes? content "<command-name>") [(entry line timestamp "USER-CMD" (truncate content 300))]
          (or isMeta (str/starts-with? content "<local-command") (str/starts-with? content "<command-")) nil
          :else [(entry line timestamp "USER" (truncate content 3000))])
        (for [{block-type :type :as block} content]
          (case block-type
            "text"        (entry line timestamp (if (= type "user") "USER" "ASSISTANT")
                                 (truncate (:text block "") (if (= type "user") 2500 1500)))
            "thinking"    (entry line timestamp "THINKING" (truncate (:thinking block "") 500))
            "tool_use"    (entry line timestamp (str "TOOL " (:name block)) (claude-tool-input (:name block) (:input block)))
            "tool_result" (entry line timestamp (if (:is_error block) "RESULT ERROR" "RESULT")
                                 (truncate (block-text (:content block)) 700))
            nil))))))

(defn claude-entries
  "Entries for a Claude Code transcript.
  Every record names the git branch and working directory it ran in, so entries also carry `:branch` and `:cwd`."
  [path]
  (into []
        (mapcat (fn [[line {:keys [gitBranch cwd] :as record}]]
                  (for [e (claude-record-entries line record) :when e]
                    (cond-> e
                      (not-empty gitBranch) (assoc :branch gitBranch)
                      (not-empty cwd)       (assoc :cwd cwd)))))
        (read-records path)))

(defn claude-session
  "Session metadata for a Claude Code transcript under `~/.claude/projects`. A subagent transcript lives under
  `<session>/subagents/`, so its id includes the parent session."
  [path]
  (let [path     (str path)
        subagent (str/includes? path "/subagents/")
        stem     (str (fs/strip-ext (fs/file-name path)))
        parent   (when subagent (second (re-find #"/([0-9a-f-]{36})/subagents/" path)))]
    {:source   :claude
     :id       (if parent (str parent "/" stem) stem)
     :path     path
     :subagent subagent
     :project  (second (re-find #"/projects/([^/]+)/" path))}))

;;; Codex

(def ^:private codex-injected-prefixes
  "User-role messages that Codex injects rather than the person typing them."
  ["# AGENTS.md instructions" "<environment_context>" "<user_instructions>" "<INSTRUCTIONS>" "<model_switch>"
   "<permissions" "<turn_aborted>"])

(defn- codex-content-text [content]
  (cond
    (string? content)     (if-let [parsed (try (json/read-str content) (catch Exception _ nil))]
                            (if (sequential? parsed) (block-text parsed) content)
                            content)
    (sequential? content) (block-text content)
    :else                 (str content)))

(defn- codex-call-input [{:keys [arguments input]}]
  (let [args (when arguments (try (json/read-str arguments) (catch Exception _ nil)))]
    (truncate (or (:cmd args) (:command args) input arguments "") 500)))

(defn- codex-record-entries [line {:keys [type timestamp payload]}]
  (when (= type "response_item")
    (let [{item-type :type :keys [role content name output summary]} payload]
      (case item-type
        "message"                 (let [text (codex-content-text content)]
                                    (case role
                                      "user"      (when-not (some #(str/starts-with? (str/triml text) %)
                                                                  codex-injected-prefixes)
                                                    [(entry line timestamp "USER" (truncate text 3000))])
                                      "assistant" [(entry line timestamp "ASSISTANT" (truncate text 1500))]
                                      nil))
        ("function_call"
         "custom_tool_call")      [(entry line timestamp (str "TOOL " name) (codex-call-input payload))]
        ("function_call_output"
         "custom_tool_call_output") [(entry line timestamp "RESULT" (truncate (codex-content-text output) 700))]
        "reasoning"               [(entry line timestamp "THINKING" (truncate (block-text summary) 500))]
        nil))))

(defn codex-entries
  "Entries for a Codex rollout transcript."
  [path]
  (into [] (comp (mapcat (fn [[line record]] (codex-record-entries line record))) (remove nil?))
        (read-records path)))

(defn codex-session
  "Session metadata from a Codex rollout's first `session_meta` record."
  [path]
  (let [meta (with-open [rdr (io/reader (str path))]
               (some (fn [raw]
                       (let [record (try (json/read-str raw) (catch Exception _ nil))]
                         (when (= "session_meta" (:type record)) (:payload record))))
                     (take 5 (line-seq rdr))))
        source (:source meta)]
    {:source        :codex
     :id            (or (:id meta) (str (fs/strip-ext (fs/file-name path))))
     :path          (str path)
     :cwd           (:cwd meta)
     :project       (:cwd meta)
     :subagent      (map? source)
     :guardian      (= "guardian_review" (:thread_source meta))
     :non-interactive (= "codex_exec" (:originator meta))
     ;; The commit is where the session started, not where any later message was sent.
     :git           {:branch         (get-in meta [:git :branch])
                     :sha            (get-in meta [:git :commit_hash])
                     :repository-url (get-in meta [:git :repository_url])}}))

;;; Rendering

(defn render
  "One entry as a transcript line: `L12 [USER] text`."
  [{:keys [line tag text]}]
  (str "L" line " [" tag "] " text))
