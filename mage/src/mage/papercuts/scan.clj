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
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.color :as c]
   [mage.papercuts.drill :as drill]
   [mage.papercuts.jev :as jev]
   [mage.papercuts.transcript :as transcript]
   [mage.util :as u])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent Executors TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private chunk-chars
  "Chunk size. Jev takes at most 32k tokens of state; 60k characters of transcript stays well under that."
  60000)

(def ^:private context-chars
  "How much of the preceding stretch each chunk carries as context."
  6000)

(def ^:private embargo-pattern
  "Sessions that mention embargoed security work are skipped whole and never sent to Jev or a drill-down agent."
  #"(?i)embargo|metabase-private|GHSA-|CVE-\d")

(def ^:private category-by-kind
  {"codebase-trap"     "code-smell"
   "doc-gap"           "documentation"
   "misleading-signal" "agent-trap"
   "agent-behaviour"   "agent-trap"})

;;; Sources

(def ^:private sources
  {:claude {:roots   [(fs/path (fs/home) ".claude" "projects")]
            :entries transcript/claude-entries
            :session transcript/claude-session}
   :codex  {:roots   [(fs/path (fs/home) ".codex" "sessions") (fs/path (fs/home) ".codex" "archived_sessions")]
            :entries transcript/codex-entries
            :session transcript/codex-session}})

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

(defn default-state-file
  "Progress file for `source` in the gitignored `local/` directory of this checkout."
  [source]
  (str (fs/path u/project-root-directory "local" "papercuts" (str "scan-state." (name source) ".edn"))))

(defn- log-file [state-file]
  (str/replace (str state-file) #"scan-state\.(\w+)\.edn$" "scan-log.$1.jsonl"))

(defn load-state
  "Saved progress: `{:sessions {session-id {:line :until :modified :path :reported [...]}}}`."
  [file]
  (if (fs/exists? file)
    (edn/read-string (slurp file))
    {:version 1 :sessions {}}))

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
  "The server report for one positive papercut found in `session`, filed under `fingerprint`."
  [{:keys [reporter repository machine]} session papercut fingerprint entries scores]
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
      machine (assoc :machine machine))))

(defn reportable
  "Positive papercuts from a drill-down that have an anchor in the new stretch and whose slug this session has not
  reported before. Anchors outside the chunk are dropped, since the agent may have misnumbered them."
  [papercuts {:keys [first-new-line last-line]} already-reported]
  (let [seen (into #{} (map :slug) already-reported)]
    (for [papercut papercuts
          :let [anchors (filter #(<= (:line %) last-line) (:anchors papercut))]
          :when (and (= "positive" (:label papercut))
                     (some #(>= (:line %) first-new-line) anchors)
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

(defn- scan-chunk!
  "Screen one chunk, drill it if flagged, and submit what it finds. Returns the session state advanced past it."
  [{:keys [threshold dry-run screen-only verbose api-key known log] :as opts} session state chunk]
  (let [{:keys [scores model]} (if (< (count (:text chunk)) 500)
                                 {:scores {}}
                                 (jev/screen! api-key chunk))
        flagged   (jev/flagged? scores threshold)
        found     (when (and flagged (not screen-only))
                    (drill/drill! opts (assoc chunk :session session :existing known)))
        reported  (into #{} (map :fingerprint) (:reported state))
        reports   (->> (reportable found chunk (:reported state))
                       (map #(report opts session % (fingerprint-for opts %) (:entries chunk) scores))
                       ;; One report per papercut per session, even when two findings resolve to the same one.
                       (remove #(reported (:fingerprint %)))
                       (reduce (fn [acc r] (cond-> acc (not-any? #(= (:fingerprint %) (:fingerprint r)) acc) (conj r)))
                               []))
        results   (if dry-run
                    (mapv (constantly :dry-run) reports)
                    (mapv #(submit! opts %) reports))]
    (when (or flagged verbose)
      (say session (str "L" (:first-new-line chunk) "-" (:last-line chunk))
           (if flagged (c/yellow "flagged") "clean")
           (str/join " " (for [[k v] (sort-by val > scores)] (format "%s=%.2f" (name k) (double v))))))
    (doseq [[r result] (map vector reports results)]
      (say session (c/green (name result)) (:fingerprint r) "-" (:title r)))
    (doseq [p found :when (not= "positive" (:label p))]
      (say session (c/magenta (:label p)) (:slug p) "-" (:title p)))
    (when-not dry-run
      (log! log {:session   (:id session)
                 :path      (:path session)
                 :lines     [(:first-new-line chunk) (:last-line chunk)]
                 :jev_model model
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

      (some #(re-find embargo-pattern (:text %)) entries)
      (do (say session (c/yellow "skipped: mentions embargoed work"))
          (assoc state :line (:line (peek fresh)) :until (:ts (peek fresh)) :skipped "embargo"))

      :else
      (reduce (fn [state chunk]
                (try
                  (scan-chunk! opts session state chunk)
                  (catch Exception e
                    (reduced (assoc state ::error e)))))
              state
              (chunks earlier fresh)))))

;;; Entry point

(defn- api-key! []
  (or (bot-env/resolve-env "TYPESAFE_API_KEY")
      (do (println (c/red "TYPESAFE_API_KEY not found in mise.local.toml, .env, .lein-env, or the environment."))
          (u/exit 1))))

(defn scan!
  "Entry point for `mage papercuts-scan-claude` and `mage papercuts-scan-codex`."
  [source {:keys [options]}]
  (let [state-file (or (:state-file options) (default-state-file source))
        since      (parse-since (:since options))
        opts       (merge options
                          {:since      since
                           :agent      (keyword (or (:drill-agent options) (name source)))
                           :model      (:drill-model options)
                           :reporter   (or (:reporter options) (str (System/getProperty "user.name") "." (name source)))
                           :machine    (.getHostName (java.net.InetAddress/getLocalHost))
                           :log        (log-file state-file)
                           :api-key    (api-key!)})
        state      (atom (cond-> (load-state state-file)
                           ;; A rescan forgets how far each session was read, but not what it already reported.
                           (:rescan options) (update :sessions update-vals #(select-keys % [:reported]))))
        ;; A dry run can go ahead without a server; it just can't match findings to known papercuts.
        known      (if (or (:dry-run options) (:screen-only options))
                     (try (known-papercuts opts) (catch Exception _ []))
                     (known-papercuts opts))
        opts       (assoc opts :known known)
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
                     (say session (c/red "failed, will retry next run:") (ex-message e)
                          (some-> (ex-data e) pr-str)))))))
    (.shutdown pool)
    (.awaitTermination pool Long/MAX_VALUE TimeUnit/SECONDS)
    (let [reported (count (mapcat :reported (vals (:sessions @state))))]
      (println (c/bold (str "Done. " (count sessions) " session(s) scanned, " @failures " failed."
                            (when persist? (str " State: " state-file " (" reported " papercut report(s) recorded)."))))))
    (when (pos? @failures)
      (u/exit 1))))
