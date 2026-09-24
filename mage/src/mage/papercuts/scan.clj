(ns mage.papercuts.scan
  "Scans Claude Code or Codex transcripts for papercuts and submits them to a papercuts server.

  Each run reads only the part of each session added since the previous run. Progress is kept per session, as the
  last transcript line and timestamp scanned, in a gitignored state file under `local/papercuts/`. A session that
  gets more back-and-forth later is scanned again from where the last run stopped, with the stretch just before it
  passed along as context.

  Duplicates are prevented three ways: the state file skips lines already scanned, the state file also records
  which papercut slugs each session has already reported, and every report carries a stable `report_id`
  (`<source>:<session>:<line>`) that the server treats as a replay.

  Pipeline per session: render and redact new entries → split into chunks → screen each chunk with Jev → drill
  flagged chunks with the `claude` or `codex` CLI → submit each positive papercut as one report."
  (:require
   [babashka.fs :as fs]
   [babashka.http-client :as http]
   [babashka.json :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.color :as c]
   [mage.papercuts.drill :as drill]
   [mage.papercuts.git :as papercut-git]
   [mage.papercuts.hooks :as hooks]
   [mage.papercuts.jev :as jev]
   [mage.papercuts.transcript :as transcript]
   [mage.util :as u])
  (:import
   (java.nio.channels FileChannel)
   (java.nio.file OpenOption StandardOpenOption)
   (java.time Duration Instant)
   (java.util.concurrent Executors TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private chunk-chars
  "Chunk size. Jev takes at most 32k tokens of state; 60k characters of transcript stays well under that."
  60000)

(def ^:private min-screen-chars
  "A stretch shorter than this is too little for Jev to judge alone. With `--hold-short-tail` it waits for more."
  500)

(def ^:private context-chars
  "How much of the preceding stretch each chunk carries as context."
  6000)

(def ^:private embargo-pattern
  "Sessions that mention embargoed security work are skipped whole and never sent to Jev or a drill-down agent."
  ;; The private repository is a configured remote, so `git remote -v` and repo listings name it in ordinary sessions.
  ;; Only signs of work in it count: its PRs, `gh --repo`, branches ahead of it, and files in its checkout.
  #"(?i)embargo|GHSA-|CVE-\d|metabase-private/pull/|--repo[= ]metabase/metabase-private|\[metabase-private/[^\]\s]+: ahead|/metabase-private/(?:src|test|enterprise|resources)/")

(def ^:private category-by-kind
  {"codebase-trap"     "code-smell"
   "doc-gap"           "documentation"
   "misleading-signal" "agent-trap"
   "agent-behaviour"   "agent-trap"})

;;; Sources

(def ^:private sources
  (let [env (into {} (System/getenv))
        dir #(transcript/agent-dir env (fs/home) %)]
    {:claude {:roots   [(fs/path (dir "claude") "projects")]
              :entries transcript/claude-entries
              :session transcript/claude-session}
     :codex  {:roots   [(fs/path (dir "codex") "sessions") (fs/path (dir "codex") "archived_sessions")]
              :entries transcript/codex-entries
              :session transcript/codex-session}}))

;;; Time

(defn parse-since
  "Parse `--since`: an ISO date (`2026-09-01`), an ISO timestamp, or a relative age such as `7d` or `12h`.
  Returns an ISO-8601 UTC string, which sorts the same way as transcript timestamps."
  ([s] (parse-since s (Instant/now)))
  ([s ^Instant now]
   (when s
     (if-let [[_ n unit] (re-matches #"(\d+)([dhm])" s)]
       (str (.minus now (case unit
                          "d" (Duration/ofDays (parse-long n))
                          "h" (Duration/ofHours (parse-long n))
                          "m" (Duration/ofMinutes (parse-long n)))))
       (cond
         (re-matches #"\d{4}-\d{2}-\d{2}" s)  (str s "T00:00:00Z")
         (re-matches #"\d{4}-\d{2}-\d{2}T.*" s) (str (Instant/parse (if (re-find #"[zZ]|[+-]\d{2}:\d{2}$" s) s (str s "Z"))))
         :else (throw (ex-info (str "--since must be a date, a timestamp, or an age like 7d: " s) {})))))))

(defn- modified-at [path]
  (str (.toInstant (fs/last-modified-time path))))

;;; State

(defn- server-origin
  "`[scheme host effective-port]` of `server`, so `https://host` and `https://host:443` are one server."
  [server]
  (let [uri    (java.net.URI. server)
        scheme (str/lower-case (or (.getScheme uri) "http"))]
    [scheme (.getHost uri) (if (pos? (.getPort uri)) (.getPort uri) (if (= "https" scheme) 443 80))]))

(defn- server-key
  "`server` as part of a file name, such as `http-10.193.193.227-8765`. Every key starts with its scheme, so no host
  name can make two servers share one."
  [server]
  (str/join "-" (server-origin server)))

(defn- state-file-path [source key]
  (str (fs/path u/project-root-directory "local" "papercuts" (str "scan-state." (name source) (some->> key (str ".")) ".edn"))))

(defn default-state-file
  "Progress file for `source` and `server` in the gitignored `local/` directory of this checkout."
  [source server]
  ;; One file per server: a session scanned for one server must still be scanned for another.
  (state-file-path source (server-key server)))

(defn earlier-state-files
  "Where progress for `server` was kept before, newest first: keys without the `http-` prefix or an implied port, and
  the single file from before there was one per server."
  [source server]
  (let [[scheme host port] (server-origin server)
        explicit-port      (let [p (.getPort (java.net.URI. server))] (when (pos? p) p))]
    (distinct [(state-file-path source (str (when (= "https" scheme) "https-") host "-" port))
               (state-file-path source (str host (some->> explicit-port (str "-"))))
               (state-file-path source nil)])))

(defn- log-file [state-file]
  ;; Only the file name is rewritten, so the log sits beside its state file. A state file named some other way gets
  ;; its log beside it too, rather than the log overwriting it.
  (let [file-name (str (fs/file-name state-file))
        log-name  (if-let [[_ key] (re-matches #"scan-state\.(.+)\.edn" file-name)]
                    (str "scan-log." key ".jsonl")
                    (str file-name ".log.jsonl"))]
    (str (if-let [parent (fs/parent state-file)] (fs/path parent log-name) log-name))))

(defn load-state
  "Saved progress: `{:sessions {session-id {:line :until :modified :path :reported [...]}}}`."
  [file]
  (if (fs/exists? file)
    (edn/read-string (slurp file))
    {:version 1 :sessions {}}))

(defn- keyed-state-files
  "State files kept per server beside `shared`, the single file from before there was one per server."
  [shared]
  (let [base (str/replace (str (fs/file-name shared)) #"\.edn$" "")]
    (fs/glob (or (fs/parent shared) ".") (str base ".*.edn"))))

(defn starting-state
  "Saved progress to start from. A default state file that doesn't exist yet takes over the first of `earlier` that
  does, instead of rescanning everything. Taking over moves the file. The last of `earlier`, the single file from
  before there was one per server, is never taken over once any server has its own file, and a persistent scan then
  retires it, so no server can start from progress that isn't its own."
  [{:keys [explicit? persist?]} state-file earlier]
  (let [shared      (last earlier)
        ;; A server may have its own file from before shared files were retired, so both can exist.
        superseded? #(and shared (seq (keyed-state-files shared)))
        previous    (when-not (or explicit? (fs/exists? state-file))
                      (first (filter fs/exists? (cond-> earlier (superseded?) butlast))))]
    (cond
      (nil? previous) nil
      ;; A dry run changes nothing, so it reads the earlier file where it is.
      (not persist?)  nil
      :else           (do (fs/create-dirs (fs/parent state-file))
                          ;; A first scan for another server may take the same file first; it keeps it, and this one
                          ;; starts from whatever is at its own path.
                          (try
                            (fs/move previous state-file {:atomic-move true})
                            (catch java.nio.file.NoSuchFileException _))))
    (when (and persist? (not explicit?) shared (fs/exists? shared) (superseded?))
      (try
        (fs/move shared (str shared ".retired") {:atomic-move true :replace-existing true})
        (catch java.nio.file.NoSuchFileException _)))
    (load-state (if (and previous (not persist?)) previous state-file))))

(defn- save-state! [file state]
  (fs/create-dirs (fs/parent file))
  (let [tmp (str file ".tmp")]
    (spit tmp (with-out-str (pprint/pprint state)))
    (fs/move tmp file {:replace-existing true :atomic-move true})))

;;; Discovery

(defn- candidate-sessions
  "Sessions under the source's roots that may have unscanned content, most recently modified first."
  [source {:keys [since min-idle project subagents include-exec exclude] session-prefix :session} state]
  (let [{:keys [roots] session-fn :session :as src} (sources source)
        idle-cutoff (str (.minus (Instant/now) (Duration/ofMinutes (or min-idle 0))))
        exclude-re  (some-> exclude re-pattern)]
    (->> roots
         (filter fs/exists?)
         (mapcat #(fs/glob % "**.jsonl"))
         (map (fn [path] {:path path :modified (modified-at path)}))
         (filter #(neg? (compare (:modified %) idle-cutoff)))
         (filter #(or (nil? since) (not (neg? (compare (:modified %) since)))))
         (remove #(and exclude-re (re-find exclude-re (str (:path %)))))
         (sort-by :modified #(compare %2 %1))
         (keep (fn [{:keys [path modified]}]
                 (let [s (assoc (session-fn path) :modified modified)
                       scanned-modified (get-in state [:sessions (:id s) :modified])]
                   (when (and (or (nil? scanned-modified) (pos? (compare modified scanned-modified)))
                              (or (nil? project) (str/includes? (str (:project s) " " (:path s)) project))
                              (or (nil? session-prefix) (str/starts-with? (:id s) session-prefix))
                              (or subagents (not (:subagent s)))
                              (not (:guardian s))
                              (or include-exec (not (:non-interactive s))))
                     (assoc s :entries-fn (:entries src)))))))))

;;; Chunking

(defn split-new
  "Split `entries` into those already scanned (at or before `last-line`) and new ones. With `since`, entries
  timestamped before it also count as already scanned."
  [entries last-line since]
  (let [new? (fn [{:keys [line ts]}]
               (and (> line (or last-line 0))
                    (or (nil? since) (nil? ts) (not (neg? (compare ts since))))))]
    [(vec (remove new? entries)) (vec (filter new? entries))]))

(defn- tail-chars
  "Rendered lines from the end of `entries`, up to about `n` characters."
  [entries n]
  (loop [acc () size 0 [e & more] (rseq (vec entries))]
    (if (or (nil? e) (> size n))
      (str/join "\n" acc)
      (let [line (transcript/redact (transcript/render e))]
        (recur (cons line acc) (+ size (count line) 1) more)))))

(defn chunks
  "Group new entries into chunks of about `chunk-chars` rendered characters. Each chunk carries the stretch before it
  as `:earlier` context, and the line range and timestamps of its own entries."
  ([earlier new-entries] (chunks earlier new-entries chunk-chars))
  ([earlier new-entries size]
   (loop [acc [] prior earlier remaining new-entries]
     (if (empty? remaining)
       acc
       (let [taken (loop [taken [] n 0 [e & more :as es] remaining]
                     (if (or (empty? es) (and (seq taken) (> (+ n (count (:text e))) size)))
                       taken
                       (recur (conj taken e) (+ n (count (:text e)) 20) more)))]
         (recur (conj acc {:earlier        (tail-chars prior context-chars)
                           :text           (transcript/redact (str/join "\n" (map transcript/render taken)))
                           :entries        taken
                           :first-new-line (:line (first taken))
                           :last-line      (:line (peek taken))})
                (into (vec prior) taken)
                (drop (count taken) remaining)))))))

;;; Server

(defn- server-request [{:keys [server token]} method route body]
  (http/request (cond-> {:method  method
                         :uri     (str server route)
                         :headers (cond-> {"Content-Type" "application/json"}
                                    token (assoc "Authorization" (str "Bearer " token)))
                         :throw   false
                         :timeout 10000}
                  body (assoc :body (json/write-str body)))))

(defn repository-name
  "A repository's short name from its remote URL: `metabase` for `git@github.com:metabase/metabase.git`."
  [url]
  (some->> url (re-find #"([^/:]+?)(?:\.git)?/*$") second not-empty))

(defn- session-repository
  "The repository to file a session's papercuts under: `--repository` when given, otherwise the name of the git remote
  the session ran in, or of its working directory."
  [{:keys [repository]} session entries]
  (or repository
      ;; The directories the session worked in, most used first. The first entry's may be a scratch directory that
      ;; isn't a checkout, whose folder name says nothing about the repository.
      (let [dirs (distinct (concat (->> entries (keep :cwd) frequencies (sort-by val >) (map key))
                                   (some-> (:cwd session) vector)))]
        ;; Each directory's own remote first: the URL recorded at session start names only where it began.
        (or (some #(repository-name (:repository_url (papercut-git/context {:cwd %}))) dirs)
            ;; Cleaned like a checkout's remote: a recorded URL can carry credentials in its user info or query.
            (repository-name (some-> (get-in session [:git :repository-url]) papercut-git/public-url))
            (some-> (first dirs) fs/file-name str not-empty)
            "unknown"))))

(defn known-papercuts
  "Open papercuts in `repository`, as `{:id :title}`, so a drill-down can file a hit under an existing one."
  [{:keys [repository] :as opts}]
  (loop [offset 0 acc []]
    (let [{:keys [status body]} (server-request opts :get (str "/api/papercuts?limit=500&offset=" offset
                                                               "&repository=" repository)
                                                nil)]
      (when-not (= 200 status)
        (throw (ex-info (str "papercuts server returned HTTP " status " for /api/papercuts") {:body body})))
      (let [{:keys [papercuts next_offset]} (json/read-str body)
            acc (into acc (map #(select-keys % [:id :title])) papercuts)]
        (if next_offset (recur next_offset acc) acc)))))

(defn- known-for
  "Known papercuts in `repository`, fetched once per run. A dry run can go ahead without a server; it just can't match
  findings to known papercuts."
  [{:keys [known-cache dry-run screen-only] :as opts} repository]
  (let [opts (assoc opts :repository repository)
        fetch (delay (if (or dry-run screen-only)
                       (try (known-papercuts opts) (catch Exception _ []))
                       (known-papercuts opts)))]
    @(get (swap! known-cache #(cond-> % (not (contains? % repository)) (assoc repository fetch))) repository)))

(defn- papercut-fingerprint
  "The first fingerprint of papercut `id`, so a new report joins it."
  [opts id]
  (let [{:keys [status body]} (server-request opts :get (str "/api/papercuts/" id) nil)]
    (when (= 200 status)
      (first (:fingerprints (json/read-str body))))))

(defn- submit!
  "POST one report. Returns `:submitted`, `:replay` (the server already had this report_id), or `:conflict` (it has
  the report_id under a different fingerprint, from an earlier run that grouped it differently)."
  [opts report]
  (let [{:keys [status body]} (server-request opts :post "/api/reports" report)]
    (case (long status)
      201 :submitted
      200 :replay
      409 :conflict
      (throw (ex-info (str "papercuts server returned HTTP " status) {:body body})))))

;;; Reports

(defn report
  "The server report for one positive papercut found in `session`, filed under `fingerprint`. `git` holds the branch
  and commit it was hit on, as far as they could be worked out."
  [{:keys [reporter repository machine]} session papercut fingerprint git entries scores]
  (let [ts-by-line  (into {} (map (juxt :line :ts)) entries)
        lines       (sort (map :line (:anchors papercut)))
        line        (first lines)
        source-name (name (:source session))
        ref         (str (:path session) "#L" line)]
    (cond-> {:repository  repository
             :reporter    reporter
             :report_id   (str source-name ":" (:id session) ":" line)
             :fingerprint fingerprint
             :category    (category-by-kind (:kind papercut) "tooling")
             :title       (:title papercut)
             :description (str/join "\n\n" (remove str/blank? [(:trap papercut)
                                                               (:mechanism papercut)
                                                               (some->> (not-empty (:fix papercut)) (str "Suggested fix: "))
                                                               (str "Transcript: " ref)]))
             :path        (or (first (:area papercut)) "")
             :area        (str/join ", " (:area papercut))
             :agent       source-name
             :session     (:id session)
             :observed_at (ts-by-line line)
             :source_type "transcript-scan"
             :source_ref  ref
             :details     {:transcript (:path session)
                           :lines      [line (last lines)]
                           :anchors    (:anchors papercut)
                           :slug       (:slug papercut)
                           :label      (:label papercut)
                           :scope      (:scope papercut)
                           :kind       (:kind papercut)
                           :owner      (:owner papercut)
                           :outcome    (:outcome papercut)
                           :severity   (:severity papercut)
                           :affordance (:affordance papercut)
                           :detection  (:detection papercut)
                           :screen     scores}}
      machine (assoc :machine machine)
      git     (merge git))))

(defn- anchor-entry
  "The entry at a papercut's first anchor, or the last one before it when the agent cited a line with no entry."
  [entries papercut]
  (let [line (apply min (map :line (:anchors papercut)))]
    (last (filter #(<= (:line %) line) entries))))

(defn- git-for
  "Branch and commit for a papercut, looked up at its first anchor."
  [session entries papercut]
  (let [e (anchor-entry entries papercut)]
    (papercut-git/context {:cwd         (or (:cwd e) (:cwd session))
                           :branch      (:branch e)
                           :ts          (:ts e)
                           :session-git (:git session)})))

(defn reportable
  "Positive papercuts from a drill-down that have an anchor in the new stretch and whose slug this session has not
  reported before. Only anchors in the new stretch are kept: the report is dated, identified and looked up in git
  at its first anchor, and earlier lines were already scanned. Later ones were misnumbered."
  [papercuts {:keys [first-new-line last-line]} already-reported]
  (let [seen (into #{} (map :slug) already-reported)]
    (for [papercut papercuts
          :let [anchors (filter #(<= first-new-line (:line %) last-line) (:anchors papercut))]
          :when (and (= "positive" (:label papercut))
                     (seq anchors)
                     (not (seen (:slug papercut))))]
      (assoc papercut :anchors (vec anchors)))))

(defn- fingerprint-for
  "File under the matched known papercut when the drill-down named one, otherwise under the papercut's own slug."
  [{:keys [known] :as opts} papercut]
  (or (when-let [id (some #{(:existing_papercut papercut)} (map :id known))]
        (papercut-fingerprint opts id))
      (str "papercut:" (:slug papercut))))

;;; Scanning one session

(def ^:private print-lock (Object.))

(defn- say [session & parts]
  (locking print-lock
    (println (c/cyan (str (name (:source session)) " " (:id session))) (str/join " " parts))))

(defn- log! [file record]
  (locking print-lock
    (fs/create-dirs (fs/parent file))
    (spit file (str (json/write-str record) "\n") :append true)))

(defn screen-or-refused
  "Jev's screening of `chunk`, or `{:refused true}` when TypeSafe's firewall refused it. The firewall answers some
  text, such as certain shell snippets, with an HTML 403 every time, so a retry would be refused again and the session
  would fail on every run."
  [api-key chunk]
  (try
    (jev/screen! api-key chunk)
    (catch clojure.lang.ExceptionInfo e
      ;; The firewall's refusal is an HTML page. A 403 from the API itself, such as a bad key, is JSON and a failure.
      (if (and (= 403 (:status (ex-data e))) (str/starts-with? (str/triml (str (:body (ex-data e)))) "<"))
        {:refused true}
        (throw e)))))

(defn- scan-chunk!
  "Screen one chunk, drill it if flagged, and submit what it finds. Returns the session state advanced past it."
  [{:keys [threshold dry-run screen-only verbose api-key known log] :as opts} session state chunk]
  (let [{:keys [scores model refused]} (screen-or-refused api-key chunk)
        flagged   (and (not refused) (jev/flagged? scores threshold))
        found     (when (and flagged (not screen-only))
                    (drill/drill! opts (assoc chunk :session session :existing known)))
        reported  (into #{} (map :fingerprint) (:reported state))
        reports   (->> (reportable found chunk (:reported state))
                       (map #(report opts session % (fingerprint-for opts %) (git-for session (:entries chunk) %)
                                     (:entries chunk) scores))
                       ;; One report per papercut per session, even when two findings resolve to the same one.
                       (remove #(reported (:fingerprint %)))
                       (reduce (fn [acc r] (cond-> acc (not-any? #(= (:fingerprint %) (:fingerprint r)) acc) (conj r)))
                               []))
        results   (if dry-run
                    (mapv (constantly :dry-run) reports)
                    (mapv #(submit! opts %) reports))]
    (when refused
      (say session (str "L" (:first-new-line chunk) "-" (:last-line chunk))
           (c/yellow "skipped: Jev's firewall refused this stretch (HTTP 403)")))
    (when (and (not refused) (or flagged verbose))
      (say session (str "L" (:first-new-line chunk) "-" (:last-line chunk))
           (if flagged (c/yellow "flagged") "clean")
           (str/join " " (for [[k v] (sort-by val > scores)] (format "%s=%.2f" (name k) (double v))))))
    (doseq [[r result] (map vector reports results)]
      (say session (c/green (name result)) (:fingerprint r) "-" (:title r)))
    (doseq [p found :when (not= "positive" (:label p))]
      (say session (c/magenta (:label p)) (:slug p) "-" (:title p)))
    (when-not dry-run
      (log! log {:server    (:server opts)
                 :session   (:id session)
                 :path      (:path session)
                 :lines     [(:first-new-line chunk) (:last-line chunk)]
                 :jev_model model
                 :refused   (boolean refused)
                 :scores    scores
                 :flagged   flagged
                 :papercuts found
                 :submitted (mapv (fn [r result] {:report_id (:report_id r) :fingerprint (:fingerprint r) :result result})
                                  reports results)}))
    (-> state
        (assoc :line (:last-line chunk)
               :until (:ts (peek (:entries chunk))))
        (update :reported into (for [r reports]
                                 {:slug        (get-in r [:details :slug])
                                  :fingerprint (:fingerprint r)
                                  :line        (first (get-in r [:details :lines]))
                                  :report_id   (:report_id r)})))))

(defn- security-dir?
  "Whether a directory or project name is a checkout for security work: a worktree named after a SEC issue
  (`metabase.sec-1172-...`), or the private repository itself."
  [s]
  (boolean (re-find #"(?i)(?:^|[-/.])sec-\d|(?:^|[-/.])metabase-private(?:$|[-/.])" (str s))))

(defn security-worktree?
  "Whether the session ran in a checkout for security work, at its start or in any of `entries`. Such a session can
  be under embargo without ever saying so, and later commands may use relative paths."
  ([session] (security-worktree? session []))
  ([{:keys [project cwd path]} entries]
   (boolean (some security-dir? (concat [project cwd path] (map :cwd entries))))))

(defn mentions-embargo?
  "Whether the raw transcript at `path` mentions embargoed work. Rendered entries are truncated and redacted, which can
  cut or mask a marker, so the file itself is read."
  [path]
  ;; Context the harness injects into every session is left out: the memory index names embargoed work, so counting
  ;; it would skip every session.
  (with-open [reader (io/reader (str path))]
    (boolean
     (some (fn [raw]
             (and (re-find embargo-pattern raw)
                  (not (transcript/injected-record? (try (json/read-str raw) (catch Exception _ nil))))
                  (re-find embargo-pattern (transcript/strip-system-reminders raw))))
           (line-seq reader)))))

(defn- scan-session!
  "Scan the new stretch of one session. Returns the session's next state. When a chunk fails, the state stops
  before that chunk and carries the exception under `::error`, so finished chunks are not redone."
  [{:keys [since] :as opts} session prior]
  (let [entries         ((:entries-fn session) (:path session))
        [earlier fresh] (split-new entries (:line prior) since)
        state           (-> (merge {:line 0} prior {:path (:path session) :modified (:modified session)})
                            (update :reported vec))]
    (cond
      (empty? fresh)
      state

      (or (security-worktree? session entries) (mentions-embargo? (:path session)))
      (do (say session (c/yellow "skipped: mentions embargoed work"))
          (assoc state :line (:line (peek fresh)) :until (:ts (peek fresh)) :skipped "embargo"))

      :else
      (let [repository (session-repository opts session entries)
            opts       (assoc opts :repository repository :known (known-for opts repository))]
        (reduce (fn [state chunk]
                  (if (and (:hold-short-tail opts) (< (count (:text chunk)) min-screen-chars))
                    ;; Leave the stretch for the next run, and keep the session's old modified time so that run
                    ;; picks it up even if the transcript doesn't change again, as at SessionEnd.
                    (reduced (assoc state :modified (:modified prior)))
                    (try
                      (scan-chunk! opts session state chunk)
                      (catch Exception e
                        (reduced (assoc state ::error e))))))
                state
                (chunks earlier fresh))))))

;;; Entry point

(defn- api-key! []
  (or (bot-env/resolve-env "TYPESAFE_API_KEY")
      (do (println (c/red "TYPESAFE_API_KEY not found in mise.local.toml, .env, .lein-env, or the environment."))
          (u/exit 1))))

(defn- with-state-lock
  "Call `f` holding an exclusive lock beside `state-file`. Scans of the same state file, from hooks or by hand, then
  run one at a time instead of overwriting each other's progress."
  [state-file f]
  (fs/create-dirs (fs/parent state-file))
  (with-open [channel (FileChannel/open (fs/path (str state-file ".lock"))
                                        (into-array OpenOption [StandardOpenOption/CREATE StandardOpenOption/WRITE]))]
    (.lock channel)
    (f)))

(defn- scan-with-state! [source options state-file]
  (let [since      (parse-since (:since options))
        opts       (merge options
                          {:since      since
                           :agent      (keyword (or (:drill-agent options) (name source)))
                           :model      (:drill-model options)
                           :reporter   (or (:reporter options) (str (System/getProperty "user.name") "." (name source)))
                           :machine    (.getHostName (java.net.InetAddress/getLocalHost))
                           :log        (log-file state-file)
                           :api-key    (api-key!)
                           ;; Hook scans run in the agent's environment, so these are read from .env and
                           ;; mise.local.toml as well, like the Jev key.
                           :server     (or (:server options) (bot-env/resolve-env "PAPERCUTS_SERVER") hooks/default-server)
                           :token      (or (:token options) (bot-env/resolve-env "PAPERCUTS_TOKEN"))})
        state      (atom (cond-> (starting-state {:explicit? (boolean (:state-file options))
                                                  :persist?  (not (or (:dry-run options) (:screen-only options)))}
                                                 state-file
                                                 (earlier-state-files source (:server opts)))
                           ;; A rescan forgets how far each session was read, but not what it already reported.
                           (:rescan options) (update :sessions update-vals #(select-keys % [:reported]))))
        opts       (assoc opts :known-cache (atom {}))
        sessions   (cond->> (candidate-sessions source opts @state)
                     (:limit options) (take (:limit options)))
        persist?   (not (or (:dry-run options) (:screen-only options)))
        failures   (atom 0)
        pool       (Executors/newFixedThreadPool (max 1 (:jobs options 4)))]
    (println (c/bold (str "Scanning " (count sessions) " " (name source) " session(s)"
                          (when since (str " since " since))
                          (when-not persist? " (nothing will be saved or submitted)"))))
    (doseq [session sessions]
      (.submit pool ^Runnable
               (fn []
                 (try
                   (let [next-state (scan-session! opts session (get-in @state [:sessions (:id session)]))
                         error      (::error next-state)]
                     (when persist?
                       (locking state
                         (swap! state assoc-in [:sessions (:id session)] (dissoc next-state ::error))
                         (save-state! state-file (assoc @state :last-run (str (Instant/now))))))
                     (when error (throw error)))
                   (catch Exception e
                     (swap! failures inc)
                     ;; Some exceptions have no message, a refused connection among them; the class still says what failed.
                     (say session (c/red "failed, will retry next run:") (or (ex-message e) (.getName (class e)))
                          (some-> (ex-data e) pr-str)))))))
    (.shutdown pool)
    (.awaitTermination pool Long/MAX_VALUE TimeUnit/SECONDS)
    (let [reported (count (mapcat :reported (vals (:sessions @state))))]
      (println (c/bold (str "Done. " (count sessions) " session(s) scanned, " @failures " failed."
                            (when persist? (str " State: " state-file " (" reported " papercut report(s) recorded)."))))))
    (when (pos? @failures)
      (u/exit 1))))

(defn scan!
  "Entry point for `mage papercuts-scan-claude` and `mage papercuts-scan-codex`."
  [source {:keys [options]}]
  (let [server     (or (:server options) (bot-env/resolve-env "PAPERCUTS_SERVER") hooks/default-server)
        options    (assoc options :server server)
        state-file (or (:state-file options) (default-state-file source server))]
    (if (or (:dry-run options) (:screen-only options))
      (scan-with-state! source options state-file)
      (with-state-lock state-file #(scan-with-state! source options state-file)))))
