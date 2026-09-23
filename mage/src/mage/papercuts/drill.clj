(ns mage.papercuts.drill
  "Turns a flagged transcript chunk into papercut records by asking a coding agent (the `claude` or `codex` CLI).
  The agent sees only the redacted chunk text and gets no tools. Its sessions are not saved, so a later scan never
  reads the drill-down itself."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def kinds
  "How a papercut misleads an agent."
  ["codebase-trap" "test-harness" "misleading-signal" "doc-gap" "tool-quirk" "env-friction" "agent-behaviour"])

(def owners
  "Where a papercut's fix would go."
  ["repo-code" "repo-tooling" "personal-tooling" "third-party" "harness" "agent-practice"])

(def outcomes
  "What a papercut cost when it was hit."
  ["shipped-bug" "introduced-bug" "near-miss" "false-conclusion" "wasted-time" "data-loss"])

(defn- string-enum [values] {:type "string" :enum values})

(def schema
  "JSON Schema for the agent's answer. Every property is required and none are extra, as Codex's strict structured
  output demands; empty strings stand for \"none\"."
  (let [object (fn [properties]
                 {:type "object" :additionalProperties false
                  :properties properties :required (mapv name (keys properties))})]
    (object
     {:papercuts
      {:type  "array"
       :items (object
               {:slug                 {:type "string"}
                :title                {:type "string"}
                :label                (string-enum ["positive" "negative" "ambiguous"])
                :scope                (string-enum ["core" "adjacent"])
                :kind                 (string-enum kinds)
                :owner                (string-enum owners)
                :area                 {:type "array" :items {:type "string"}}
                :outcome              {:type "array" :items (string-enum outcomes)}
                :severity             (string-enum ["high" "medium" "low"])
                :affordance           {:type "string"}
                :trap                 {:type "string"}
                :mechanism            {:type "string"}
                :fix                  {:type "string"}
                :detection            {:type "string"}
                :existing_papercut    {:type "integer"}
                :anchors              {:type  "array"
                                       :items (object {:line   {:type "integer"}
                                                       :role   (string-enum ["user" "agent" "tool-output"
                                                                             "source-check" "reproduction"])
                                                       :proves {:type "string"}})}})}})))

(defn- existing-lines [existing]
  (if (seq existing)
    (str/join "\n" (for [{:keys [id title]} existing] (str "- #" id " " title)))
    "(none)"))

(defn prompt
  "Instructions plus the chunk. `first-new-line` is the first transcript line that has not been scanned before."
  [{:keys [session earlier text first-new-line existing]}]
  (str
   "You are reviewing part of a coding agent's session transcript for *papercuts*: bugs, code smells, tooling
quirks, doc gaps or environment traps that trip up coding agents. They make agents introduce subtle bugs, reach
false conclusions, or waste time using something wrongly and coming back to fix it.

Session: " (name (:source session)) " " (:id session) "
Transcript file: " (:path session) "

Rules:
- A papercut needs an environmental cause that would plausibly trip the next agent too: a misleading name or API, a
  silent tool behaviour, a stale doc, a test-harness quirk, an invisible convention. Put that cause in `affordance`
  and use scope `core`.
- A recurring agent habit with no environmental cause (amending pushed commits, `git add -A` sweeping other edits)
  is kind `agent-behaviour`, scope `adjacent`.
- A one-off reasoning slip, a style or tone correction, or a bug the agent's own test caught at once is NOT a
  papercut. Report it only if it looks like one at first glance, with label `negative`, so it can train a
  classifier. Use `ambiguous` when the evidence here can't decide.
- Report only papercuts with at least one anchor at line " first-new-line " or later. Lines before that were
  reviewed in an earlier scan and appear only as context.
- Anchors: 1-5 decisive lines, using the numbers after `L`, each with what it proves. Don't invent line numbers.
- If one of the known papercuts below is the same mechanism, put its number in `existing_papercut` and reuse its
  wording in `title`. Otherwise use 0. Either way give a kebab-case `slug`.
- `title` is one claim of at most 90 characters. `trap` is two sentences: what misleads, and what that causes.
  `mechanism` is the cause, separate from the symptom. `fix` and `detection` are short proposals.
- Never copy secrets, tokens or env values into any field.
- Return an empty `papercuts` list when there is nothing to report. Most stretches have none.

Known papercuts:
" (existing-lines existing) "

=== EARLIER (context only) ===
" (or (not-empty earlier) "(start of session)") "

=== TRANSCRIPT (review this) ===
" text "\n"))

(def ^:private timeout-ms
  "A drill-down usually takes a minute or two. Past this the CLI is taken to be hung, and the session is retried on
  the next run."
  (* 15 60 1000))

(defn- run-cli
  "Run `args` like `p/shell` with `:continue`, but kill the process tree and throw once it runs past `timeout-ms`."
  [opts & args]
  (let [proc   (apply p/process (assoc opts :shutdown p/destroy-tree) args)
        result (deref proc timeout-ms ::timeout)]
    (when (= ::timeout result)
      (p/destroy-tree proc)
      (throw (ex-info (str (first args) " timed out after " (quot timeout-ms 60000) " minutes") {})))
    result))

(defn- run-claude [{:keys [model]} prompt-text]
  (let [{:keys [exit out err]}
        (run-cli {:in prompt-text :out :string :err :string :dir (str (fs/temp-dir))}
                 "claude" "-p" "--output-format" "json" "--no-session-persistence" "--tools" ""
                 "--json-schema" (json/write-str schema)
                 "--model" (or model "sonnet"))]
    (when-not (zero? exit)
      (throw (ex-info (str "claude exited " exit) {:err (str/trim (str err out))})))
    (let [{:keys [structured_output result is_error]} (json/read-str out)]
      (when is_error (throw (ex-info "claude reported an error" {:result result})))
      (or structured_output (json/read-str result)))))

(defn- run-codex [{:keys [model]} prompt-text]
  (let [dir         (fs/create-temp-dir {:prefix "papercut-drill"})
        schema-file (str (fs/path dir "schema.json"))
        answer-file (str (fs/path dir "answer.json"))]
    (try
      (spit schema-file (json/write-str schema))
      ;; The prompt goes in on stdin and stdin is then closed; with stdin left open, `codex exec` waits for more.
      (let [{:keys [exit out err]}
            (apply run-cli {:in prompt-text :out :string :err :string :dir (str dir)}
                   (concat ["codex" "exec" "--ephemeral" "--sandbox" "read-only" "--skip-git-repo-check"
                            "--color" "never" "--output-schema" schema-file "-o" answer-file]
                           (when model ["-m" model])
                           ["-"]))]
        (when-not (zero? exit)
          (throw (ex-info (str "codex exited " exit) {:err (str/trim (str err out))})))
        (json/read-str (slurp answer-file)))
      (finally
        (fs/delete-tree dir)))))

(defn drill!
  "Ask `agent` (`:claude` or `:codex`) for the papercuts in a chunk. Returns a vector of papercut maps."
  [{:keys [agent] :as opts} chunk]
  (let [answer ((case agent :codex run-codex run-claude) opts (prompt chunk))]
    (vec (:papercuts answer))))
