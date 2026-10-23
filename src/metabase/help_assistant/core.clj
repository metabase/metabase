(ns metabase.help-assistant.core
  "Prototype: an AI assistant on the Admin > Help page.

  It reuses the AI connection Metabot is configured with (Admin > AI), but has its own skills and its own tools:

  - Skills are markdown files with YAML frontmatter in `resources/help_assistant/skills/`. They are re-read on every
    request, so you can edit them while Metabase is running.
  - The Metabase docs (markdown only, no images) are bundled in `resources/help_assistant/docs/`. The model can search
    and read them with the `search_docs` and `read_doc` tools. When that folder is missing (e.g. you haven't copied the
    docs yet) and you're running from source, the repo's own `docs/` folder is used instead."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.core :as metabot.self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
  (:import
   (java.nio.file FileVisitOption Files LinkOption Path)))

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
      (log/infof "Help assistant: loaded %d doc pages" (count docs))
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

(defn- make-tools
  "The tools the model can call. `sources` is an atom collecting the pages it read, to show under the answer."
  [sources]
  {"search_docs"
   {:tool-name "search_docs"
    :doc       (str "Search the Metabase documentation for this Metabase version. Returns page paths, titles and a "
                    "matching line. Use a few specific keywords, e.g. \"ldap group sync\" or \"dashboard slow cache\". "
                    "Then call read_doc on the most relevant page.")
    :schema    [:=> [:cat [:map {:closed true}
                           [:query [:string {:description "A few keywords to search for"}]]]]
                :any]
    :fn        (fn [{:keys [query]}]
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
                     {:output (str "URL to cite: " url "\n\n" (u/truncate content 40000))})
                   {:output (str "No page at \"" path "\". Use a path returned by search_docs.")}))}})

;;; ---------------------------------------------------- Prompt ---------------------------------------------------

(defn- skill->prompt [{:keys [id title description references body]}]
  (str "<skill id=\"" (name id) "\" title=\"" title "\">\n"
       (when description (str "When to use: " description "\n\n"))
       body
       (when (seq references)
         (str "\n\nReference pages (read these with read_doc):\n"
              (str/join "\n" (map #(str "- " %) references))))
       "\n</skill>"))

(defn- system-prompt [diagnostic-info]
  (str
   "You are the Metabase Help assistant. You live on the Admin > Help page of a Metabase instance, and you help "
   "Metabase admins troubleshoot problems and answer how-to questions about Metabase.\n\n"
   "How to work:\n"
   "- If a skill below matches the question, follow it. Skills may use internal labels for their steps (like T1, A3 "
   "or EXIT-B2). Never show these to the user.\n"
   "- Check the documentation with search_docs and read_doc before you explain how something works, name a cause "
   "or give a fix. The docs match this instance's version. Don't read docs just to ask the user a question, such as "
   "a skill's triage question.\n"
   "- When a skill lists reference pages, read the one you need with read_doc directly instead of searching first. "
   "Search only for what the skill's pages don't cover.\n"
   "- When you need more than one page, request all of them in the same step instead of one after another.\n"
   "- Base answers on the docs and the diagnostic info. If you can't find the answer, say so plainly and suggest "
   "emailing Metabase support at [help@metabase.com](mailto:help@metabase.com). Never guess setting names, menu "
   "paths or environment variables.\n"
   "- Link to the pages you used where you mention them, with the exact URL read_doc gave you. Never make up URLs. "
   "Don't end with a list of links: the Help page already lists the pages you read under your answer.\n"
   "- For how-to questions, keep it short and practical: the answer first, then numbered steps.\n"
   "- For troubleshooting, work through it with the user one cause at a time instead of giving every fix at once:\n"
   "  1. If the symptom is too vague to tell which causes apply, ask one short question to narrow it down first.\n"
   "  2. List the likely causes, most likely first, one short line each, with no fixes yet. Use the skill's order "
   "when it gives one.\n"
   "  3. Ask whether they want to start with the most likely one.\n"
   "  4. For the cause you're on, ask the user to check whether it's the problem, and wait for their answer. Give "
   "the fix only after they confirm it. If it isn't the problem, move to the next cause.\n"
   "  5. Treat what the user tells you as a clue, not a diagnosis. Even when one cause looks very likely, confirm it "
   "with a check before giving the fix. Don't assume they set something up wrong. Skip causes only when the user "
   "has already ruled them out.\n"
   "  6. Don't ask whether the problem started after a Metabase upgrade until the end. Ask it only once you've "
   "worked through the likely causes without finding the root cause. Either way, suggest emailing Metabase support "
   "at [help@metabase.com](mailto:help@metabase.com); if it started after an upgrade, say it may be a bug.\n"
   "  7. When you suggest emailing support, offer to draft the email. If they say yes, write a short email they can "
   "copy: a one-line summary of the problem, their Metabase version (from this prompt), when it started and "
   "whether that was after an upgrade, their setup (dashboard or question, query builder or SQL, embedded or not), "
   "and what they've already checked and ruled out in this conversation. Don't include passwords, keys or other "
   "secrets.\n"
   "- Questions that usually narrow a problem down fastest, for any topic: the exact error message; who's affected "
   "(everyone, one user or group, or does it work for admins?); whether it happens in Metabase itself or only in "
   "an embed; and whether it works somewhere else, like another environment or data source. Ask only the ones that "
   "matter and haven't been answered, one at a time. If the skill gives an order, follow it; otherwise start with "
   "the error message.\n"
   "- If the user says it's urgent, critical or an emergency, or something big is broken (for example every "
   "question is failing), don't go one cause at a time. Give a short list of the most common causes, one line "
   "each, and ask whether they want to work through them or have you draft an email to Metabase support at "
   "[help@metabase.com](mailto:help@metabase.com) right away.\n"
   "- When the docs say something works as designed, say so plainly, give the workaround if there is one, and "
   "stop diagnosing.\n"
   "- You can't open links the user pastes, such as a dashboard URL. Say so, and ask for what you need instead.\n"
   "- When you ask the user to collect something, like logs or a setting's value, give the steps from the docs "
   "for getting it, not just its name.\n"
   "- Never ask the user to judge logs, errors or settings themselves (\"do you see anything unusual?\"). Ask them to "
   "copy the relevant lines or values and paste them into the chat, and read them yourself. For logs, they can "
   "filter by a keyword and copy the lines from when they reproduced the problem. Remind them to remove passwords, "
   "keys or customer data before pasting.\n"
   "- Match your confidence to the evidence. Until a check confirms a cause, say \"the most likely cause is\" or "
   "\"it could be\", never \"this is almost certainly your issue\". Before saying something isn't possible or "
   "can't work, check the docs for exceptions; if you've only read one page on the topic, search for others.\n"
   "- Use setting and option names exactly as the docs write them. If you're not sure of a name, point to the doc "
   "page instead of guessing or offering alternatives.\n"
   "- Never ask for passwords, API keys or other secrets. If the user pastes one, tell them to rotate it.\n"
   "- Write plainly, like a helpful colleague. No openers like \"Great question!\", no emoji. Use headers or "
   "tables only when the content truly needs them, such as comparing options.\n"
   "- Mention something from the diagnostic info only when it relates to what the user asked.\n"
   "- When someone asks what you can do or what you can help with, answer in 2-3 sentences of plain prose, with no "
   "tables, headers or lists. Say you can help troubleshoot problems and walk through setting things up, name 3-5 "
   "common examples (not every skill), say you can help with more and can give the full list if they want it, and "
   "end by asking what they're running into. If they then ask for the full list, give short bullets grouped into "
   "troubleshooting and how-to, one line each.\n"
   "- You can't see or change this instance's settings, logs or data. You only know the diagnostic info below "
   "and what the user tells you.\n\n"
   "This instance is running Metabase " (:tag config/mb-version-info) ".\n\n"
   "Diagnostic info from this instance:\n<diagnostic_info>\n"
   (if (str/blank? diagnostic-info) "(not provided)" (u/truncate diagnostic-info 8000))
   "\n</diagnostic_info>\n\n"
   "# Skills\n\n"
   (str/join "\n\n" (map skill->prompt (load-skills)))))

;;; --------------------------------------------------- Feedback --------------------------------------------------

(defn log-feedback!
  "Write a rating of one answer to the server log. The prototype has nowhere to store ratings, and the log is enough
  to find the questions the docs don't answer well."
  [{:keys [positive comment question answer sources]}]
  (log/infof "Help assistant feedback: %s\nQuestion: %s\nComment: %s\nSources: %s\nAnswer: %s"
             (if positive "helpful" "not helpful")
             question
             (if (str/blank? comment) "(none)" comment)
             (if (seq sources) (str/join ", " (map :url sources)) "(none)")
             (u/truncate answer 2000)))

;;; ------------------------------------------------- Agent loop --------------------------------------------------

(def ^:private max-iterations 8)

(def ^:private tracking-opts
  {:required-permission :permission/metabot-other-tools
   :profile-id          :help-assistant
   :source              "help_assistant"
   :tag                 "help-assistant"})

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

(defn- messages->parts
  "Conversation from the browser -> the part format `call-llm` expects. Keeps the last 20 messages."
  [messages]
  (vec (for [{:keys [role content]} (take-last 20 messages)]
         (if (= role "user")
           {:role :user, :content content}
           {:type :text, :id (str "mb-" (random-uuid)), :text content}))))

(defn- unavailable-message [reason]
  (case reason
    :metabot-disabled  "AI features are turned off on this instance. Turn on Metabot under Admin > AI to use the assistant."
    :no-llm            "No AI provider is connected yet. Connect one under Admin > AI, then try again."
    :usage-limit       "This instance has reached its AI usage limit."
    :permission-denied "Your account doesn't have permission to use AI features."
    (str "The assistant isn't available right now (" (name reason) ").")))

(defn chat
  "Run one turn of the conversation. Returns `{:reply \"markdown\", :sources [{:title :url}]}`."
  [{:keys [messages diagnostic-info]}]
  (if-let [reason (metabot.self/llm-call-unavailable-reason :permission/metabot-other-tools)]
    {:reply (unavailable-message reason), :sources []}
    (let [sources (atom {})
          tools   (make-tools sources)
          model   (metabot.settings/llm-metabot-provider)
          system  (system-prompt diagnostic-info)]
      (log/infof "Help assistant: calling %s with %d messages" model (count messages))
      (loop [history   (messages->parts messages)
             iteration 1
             texts     []]
        (let [parts       (-> (into [] (metabot.self/call-llm model system history tools tracking-opts))
                              merge-streamed-text
                              metabot.self.core/merge-reasoning-parts)
              error       (some #(when (= :error (:type %)) %) parts)
              text        (->> parts
                               (keep #(when (= :text (:type %)) (not-empty (str/trim (:text %)))))
                               (str/join "\n\n"))
              tool-calls? (some #(= :tool-input (:type %)) parts)]
          (cond
            error
            (throw (ex-info (str "The AI provider returned an error: "
                                 (or (get-in error [:error :message]) "unknown error"))
                            {:status-code 502}))

            (and tool-calls? (< iteration max-iterations))
            (recur (into history (filter #(history-part-types (:type %))) parts)
                   (inc iteration)
                   (conj texts text))

            :else
            {:reply   (if (str/blank? text)
                        (or (last (remove str/blank? texts))
                            "Sorry, I couldn't come up with an answer. Try rephrasing the question.")
                        text)
             :sources (vec (vals @sources))}))))))
