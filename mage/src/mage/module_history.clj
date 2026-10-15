(ns mage.module-history
  "Keeps the files that track how the backend module graph changed up to date, and publishes them.

  The measuring and the files are `dev.module-history-report`'s work. Publishing is described by an EDN file kept
  outside the repo, since it names one person's or one team's uploads, cards and pages:

    {:pages    [{:template \"explorer-template.html\", :file \"module-boundaries.html\"}]
     :metabase {:profile \"stats\"
                :uploads {\"history.csv\" 123, \"structure.csv\" 124, \"cycles.csv\" 125}
                :cards   [456 457]}
     :shares   {\"module-boundaries.html\" \"module-boundaries-a1b2c3\"}}

  - `:pages` fills each `:template`, a path relative to the EDN file, from `history.json` and writes it to `:file`
    in the output directory. See [[fill-template]] for the placeholders.
  - `:metabase` replaces the rows of each upload table with a file from the output directory, using the `mb` CLI
    and its `:profile`. A replace needs the same columns as the upload. Metabase caches a card's results by its
    query, so each of the native `:cards` then gets a new comment at the end of its SQL.
  - `:shares` overwrites each mb-shares slug with a file from the output directory, using the `share` CLI."
  (:require
   [babashka.fs :as fs]
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

;;;; Running commands

(defn- sh!
  "Run `args` and return its stdout lines, exiting when the command fails."
  [opts args]
  (let [{:keys [exit out err]} (apply shell/sh* opts args)]
    (when-not (zero? exit)
      (u/exit (c/red (str "Failed: " (str/join " " args)
                          (when (seq err) (str "\n" (str/join "\n" err)))))
              exit))
    out))

(defn- change!
  "Run `args`, which changes something outside this checkout. With `dry-run?`, print the command instead."
  [dry-run? args]
  (if dry-run?
    (println (c/yellow "Would run:") (str/join " " args))
    (sh! {} args)))

;;;; Measuring

(def ^:private measuring-timeout-ms
  "Enough to measure the whole sample with an empty cache."
  (* 3 60 60 1000))

(defn- measure!
  "Write the files into `dir`, for the history of `ref` when it is given and of `origin/master` otherwise."
  [dir ref]
  ;; Always a fresh JVM, never the dev REPL: results are cached under a hash of the measuring code on disk, and a
  ;; REPL may have loaded an older version of it.
  (sh! {:timeout-ms measuring-timeout-ms}
       (cond-> ["clojure" "-X:dev" "dev.module-history-report/update!" ":dir" (pr-str (str dir))]
         ref (conj ":ref" (pr-str ref)))))

;;;; Publishing config

(defn- unknown-keys
  "A row for [[config-checks]]: the map at `path`, or each map in the sequence there, holds only `known` keys.
  Any other value passes, and is left to the row that checks its shape."
  [path known]
  (let [unknown (fn [value]
                  (let [maps (cond (map? value) [value], (sequential? value) (filter map? value))]
                    (distinct (mapcat #(remove known (keys %)) maps))))]
    [path
     (comp empty? unknown)
     #(str "has unknown keys: " (str/join ", " (unknown %)))]))

(defn- map-from-strings-to
  "A predicate for a map from strings to values that pass `valid-value?`."
  [valid-value?]
  (fn [m] (and (map? m) (every? string? (keys m)) (every? valid-value? (vals m)))))

(defn- page? [page]
  (and (map? page) (string? (:template page)) (string? (:file page))))

(def ^:private config-checks
  "What a publishing config must satisfy, as `[path valid? message]` in the order problems are reported.
  A check is skipped when nothing is at `path`.
  A `message` is a string, or a function of the value there."
  [(unknown-keys [] #{:metabase :pages :shares})
   (unknown-keys [:pages] #{:file :template})
   [[:pages]
    #(and (sequential? %) (every? page? %))
    "must be a vector of {:template \"path\", :file \"name\"}"]
   (unknown-keys [:metabase] #{:cards :profile :uploads})
   [[:metabase]
    #(string? (:profile %))
    "needs :profile, the mb profile to use"]
   [[:metabase :uploads]
    (map-from-strings-to pos-int?)
    "must map a file name to an upload table id"]
   [[:metabase :cards]
    #(and (sequential? %) (every? pos-int? %))
    "must be a vector of card ids"]
   [[:shares]
    (map-from-strings-to string?)
    "must map a file name to an mb-shares slug"]])

(defn- config-problems
  "Everything wrong with publishing `config`, as `{:path [:metabase :cards], :message \"must be ...\"}` maps.
  The path is empty for the config itself. Empty when the config is usable."
  [config]
  (if-not (map? config)
    [{:path [], :message "must hold one map"}]
    (for [[path valid? message] config-checks
          :let  [value (get-in config path)]
          :when (and (some? value) (not (valid? value)))]
      {:path    path
       :message (if (fn? message) (message value) message)})))

(defn- problem-line
  [{:keys [path message]}]
  (str (if (seq path) (str/join " " path) "the config") " " message))

(defn- read-config
  "The publishing config in `file`. Exits when the file is missing or malformed."
  [file]
  (when-not (fs/exists? file)
    (u/exit (c/red (str "No publishing config at " file)) 1))
  (let [config   (try
                   (edn/read-string (slurp (str file)))
                   (catch Exception e
                     (u/exit (c/red (str file " is not readable EDN: " (ex-message e))) 1)))
        problems (config-problems config)]
    (when (seq problems)
      (u/exit (c/red (str file " is not a publishing config:\n  " (str/join "\n  " (map problem-line problems)))) 1))
    config))

(defn- missing-tools
  "The command-line tools that publishing `config` runs and that are not installed."
  [{:keys [metabase shares]}]
  (binding [u/*skip-warning* true]
    (into [] (remove u/can-run?) (cond-> []
                                   (or (seq (:uploads metabase)) (seq (:cards metabase))) (conj "mb")
                                   (seq shares)                                         (conj "share")))))

;;;; Pages

(defn- script-safe-json
  "`value` as JSON that can sit inside a `<script>` element. Every `<` is escaped, since `</script>` ends the element
  and `<!--` can make the parser skip the tag that would end it. So are the line and paragraph separators, which
  older JavaScript parsers do not accept inside a string."
  [value]
  (str/replace (json/generate-string value) #"[<\u2028\u2029]" #(format "\\u%04x" (int (first %)))))

(def ^:private placeholders
  "Placeholder in a page template -> the key of `history.json` it shows, and how to write that key's value."
  [["/*DATA*/"    "commits"  script-safe-json]
   ["/*TODAY*/"   "today"    script-safe-json]
   ["/*ANCHORS*/" "clusters" script-safe-json]
   ["/*RETEST*/"  "retest"   script-safe-json]
   ["/*PAIRS*/"   "pairs"    script-safe-json]
   ["/*CUTS*/"    "cuts"     script-safe-json]
   ["/*COUNT*/"   "commits"  count]])

(defn fill-template
  "The page `template` with its placeholders replaced from `page-data`, the contents of `history.json`:

  - `/*DATA*/`: the commits, a JSON array
  - `/*TODAY*/`: the cycles at the latest commit, a JSON array
  - `/*ANCHORS*/`: the cluster names, a JSON array
  - `/*RETEST*/`: the latest commit's namespaces per tenth of retest share, a JSON object
  - `/*PAIRS*/`: the module pairs whose upward requires close a cycle at the latest commit, a JSON array
  - `/*CUTS*/`: the cheapest ways to split the largest cycle at the latest commit, a JSON array
  - `/*COUNT*/`: how many commits there are"
  [template page-data]
  ;; One pass over the template, so a placeholder inside a value already written, say in a commit subject, stays.
  (let [by-placeholder (into {} (map (juxt first rest)) placeholders)]
    (str/replace template
                 (re-pattern (str/join "|" (map (comp #(Pattern/quote %) first) placeholders)))
                 (fn [placeholder]
                   (let [[k write] (by-placeholder placeholder)]
                     (str (write (get page-data k))))))))

(defn- missing-page-keys
  "Keys that a placeholder in `template` shows and that `page-data` lacks."
  [template page-data]
  (distinct (for [[placeholder k] placeholders
                  :when           (and (str/includes? template placeholder) (not (contains? page-data k)))]
              k)))

(defn- read-template
  "The page template at `path`. Exits when there is none, or when it shows a key that `page-data` lacks."
  [path page-data]
  (when-not (fs/exists? path)
    (u/exit (c/red (str "No page template at " path)) 1))
  (let [template (slurp (str path))
        missing  (missing-page-keys template page-data)]
    (when (seq missing)
      (u/exit (c/red (str "history.json has no " (str/join ", " (map pr-str missing)) ", which " path
                          " shows. Run without --no-measure to write it again."))
              1))
    template))

(defn- write-pages!
  "Fill each of `pages` and write it into `dir`. A template path is relative to `config-dir`."
  [dir config-dir pages]
  (when (seq pages)
    (let [page-data (json/parse-string (slurp (str (fs/path dir "history.json"))))
          ;; Every template is read and checked before any page is written.
          templates (mapv #(read-template (fs/path config-dir (:template %)) page-data) pages)]
      (doseq [[{:keys [file]} template] (map vector pages templates)]
        (spit (str (fs/path dir file)) (fill-template template page-data))
        (println (c/green "Wrote") (str (fs/path dir file)))))))

;;;; Metabase

(def ^:private refresh-comment-prefix "-- refreshed by mage module-history at ")

(defn refreshed-sql
  "Native `sql` ending in one comment that carries `stamp`, replacing the comment an earlier refresh left."
  [sql stamp]
  (let [lines (->> (str/split-lines sql)
                   (remove #(str/starts-with? % refresh-comment-prefix))
                   (str/join "\n"))]
    (str (str/trimr lines) "\n" refresh-comment-prefix stamp)))

(defn- mb
  "An `mb` command line that asks `profile` for JSON without a size cap."
  [profile args]
  (concat ["mb"] args ["--profile" profile "--json" "--max-bytes" "0"]))

(defn- native-query
  "The dataset query of native card `id`. Exits when the card is not native, or when `profile` may not change it."
  [profile id]
  ;; String keys, so that names inside the query, such as template tags, are sent back as they came.
  (let [card  (json/parse-string (str/join "\n" (sh! {:quiet? true} (mb profile ["card" "get" (str id) "--full"]))))
        query (get card "dataset_query")]
    (when-not (string? (get-in query ["stages" 0 "native"]))
      (u/exit (c/red (str "Card " id " is not a native query, so its results cannot be refreshed this way")) 1))
    (when (false? (get card "can_write"))
      (u/exit (c/red (str "Card " id " cannot be changed with the " profile " profile")) 1))
    query))

(defn- refresh-card!
  "Change the SQL of native card `id` so Metabase stops serving the results it cached."
  [dry-run? profile stamp id]
  (if dry-run?
    (println (c/yellow "Would refresh card") id)
    ;; Fetch the query again: an edit made while the uploads ran must not be overwritten with an older copy.
    (let [query (native-query profile id)
          tmp   (fs/create-temp-dir {:prefix "module-history"})
          body  (str (fs/path tmp "card.json"))]
      (try
        (spit body (json/generate-string
                    {"dataset_query" (update-in query ["stages" 0 "native"] refreshed-sql stamp)}))
        (sh! {:quiet? true} (mb profile ["card" "update" (str id) "--file" body]))
        (finally
          (fs/delete-tree tmp)))
      (println (c/green "Refreshed card") id))))

(defn- publish-to-metabase!
  "Replace the upload tables, then refresh the cards. Every card is fetched and checked first, a dry run's too, so a
  card that cannot be refreshed stops the run before any table changes."
  [dry-run? dir {:keys [profile uploads cards]}]
  (run! #(native-query profile %) cards)
  (let [stamp (str (.truncatedTo (Instant/now) ChronoUnit/SECONDS))]
    (doseq [[file table-id] (sort uploads)]
      (change! dry-run? (mb profile ["upload" "replace" (str table-id) "--file" (str (fs/path dir file))])))
    (doseq [id cards]
      (refresh-card! dry-run? profile stamp id))))

;;;; Publishing

(defn- missing-files
  "Files the config publishes that are not in `dir` and that no page will write there."
  [dir {:keys [pages metabase shares]}]
  (->> (concat (keys (:uploads metabase)) (keys shares))
       (remove (set (map :file pages)))
       (remove #(fs/exists? (fs/path dir %)))
       distinct))

(defn- publish!
  "Publish the files in `dir` as `config` says, with page templates relative to `config-dir`. With `dry-run?`, write
  the pages but only print the commands that would change Metabase or a share."
  [dry-run? dir config config-dir]
  (let [missing (missing-files dir config)]
    (when (seq missing)
      (u/exit (c/red (str "Not in " dir ": " (str/join ", " missing))) 1))
    (write-pages! dir config-dir (:pages config))
    (when-let [metabase (:metabase config)]
      (publish-to-metabase! dry-run? dir metabase))
    (doseq [[file slug] (sort (:shares config))]
      (change! dry-run? ["share" "-e" (str (fs/path dir file)) slug]))))

;;;; Entry point

(defn- remote-branch
  "The branch on `origin` that `ref` tracks, or nil for a local branch or a commit, which no fetch changes."
  [ref]
  (second (re-matches #"(?:refs/remotes/)?origin/(.+)" ref)))

(defn cli-update
  "Fetch the ref to measure, measure its new commits, write the files, and publish them when asked."
  [{:keys [options]}]
  (let [{:keys [dir publish ref no-fetch no-measure dry-run]} options]
    (when (str/blank? dir)
      (u/exit (c/red "Pass --dir DIR, the directory to keep the files in.") 1))
    (when (and dry-run (not publish))
      (u/exit (c/red "--dry-run only applies to --publish.") 1))
    (let [dir         (fs/absolutize (fs/expand-home dir))
          config-file (some-> publish fs/expand-home)
          ;; Read the config first, so a mistake in it shows before the measuring, not after.
          config      (some-> config-file read-config)
          timer       (u/start-timer)]
      ;; A dry run checks too, so that it predicts what a real run does.
      (when-let [missing (seq (some-> config missing-tools))]
        (u/exit (c/red (str "Not installed, but needed to publish: " (str/join ", " missing))) 1))
      (when-not no-measure
        (when-not no-fetch
          (when-let [branch (remote-branch (or ref "origin/master"))]
            (println (str "Fetching origin/" branch "..."))
            ;; Name the destination: a clone that fetches only some branches would update only FETCH_HEAD.
            (sh! {} ["git" "fetch" "--quiet" "origin" (str "+refs/heads/" branch ":refs/remotes/origin/" branch)])))
        (measure! dir ref))
      (when config
        (publish! (boolean dry-run) dir config (fs/parent (fs/absolutize config-file))))
      (printf "\nFinished in %.1fs\n" (/ (u/since-ms timer) 1000.0))
      (flush))))
