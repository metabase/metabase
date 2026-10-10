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
   ;; mage runs under babashka, which bundles cheshire; metabase.util.json isn't on its classpath
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u])
  (:import
   (java.time Instant)
   (java.time.temporal ChronoUnit)))

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
  "A check that the map at `path`, or each map of the vector there, holds only `known` keys."
  [path known]
  [path
   (fn [value]
     (let [maps (cond (map? value) [value], (sequential? value) (filter map? value))]
       (distinct (mapcat #(remove known (keys %)) maps))))
   (fn [unknown] (str "has unknown keys: " (str/join ", " unknown)))])

(defn- string-keyed?
  [valid-value?]
  (fn [m] (and (map? m) (every? string? (keys m)) (every? valid-value? (vals m)))))

(def ^:private config-checks
  "What a publishing config must satisfy, as `[path valid? message]`.
  The value at `path` passes when `valid?` returns true, or a seq with nothing in it.
  A `message` is a string, or a function of what `valid?` returned."
  [(unknown-keys [] #{:pages :metabase :shares})
   (unknown-keys [:metabase] #{:profile :uploads :cards})
   (unknown-keys [:pages] #{:template :file})
   [[:pages]
    (fn [pages] (or (nil? pages)
                    (and (sequential? pages)
                         (every? #(and (map? %) (string? (:template %)) (string? (:file %))) pages))))
    "must be a vector of {:template \"path\", :file \"name\"}"]
   [[:metabase]
    (fn [metabase] (or (nil? metabase) (string? (:profile metabase))))
    "needs :profile, the mb profile to use"]
   [[:metabase :uploads]
    (fn [uploads] (or (nil? uploads) ((string-keyed? pos-int?) uploads)))
    "must map a file name to an upload table id"]
   [[:metabase :cards]
    (fn [cards] (or (nil? cards) (and (sequential? cards) (every? pos-int? cards))))
    "must be a vector of card ids"]
   [[:shares]
    (fn [shares] (or (nil? shares) ((string-keyed? string?) shares)))
    "must map a file name to an mb-shares slug"]])

(defn- config-problems
  "Everything wrong with publishing `config`, as `{:path [:metabase :cards], :message \"must be ...\"}` maps.
  The path is empty for the config itself. Empty when the config is usable."
  [config]
  (if-not (map? config)
    [{:path [], :message "must hold one map"}]
    (for [[path valid? message] config-checks
          :let  [result (valid? (get-in config path))]
          :when (if (seqable? result) (seq result) (not result))]
      {:path    path
       :message (if (fn? message) (message result) message)})))

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
                                   metabase     (conj "mb")
                                   (seq shares) (conj "share")))))

;;;; Pages

(defn- script-safe-json
  "`value` as JSON that can sit inside a `<script>` element."
  [value]
  (str/replace (json/generate-string value) "</" "<\\/"))

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
  (reduce (fn [page [placeholder k write]]
            (str/replace page placeholder (str (write (get page-data k)))))
          template
          placeholders))

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

(defn- refresh-card!
  "Change the SQL of native card `id` so Metabase stops serving the results it cached."
  [dry-run? profile stamp id]
  (if dry-run?
    (println (c/yellow "Would refresh card") id)
    ;; String keys, so that names inside the query, such as template tags, are sent back as they came.
    (let [card  (json/parse-string (str/join "\n" (sh! {:quiet? true} (mb profile ["card" "get" (str id) "--full"]))))
          query (get card "dataset_query")
          sql   (get-in query ["stages" 0 "native"])]
      (when-not (string? sql)
        (u/exit (c/red (str "Card " id " is not a native query, so its results cannot be refreshed this way")) 1))
      (let [tmp  (fs/create-temp-dir {:prefix "module-history"})
            body (str (fs/path tmp "card.json"))]
        (try
          (spit body (json/generate-string
                      {"dataset_query" (assoc-in query ["stages" 0 "native"] (refreshed-sql sql stamp))}))
          (sh! {:quiet? true} (mb profile ["card" "update" (str id) "--file" body]))
          (finally
            (fs/delete-tree tmp))))
      (println (c/green "Refreshed card") id))))

(defn- publish-to-metabase!
  [dry-run? dir {:keys [profile uploads cards]}]
  (doseq [[file table-id] (sort uploads)]
    (change! dry-run? (mb profile ["upload" "replace" (str table-id) "--file" (str (fs/path dir file))])))
  (let [stamp (str (.truncatedTo (Instant/now) ChronoUnit/SECONDS))]
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

(defn cli-update
  "Fetch master, measure its new commits, write the files, and publish them when asked."
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
          (println "Fetching origin/master...")
          (sh! {} ["git" "fetch" "--quiet" "origin" "master"]))
        (measure! dir ref))
      (when config
        (publish! (boolean dry-run) dir config (fs/parent (fs/absolutize config-file))))
      (printf "\nFinished in %.1fs\n" (/ (u/since-ms timer) 1000.0))
      (flush))))
