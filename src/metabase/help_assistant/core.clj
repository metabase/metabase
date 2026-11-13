(ns metabase.help-assistant.core
  "Prototype: an AI assistant on the Admin > Help page.

  It reuses the AI connection Metabot is configured with (Admin > AI), but has its own skills and its own tools:

  - Skills are markdown files with YAML frontmatter in `resources/help_assistant/skills/`. They are re-read on every
    request, so you can edit them while Metabase is running. Like Metabot's skills, only a list of them goes in the
    prompt, and the model loads the one it needs with the `load_skill` tool.
  - The Metabase docs (markdown only, no images) are bundled in `resources/help_assistant/docs/` by the `:help-docs`
    build step. The model can search and read them with the `search_docs` and `read_doc` tools. When that folder is
    missing and you're running from source, the repo's own `docs/` folder is used instead.
  - The general instructions are in `resources/help_assistant/instructions.md`, also re-read on every request.
  - When the admin allows it, the model can also check this instance with read-only tools: recent server logs,
    database sync status, email and sign-in settings, and dashboard subscriptions and alerts. See
    [[metabase.help-assistant.instance]].
  - Each answer comes with the steps behind it (skills loaded, searches, pages read, checks), so you can see how it was
    made.
  - When `MB_HELP_ASSISTANT_FLAGS_DIR` is set, admins can flag an answer for review, which saves the chat as a file in
    that folder, to turn into an eval case. This is for tuning skills on a local instance."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.help-assistant.instance :as instance]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.core :as metabot.self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
  (:import
   (java.nio.file FileVisitOption Files LinkOption Path)
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(def ^:private skills-dir "help_assistant/skills")
(def ^:private docs-dir "help_assistant/docs")

;;; ------------------------------------------------ Reading files ------------------------------------------------

(defn- read-md-tree
  "Returns `{relative-path contents}` for every `.md` file under `root`, recursively."
  [^Path root]
  (with-open [stream (Files/walk root (make-array FileVisitOption 0))]
    (into {}
          (comp (filter (fn [^Path p] (Files/isRegularFile p (make-array LinkOption 0))))
                (filter (fn [^Path p] (str/ends-with? (str (.getFileName p)) ".md")))
                (map (fn [^Path p]
                       [(str/replace (str (.relativize root p)) "\\" "/")
                        (-> (String. (Files/readAllBytes p) "UTF-8")
                            (str/replace "\r\n" "\n"))])))
          (iterator-seq (.iterator stream)))))

(defn- read-resource-md-tree
  "Like [[read-md-tree]] for a directory under `resources/`. Works both from source and from inside the uberjar.
  Returns nil when the directory doesn't exist."
  [dir]
  (when (io/resource dir)
    (u.files/with-open-path-to-resource [root dir]
      (read-md-tree root))))

(defn- read-repo-docs
  "Fallback for local development: the repo's own `docs/` folder."
  []
  (let [dir (io/file "docs")]
    (when (.isDirectory dir)
      (log/info "Help assistant: bundled docs not found, using the repo's docs/ folder")
      (read-md-tree (.toPath dir)))))

;;; ---------------------------------------------------- Skills ---------------------------------------------------

(defn- split-frontmatter [s]
  (when-let [[_ fm body] (re-matches #"(?s)\A---\n(.*?)\n---\n?(.*)\z" s)]
    [fm body]))

(defn- load-skills
  "All skills, sorted by file name. Each is a map with `:id`, `:title`, `:description`, `:references` and `:body`."
  []
  (->> (read-resource-md-tree skills-dir)
       (sort-by key)
       (keep (fn [[path text]]
               (if-let [[fm body] (split-frontmatter text)]
                 (assoc (yaml/parse-string fm) :body (str/trim body))
                 (log/warnf "Help assistant: skipping skill %s, it has no YAML frontmatter" path))))))

(defn- skill-id [skill]
  (some-> (:id skill) name))

(defn- find-skill [skills id]
  (let [id (str/trim (str id))]
    (some #(when (= id (skill-id %)) %) skills)))

;;; ----------------------------------------------------- Docs ----------------------------------------------------

(defn- doc-title [path content]
  (or (some-> (re-find #"(?m)^title:\s*[\"']?(.+?)[\"']?\s*$" content) second)
      (some-> (re-find #"(?m)^#\s+(.+)$" content) second)
      path))

(def ^:private docs
  "path -> {:path :title :content :lower}. Loaded once, on first use."
  (delay
    (let [files (or (read-resource-md-tree docs-dir) (read-repo-docs) {})
          docs  (into {}
                      (for [[path content] files
                            ;; the developers guide is about contributing to Metabase, not using it
                            :when (not (str/starts-with? path "developers-guide/"))]
                        [path {:path    path
                               :title   (doc-title path content)
                               :content content
                               :lower   (u/lower-case-en content)}]))]
      (if (empty? docs)
        (log/warn "Help assistant: no doc pages found, so answers can't use the docs. Build with the :help-docs step.")
        (log/infof "Help assistant: loaded %d doc pages" (count docs)))
      docs)))

(defn- docs-version-tag
  "Same rule the frontend uses (`getDocsUrlForVersion`): `v0.64.3` -> `v0.64`, anything else -> `latest`."
  []
  (let [tag (:tag config/mb-version-info)]
    (if-let [[_ minor suffix] (some->> tag (re-find #"v[01]\.(\d+)(?:\.\d+)?(-.*)?"))]
      (if (= "-snapshot" (some-> suffix u/lower-case-en))
        "latest"
        (str "v0." minor))
      "latest")))

(defn doc-url
  "Public metabase.com URL for a doc page path like `troubleshooting-guide/timezones.md`."
  [path]
  (str "https://www.metabase.com/docs/" (docs-version-tag) "/" (str/replace path #"\.md$" ".html")))

(def ^:private stop-words
  #{"the" "and" "for" "how" "what" "why" "can" "does" "with" "this" "that" "are" "not" "you" "metabase" "from"
    "when" "where" "which" "into" "your" "our" "set" "get" "use" "using"})

(defn- query-terms [query]
  (->> (str/split (u/lower-case-en (or query "")) #"[^a-z0-9_]+")
       (remove #(< (count %) 3))
       (remove stop-words)
       distinct))

(defn- count-occurrences [^String haystack ^String needle]
  (loop [from 0, n 0]
    (let [i (.indexOf haystack needle (int from))]
      (if (or (neg? i) (>= n 50))
        n
        (recur (+ i (count needle)) (inc n))))))

(defn- score [{:keys [lower title path]} terms]
  (let [title (u/lower-case-en title)
        hits  (for [t terms
                    :let [n (count-occurrences lower t)]
                    :when (pos? n)]
                (+ (min n 20)
                   (if (str/includes? title t) 15 0)
                   (if (str/includes? path t) 5 0)))]
    (when (seq hits)
      ;; pages matching more of the words rank higher
      (+ (reduce + hits) (* 20 (count hits))))))

(defn- snippet [{:keys [content]} terms]
  (let [line (->> (str/split-lines content)
                  (remove #(re-find #"^(title:|redirect_from:|\s+- /|---)" %))
                  (filter (fn [line] (let [l (u/lower-case-en line)] (some #(str/includes? l %) terms))))
                  first)]
    (some-> line str/trim (u/truncate 200))))

(defn search-docs
  "Top matching doc pages for `query`."
  [query]
  (let [terms (query-terms query)]
    (when (seq terms)
      (->> (vals @docs)
           (keep (fn [doc] (when-let [s (score doc terms)] (assoc doc :score s))))
           (sort-by :score >)
           (take 8)
           (map (fn [doc] {:path (:path doc), :title (:title doc), :snippet (snippet doc terms)}))))))

(defn- find-doc
  "Look up a page, forgiving a leading `docs/` or a missing `.md`."
  [path]
  (let [path (-> (str path) str/trim (str/replace #"^/?docs/" "") (str/replace #"^/" ""))]
    (or (get @docs path)
        (get @docs (str path ".md")))))

;;; ----------------------------------------------------- Tools ---------------------------------------------------

(defn- record-step!
  "Add `step` to the `steps` atom, unless the same step is already there. When it's new, calls `on-step` with it."
  [steps on-step step]
  (let [same?          (fn [s] (= (dissoc s :earlier) (dissoc step :earlier)))
        [before after] (swap-vals! steps (fn [existing] (if (some same? existing) existing (conj existing step))))]
    (when (not= before after)
      (on-step step))))

(declare skill->prompt)

(defn- instance-tools
  "Read-only tools for checking this instance. Only offered when the admin allows it. What they return can contain
  customer details, so it's never logged."
  [steps on-step]
  (let [check! (fn [check label] (record-step! steps on-step {:type "check", :check check, :label (str label)}))]
    {"check_recent_logs"
     {:tool-name "check_recent_logs"
      :doc       (str "Read this Metabase server's most recent log entries (kept in memory since it started), newest "
                      "first. Filter by a keyword, like a database name, \"ssl\", \"ldap\" or an error message, and by "
                      "minimum level. Secrets are removed. Use this before asking the admin to collect logs.")
      :schema    [:=> [:cat [:map {:closed true}
                             [:keyword {:optional true}
                              [:maybe [:string {:description "Only entries containing this text, any case"}]]]
                             [:level {:optional true}
                              [:maybe [:enum {:description "Minimum level, e.g. warn for warnings and errors"}
                                       "error" "warn" "info" "debug"]]]
                             [:limit {:optional true}
                              [:maybe [:int {:description (str "Most entries to return, up to " instance/max-log-lines)}]]]]]
                  :any]
      :fn        (fn [{:keys [keyword] :as args}]
                   (check! "logs" (or (some-> keyword str/trim) ""))
                   {:output (instance/recent-logs args)})}

     "check_databases"
     {:tool-name "check_databases"
      :doc       (str "Check the databases connected to Metabase: engine, initial sync status, when sync last finished, "
                      "and sync steps that failed in the last 7 days with their errors. Leave out database to check them "
                      "all. Never returns connection details.")
      :schema    [:=> [:cat [:map {:closed true}
                             [:database {:optional true} [:maybe [:string {:description "A database name or id"}]]]]]
                  :any]
      :fn        (fn [{:keys [database]}]
                   (let [{:keys [label output]} (instance/database-status-report database)]
                     (check! "databases" label)
                     {:output output}))}

     "check_subscriptions_and_alerts"
     {:tool-name "check_subscriptions_and_alerts"
      :doc       (str "Check dashboard subscriptions and question alerts: names, the dashboard or question, schedules, "
                      "channels, recipient counts with email addresses masked to the first letter and domain, and "
                      "group names. Also returns sends that failed in the last 7 days and the latest warnings and errors "
                      "from sending. Pass a name or id to check one subscription, alert, dashboard or question, or "
                      "leave it out to list them all.")
      :schema    [:=> [:cat [:map {:closed true}
                             [:query {:optional true}
                              [:maybe [:string {:description "A subscription, dashboard or question name or id"}]]]]]
                  :any]
      :fn        (fn [{:keys [query]}]
                   (let [{:keys [label output]} (instance/subscriptions-and-alerts-report query)]
                     (check! "subscriptions" label)
                     {:output output}))}

     "check_email_and_sign_in"
     {:tool-name "check_email_and_sign_in"
      :doc       (str "Check whether email (SMTP) is set up, and which sign-in methods are turned on and configured: "
                      "password, Google, LDAP, SAML, JWT. Returns only yes/no and names, never setting values.")
      :schema    [:=> [:cat [:map {:closed true}]] :any]
      :fn        (fn [_]
                   (check! "email_sso" "")
                   {:output (instance/email-and-sign-in-status)})}}))

(defn- make-tools
  "The tools the model can call. `sources` is an atom collecting the pages it read, to show under the answer, and
  `steps` an atom collecting what it did, to show how it got the answer. `on-step` is called with each new step.
  The tools that check this instance are included only when `instance-access?` is true."
  [{:keys [sources steps on-step skills instance-access?]}]
  (merge
   (when instance-access?
     (instance-tools steps on-step))
   {"load_skill"
    {:tool-name "load_skill"
     :doc       (str "Load the full instructions of one skill from the skill list. Pass the skill's id exactly as listed. "
                     "Load a skill before you answer a question it matches, then follow it.")
     :schema    [:=> [:cat [:map {:closed true}
                            [:id [:string {:description "A skill id from the skill list, e.g. troubleshoot-filters"}]]]]
                 :any]
     :fn        (fn [{:keys [id]}]
                  (if-let [skill (find-skill skills id)]
                    (do (record-step! steps on-step {:type "skill", :label (str (:title skill)), :skill_id (skill-id skill)})
                        {:output (skill->prompt skill)})
                    {:output (str "No skill with id \"" id "\". Use an id from the skill list.")}))}

    "search_docs"
    {:tool-name "search_docs"
     :doc       (str "Search the Metabase documentation for this Metabase version. Returns page paths, titles and a "
                     "matching line. Use a few specific keywords, e.g. \"ldap group sync\" or \"dashboard slow cache\". "
                     "Then call read_doc on the most relevant page.")
     :schema    [:=> [:cat [:map {:closed true}
                            [:query [:string {:description "A few keywords to search for"}]]]]
                 :any]
     :fn        (fn [{:keys [query]}]
                  (record-step! steps on-step {:type "search", :label (str query)})
                  (let [results (search-docs query)]
                    {:output (if (empty? results)
                               (if (empty? @docs)
                                 "The documentation isn't available on this instance."
                                 (str "No pages matched \"" query "\". Try different or fewer keywords."))
                               (str/join "\n"
                                         (for [{:keys [path title snippet]} results]
                                           (str "- path: " path "\n  title: " title
                                                (when snippet (str "\n  match: " snippet))))))}))}

    "read_doc"
    {:tool-name "read_doc"
     :doc       "Read one documentation page. Pass a path exactly as returned by search_docs."
     :schema    [:=> [:cat [:map {:closed true}
                            [:path [:string {:description "e.g. troubleshooting-guide/timezones.md"}]]]]
                 :any]
     :fn        (fn [{:keys [path]}]
                  (if-let [{:keys [path title content]} (find-doc path)]
                    (let [url (doc-url path)]
                      (swap! sources assoc path {:title title, :url url})
                      (record-step! steps on-step {:type "read", :label title, :url url})
                      {:output (str "URL to cite: " url "\n\n" (u/truncate content 40000))})
                    {:output (str "No page at \"" path "\". Use a path returned by search_docs.")}))}}))

;;; ---------------------------------------------------- Prompt ---------------------------------------------------

(def ^:private skill-preamble
  "Goes at the top of every skill the model reads. A skill's own order (\"Start at T1\") is more specific and more recent
  than the general instructions, so without this reminder the model follows the skill and skips the user's choice."
  (str "How to use this skill when troubleshooting: the general troubleshooting steps come first. If you can check this "
       "instance, do this skill's \"Check first\" steps before asking anything. Then, unless the user has already said "
       "how they'd like to work, or you can already name just one or two likely causes, ask this skill's first question "
       "and add one short line offering to list the common causes instead. If they asked for the list, use this skill only to choose and order the "
       "causes; each time a cause is ruled out, show the ones that are left and let them pick, instead of moving to the "
       "next one yourself. Otherwise, follow this skill's order."))

(defn- skill->prompt [{:keys [id title description references body]}]
  (str "<skill id=\"" (name id) "\" title=\"" title "\">\n"
       (when description (str "When to use: " description "\n\n"))
       skill-preamble "\n\n"
       body
       (when (seq references)
         (str "\n\nReference pages (read these with read_doc):\n"
              (str/join "\n" (map #(str "- " %) references))))
       "\n</skill>"))

(defn- skill->catalog-line [{:keys [title description] :as skill}]
  (str "- " (skill-id skill) ": " title (when description (str ". When to use: " description))))

(def ^:private instructions-file "help_assistant/instructions.md")

(defn- instructions
  "The general instructions, from `resources/help_assistant/instructions.md`. Read on every request, like the skills, so
  edits take effect without a restart. HTML comments at the top of the file are notes for people, not the model."
  []
  (if-let [resource (io/resource instructions-file)]
    (-> (slurp resource)
        (str/replace "\r\n" "\n")
        (str/replace #"\A\s*(?s:<!--.*?-->\s*)+" "")
        str/trim)
    (throw (ex-info "The Help assistant's instructions file is missing." {:status-code 500
                                                                          :file        instructions-file}))))

(defn- system-prompt
  "`skills` are listed by id, title and when to use them. `loaded-skills`, the ones loaded earlier in this
  conversation, are included in full, so the model doesn't have to load them again on every turn. `instance-access?`
  says whether the tools that check this instance are available; `instructions.md` says what to do either way."
  [{:keys [diagnostic-info skills loaded-skills instance-access?]}]
  (str
   (instructions)
   "\n\n"
   "This instance is running Metabase " (:tag config/mb-version-info) ".\n\n"
   "Checking this instance: " (if instance-access? "on" "off") ".\n\n"
   "Diagnostic info from this instance:\n<diagnostic_info>\n"
   (if (str/blank? diagnostic-info) "(not provided)" (u/truncate diagnostic-info 8000))
   "\n</diagnostic_info>\n\n"
   "# Skill list\n\n"
   (str/join "\n" (map skill->catalog-line skills))
   (when (seq loaded-skills)
     (str "\n\n# Skills loaded earlier in this conversation\n\n"
          (str/join "\n\n" (map skill->prompt loaded-skills))))))

;;; --------------------------------------------------- Feedback --------------------------------------------------

(defn log-feedback!
  "Write a rating of one answer to the server log. The rating and sources are logged at INFO. The question, comment and
  answer are logged at DEBUG, because they can contain pasted logs or customer data."
  [{:keys [positive comment question answer sources]}]
  ;; The prototype has nowhere to store ratings, and the log is enough to find the questions the docs don't answer well.
  (log/infof "Help assistant feedback: %s. Sources: %s"
             (if positive "helpful" "not helpful")
             (if (seq sources) (str/join ", " (map :url sources)) "(none)"))
  (log/debugf "Help assistant feedback content:\nQuestion: %s\nComment: %s\nAnswer: %s"
              (u/truncate question 2000)
              (if (str/blank? comment) "(none)" (u/truncate comment 2000))
              (u/truncate answer 2000)))

;;; ---------------------------------------------------- Flags ----------------------------------------------------

(defn flags-dir
  "The folder flagged chats are saved to, from the `MB_HELP_ASSISTANT_FLAGS_DIR` environment variable. Flagging is off
  when it isn't set. It's meant for tuning skills on a local instance, not for production."
  []
  (config/config-str :mb-help-assistant-flags-dir))

(defn- yaml-block
  "`s` as a YAML literal block, so any text (quotes, colons, pasted logs) stays as it is. `indent` goes before each line."
  [indent s]
  (let [s (str/trim (str/replace (str s) "\r\n" "\n"))]
    (if (str/blank? s)
      "\"\""
      (str "|-\n" (str/join "\n" (for [line (str/split-lines s)]
                                   (if (str/blank? line) "" (str indent line))))))))

(defn- flag->yaml
  "A flagged chat in nearly the same shape as an eval case, so it's easy to turn into one."
  [{:keys [note messages]} flagged-at]
  (str "# A chat flagged for review on the Admin > Help page. The flagged answer is the last assistant message.\n"
       "# To turn flags into eval cases, ask Claude Code to follow help-assistant-notes\\evals\\PROCESS-FLAGS.md.\n"
       "flagged_at: \"" flagged-at "\"\n"
       "metabase_version: \"" (:tag config/mb-version-info) "\"\n"
       "note: " (yaml-block "  " note) "\n"
       "conversation:\n"
       (str/join (for [{:keys [role content steps]} messages]
                   (str "  - " (if (= role "user") "user" "assistant") ": " (yaml-block "      " content) "\n"
                        ;; JSON is valid YAML, and keeps each step on one line
                        (when (seq steps) (str "    steps: " (json/encode steps) "\n")))))))

(defn- flag-file-name [^LocalDateTime now messages]
  (let [question (some #(when (= "user" (:role %)) (:content %)) messages)
        slug     (-> (u/lower-case-en (str question))
                     (str/replace #"[^a-z0-9]+" "-")
                     (u/truncate 40)
                     (str/replace #"^-+|-+$" ""))]
    (str (.format now (DateTimeFormatter/ofPattern "yyyy-MM-dd_HHmmss")) "_" (if (str/blank? slug) "chat" slug) ".yaml")))

(defn save-flag!
  "Save a flagged chat, `{:note \"what should have happened\", :messages [...]}` ending with the flagged answer, as a
  YAML file in [[flags-dir]]. Returns the file name. Throws a 404 when flagging isn't set up."
  [{:keys [messages] :as flag}]
  (let [dir  (or (flags-dir)
                 (throw (ex-info "Flagging isn't set up. Set MB_HELP_ASSISTANT_FLAGS_DIR and restart Metabase."
                                 {:status-code 404})))
        now  (.withNano (LocalDateTime/now) 0)
        file (io/file dir (flag-file-name now messages))]
    (.mkdirs (io/file dir))
    (spit file (flag->yaml flag (str now)) :encoding "UTF-8")
    (log/infof "Help assistant: saved a flagged chat to %s" file)
    (.getName file)))

;;; ------------------------------------------------- Agent loop --------------------------------------------------

(def ^:private max-iterations 8)

;; On EE, AI usage is logged to `ai_usage_log`, which only accepts the sources and profile ids listed in
;; `metabase-enterprise.metabot.usage` and throws on any other. Adding the help assistant there needs a new version of
;; the AI usage views and a migration, so for now the prototype logs its usage with the source "unknown" and no
;; profile id.
(def ^:private tracking-opts
  {:required-permission :permission/metabot-other-tools
   :source              "unknown"
   :tag                 "help-assistant"})

(defn- collect-until-canceled
  "The parts of `reducible` in a vector, stopping as soon as `canceled?` returns true."
  [canceled? reducible]
  ;; Not `(into [] (take-while ...))`: when the stream stops early, a stateful transducer inside `call-llm` can hand
  ;; the `reduced` marker back to the reducing fn on completion, and `into`'s transient vector can't take it. A plain
  ;; vector that leaves an already-reduced value alone, unwrapped at the end, handles that.
  (loop [result (reduce (fn [acc part]
                          (cond
                            (reduced? acc) acc
                            (canceled?)    (reduced acc)
                            :else          (conj acc part)))
                        []
                        reducible)]
    (if (reduced? result) (recur @result) result)))

(defn- merge-streamed-text
  "The model's text arrives as many small parts with the same id; join them back into one part per id."
  [parts]
  (into []
        (comp (partition-by (fn [p] (if (= :text (:type p)) [:text (:id p)] (Object.))))
              (mapcat (fn [group]
                        (if (= :text (:type (first group)))
                          [{:type :text, :id (:id (first group)), :text (apply str (map :text group))}]
                          group))))
        parts))

(def ^:private history-part-types #{:text :tool-input :tool-output :reasoning})

;; Odd: a conversation ends with a question, so an even number of recent messages starts with an answer, and the turns
;; still alternate after the first question.
(def ^:private max-history-messages 19)

(defn- trim-history
  "The first question and the most recent messages, at most [[max-history-messages]] in all. The first question stays
  so that a long troubleshooting chat doesn't lose the original problem. Answers before the first question are dropped."
  [messages]
  (let [messages (drop-while #(not= "user" (:role %)) messages)]
    (if (<= (count messages) max-history-messages)
      messages
      (cons (first messages) (take-last (dec max-history-messages) messages)))))

(defn- messages->parts
  "Conversation from the browser -> the part format `call-llm` expects. Long conversations are trimmed with
  [[trim-history]]."
  [messages]
  (vec (for [{:keys [role content]} (trim-history messages)]
         (if (= role "user")
           {:role :user, :content content}
           {:type :text, :id (str "mb-" (random-uuid)), :text content}))))

(defn- unavailable-error [reason]
  (ex-info (case reason
             :metabot-disabled  "AI features are turned off on this instance. Turn on Metabot under Admin > AI to use the assistant."
             :no-llm            "No AI provider is connected yet. Connect one under Admin > AI, then try again."
             :usage-limit       "This instance has reached its AI usage limit."
             :permission-denied "Your account doesn't have permission to use AI features."
             (str "The assistant isn't available right now (" (name reason) ")."))
           {:status-code (if (= reason :permission-denied) 403 503)}))

(def ^:private last-step-instruction
  "\n\nThis is your last step. Answer now with what you found so far. Do not call any tools.")

(def ^:private no-answer-reply
  (str "I couldn't finish looking this up. Try a narrower question, or email Metabase support at "
       "[help@metabase.com](mailto:help@metabase.com)."))

(defn- cited-sources
  "The pages `reply` links to. When it links none, every page that was read."
  [reply sources]
  (let [cited (filter #(str/includes? reply (:url %)) sources)]
    (vec (if (seq cited) cited sources))))

(defn- log-steps!
  "One line per answer at INFO: how many steps it took, which skills and pages it used, and which kinds of checks it
  ran. What it searched for and checked is logged at DEBUG, because it can repeat what the user typed or name customer
  databases."
  [iterations steps]
  (let [of-type (fn [t k] (let [xs (distinct (keep #(when (= t (:type %)) (k %)) steps))]
                            (if (seq xs) (str/join ", " xs) "(none)")))]
    (log/infof "Help assistant: answered in %d of %d steps. Skills: %s. Pages read: %s. Checks: %s"
               iterations max-iterations (of-type "skill" :skill_id) (of-type "read" :url) (of-type "check" :check))
    (log/debugf "Help assistant: searched the docs for: %s. Checked: %s"
                (of-type "search" :label) (of-type "check" :label))))

(defn chat
  "Run one turn of the conversation. Returns `{:reply \"markdown\", :sources [{:title :url}], :steps [...]}`, where
  `:steps` says how the answer was made: skills loaded (`skill`), searches (`search`), pages read (`read`), checks of
  this instance (`check`), and `limit` when it ran out of steps. `loaded-skills` are the ids of skills loaded earlier in
  the conversation. The tools that check this instance are offered only when `instance-access?` is true. Throws a 403
  or 503 when the AI connection can't be used, and a 502 when the AI provider returns an error.

  Optional, for showing progress while it works:
  - `on-step` is called with each step as it happens, starting with the skills loaded earlier.
  - `canceled?` is a no-arg fn. Once it returns true, the model isn't called again, the call in progress is cut off, and
    `chat` returns nil."
  [{:keys [messages diagnostic-info loaded-skills instance-access? on-step canceled?]
    :or   {on-step (constantly nil), canceled? (constantly false)}}]
  (when-let [reason (metabot.self/llm-call-unavailable-reason :permission/metabot-other-tools)]
    (throw (unavailable-error reason)))
  (let [skills  (load-skills)
        earlier (vec (keep #(find-skill skills %) (distinct loaded-skills)))
        sources (atom {})
        steps   (atom [])
        tools   (make-tools {:sources          sources
                             :steps            steps
                             :on-step          on-step
                             :skills           skills
                             :instance-access? instance-access?})
        model   (metabot.settings/llm-metabot-provider)
        system  (system-prompt {:diagnostic-info  diagnostic-info
                                :skills           skills
                                :loaded-skills    earlier
                                :instance-access? instance-access?})
        finish  (fn [iteration result]
                  (when (= iteration max-iterations)
                    (record-step! steps on-step {:type "limit", :label (str max-iterations)}))
                  (log-steps! iteration @steps)
                  (assoc result :steps @steps))]
    (doseq [skill earlier]
      (record-step! steps on-step {:type     "skill"
                                   :label    (str (:title skill))
                                   :skill_id (skill-id skill)
                                   :earlier  true}))
    (log/infof "Help assistant: calling %s with %d messages" model (count messages))
    (loop [history   (messages->parts messages)
           iteration 1]
      (let [last-step?  (= iteration max-iterations)
            ;; Tools run while the parts are reduced, so stopping the reduction also stops any further tool calls.
            parts       (when-not (canceled?)
                          (-> (collect-until-canceled
                               canceled?
                               (metabot.self/call-llm model
                                                      (cond-> system last-step? (str last-step-instruction))
                                                      history
                                                      tools
                                                      tracking-opts))
                              merge-streamed-text
                              metabot.self.core/merge-reasoning-parts))
            error       (some #(when (= :error (:type %)) %) parts)
            text        (->> parts
                             (keep #(when (= :text (:type %)) (not-empty (str/trim (:text %)))))
                             (str/join "\n\n"))
            tool-calls? (some #(= :tool-input (:type %)) parts)]
        (cond
          (canceled?)
          (log/infof "Help assistant: stopped at step %d, the request was canceled" iteration)

          error
          (throw (ex-info (str "The AI provider returned an error: "
                               (or (get-in error [:error :message]) "unknown error"))
                          {:status-code 502}))

          (and tool-calls? (not last-step?))
          (recur (into history (filter #(history-part-types (:type %))) parts)
                 (inc iteration))

          ;; text next to a tool call is a preamble like "Let me check the docs", not an answer
          (or tool-calls? (str/blank? text))
          (finish iteration {:reply no-answer-reply, :sources []})

          :else
          (finish iteration {:reply   text
                             :sources (cited-sources text (vals @sources))}))))))
