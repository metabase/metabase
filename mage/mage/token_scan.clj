(ns mage.token-scan
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.util.concurrent Executors Callable TimeUnit]))

(set! *warn-on-reflection* true)

(def ^:private ignore-marker
  "This is the pattern we check for to say 'this token is OK to use in source code'
   It's constructed this weird way because this file gets scanned too: so it would match itself, causing a false positive."
  (str/join "-" ["metabase" "scanner" "ignore"]))

(def ^:private token-patterns
  "Token regex patterns to scan for and their names for reporting.
   The keys are human-readable names, the values are regex patterns to match the tokens.
   These patterns are designed to catch common token formats used in Metabase."
  {"Airgap Token"    #"airgap_.{400}" ;; afaik 461 is the absolute minimum, but this is good enough
   "Hash/Dev Token"  #"(mb_dev_[0-9a-f]{57}|[0-9a-f]{64})"
   "OpenAI API Key"  #"sk-[A-Za-z0-9]{43,51}" ;; OpenAI API keys start with sk- and are ~48 chars total
   "JWT Token"       #"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}" ;; JWT format: header.payload.signature
   "JWE Token"       #"eyJ[A-Za-z0-9_-]{400,}" ;; JWE tokens are much longer, minimum ~461 chars
   "GitHub Token"    #"gh[pousr]_[A-Za-z0-9]{36}" ;; GitHub personal access tokens
   "Slack Bot Token" #"xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+" ;; Slack bot tokens
   "AWS Access Key"  #"AKIA[0-9A-Z]{16}" ;; AWS access key IDs
   })

(defn- truncate-around-match
  "Truncate text around a regex match, showing ~100 chars before and after"
  [text pattern]
  (if-let [matcher (re-matcher pattern text)]
    (if (.find matcher)
      (let [match-start (.start matcher)
            match-end (.end matcher)
            context-size 100
            start-pos (max 0 (- match-start context-size))
            end-pos (min (count text) (+ match-end context-size))
            prefix (if (> start-pos 0) "..." "")
            suffix (if (< end-pos (count text)) "..." "")
            truncated (str prefix (subs text start-pos end-pos) suffix)]
        truncated)
      text)
    text))

(defn- scan-file
  "Scan a single file for regex patterns. Returns map with file path and matches."
  [patterns ^String file-path]
  (try
    (let [lines (str/split-lines (slurp file-path))
          ignore-lines (atom #{})
          unused-ignores (atom #{})
          
          ;; First pass: find all lines with ignore markers
          ;; Skip collecting unused ignores for documentation files
          _ (when-not (str/includes? file-path "docs/developers-guide/security-token-scanner.md")
              (doseq [[line-idx line] (map-indexed vector lines)]
                (when (str/includes? line ignore-marker)
                  (swap! unused-ignores conj (inc line-idx)))))
          
          matches (into []
                        (comp
                         (map-indexed (fn [line-idx line]
                                        (keep (fn [[pattern-name pattern]]
                                                (when (re-find pattern line)
                                                  (let [line-num (inc line-idx)]
                                                    (if (str/includes? line ignore-marker)
                                                      ;; Mark this ignore as used
                                                      (do (swap! ignore-lines conj line-num)
                                                          (swap! unused-ignores disj line-num)
                                                          nil) ; Don't include in matches
                                                      ;; Include in matches
                                                      {:pattern-name pattern-name
                                                       :line-number line-num
                                                       :line-text (truncate-around-match line pattern)}))))
                                              patterns)))
                         cat)
                        lines)]
      {:file file-path
       :matches matches
       :unused-ignores @unused-ignores
       :error nil})
    (catch Exception e
      {:file file-path
       :matches []
       :unused-ignores #{}
       :error (str e)})))

(defn- exclude-path-str?
  "Check if a file should be excluded from scanning (auto-generated, build artifacts, etc.)"
  [path-str]
  (or
   ;; Version control and build directories
   (str/includes? path-str "/.git/")
   (str/includes? path-str "/node_modules/")
   (str/includes? path-str "/target/")
   (str/includes? path-str "/resources/frontend_client/")
   
   ;; Build artifacts and generated files
   (str/ends-with? path-str ".db")
   (str/ends-with? path-str ".js.map")
   (str/ends-with? path-str ".jar")
   (str/ends-with? path-str ".class")
   (str/ends-with? path-str ".min.js")
   (str/ends-with? path-str ".bundle.js")
   (str/ends-with? path-str ".hot.bundle.js")
   
   ;; Checksum and hash files (likely to contain 64-char hashes)
   (str/ends-with? path-str "/SHA256.sum")
   (str/ends-with? path-str ".sha256")
   (str/ends-with? path-str ".md5")
   
   ;; Binary and compiled files
   (str/ends-with? path-str ".so")
   (str/ends-with? path-str ".dylib")
   (str/ends-with? path-str ".dll")
   (str/ends-with? path-str ".exe")
   
   ;; Image and media files
   (str/ends-with? path-str ".png")
   (str/ends-with? path-str ".jpg")
   (str/ends-with? path-str ".jpeg")
   (str/ends-with? path-str ".gif")
   (str/ends-with? path-str ".svg")
   (str/ends-with? path-str ".ico")
   
   ;; Archive files
   (str/ends-with? path-str ".zip")
   (str/ends-with? path-str ".tar")
   (str/ends-with? path-str ".gz")
   
   ;; Generated documentation and test data
   (str/includes? path-str "/stories-data/")
   (str/includes? path-str "/test-data/")
   (str/includes? path-str "/fixtures/")

   ;; fake ag token file
   (str/ends-with? path-str "test_resources/fake_ag_token.txt")))

(defn- get-all-files
  "Get all files in the project (excluding auto-generated files and build artifacts)"
  []
  (let [project-root u/project-root-directory]
    (->> (fs/glob project-root "**/*")
         (filter fs/regular-file?)
         (remove fs/executable?)
         (map str)
         (remove exclude-path-str?))))

(defn- get-git-updated-files
  "Get files updated relative to master branch"
  [diff-target]
  (let [project-root u/project-root-directory]
    (->> (u/sh "git" "diff" "--name-only" diff-target)
         str/split-lines
         (remove #{""})
         (filter (fn [filename]
                   (fs/exists? (str project-root "/" filename))))
         (map (fn [filename]
                (str project-root "/" filename)))
         (remove exclude-path-str?))))


(defn- merge-scanned
  "Merge results from parallel scanning"
  ([] {:total-files 0 :files-with-matches 0 :total-matches 0 :total-unused-ignores 0 :results []})
  ([acc] acc)
  ([acc scanned]
   (-> acc
       (update :total-files inc)
       (update :files-with-matches (if (seq (:matches scanned)) inc identity))
       (update :total-matches + (count (:matches scanned)))
       (update :total-unused-ignores + (count (:unused-ignores scanned)))
       (update :scanned conj scanned))))

(defn scan-files [patterns files]
  (let [start-time (System/nanoTime)
        pool-size (-> (/ (count files) 8) int (max 4) (min 32))
        _ (println (c/yellow "Using thread pool size: " pool-size))
        executor (Executors/newFixedThreadPool pool-size)
        callables (mapv (fn [f]
                          (reify Callable
                            (call [_] (scan-file patterns f))))
                        files)
        futures (.invokeAll executor callables)
        results (mapv #(.get ^java.util.concurrent.Future %) futures)
        merged (reduce merge-scanned (merge-scanned) results)
        duration-ms (/ (- (System/nanoTime) start-time) 1e6)]
    (.shutdown executor)
    (.awaitTermination executor 10 TimeUnit/SECONDS)
    (assoc merged
           :duration-ms duration-ms)))

(defn run-scan
  "Main entry point for regex scanning"
  [{:keys [options arguments]}]
  (let [{:keys [all-files target verbose no-lines]} options
        files (cond
                ;; Arguments provided = specific files to scan
                (seq arguments) arguments
                ;; --all-files flag
                all-files (get-all-files)
                ;; Default: scan git-updated files
                :else (get-git-updated-files (or target "master")))
        
        _ (when (empty? files)
            (println (c/yellow "No files to scan"))
            (System/exit 0))
        
        {:keys [scanned duration-ms total-files files-with-matches total-matches total-unused-ignores] :as x}
        (scan-files token-patterns files)]

    ;; Print results
    (when verbose
      (doseq [{:keys [file matches unused-ignores error]} scanned]
        (when error
          (println (c/red "Error scanning " file ": " error)))
        (when (seq matches)
          (println (c/blue file))
          (when-not no-lines
            (doseq [{:keys [pattern-name line-number line-text]} matches]
              (println (c/white "  Line# " (c/bold line-number) " [" (c/yellow pattern-name) "]:" (c/green (str/trim line-text)))))))
        (when (seq unused-ignores)
          (println (c/red file))
          (doseq [line-num unused-ignores]
            (println (c/red "  Line# " (c/bold line-num) ": Unused " ignore-marker " comment"))))))

    (println (c/green "Scan completed in " (format "%.0f" duration-ms) "ms"))
    (println (c/yellow "Files scanned:      " total-files))
    (println (c/yellow "Files with matches: " files-with-matches))
    (println (c/yellow "Total matches:      " total-matches))
    (when (> total-unused-ignores 0)
      (println (c/red "Unused ignores:     " total-unused-ignores))
      (System/exit 1))
    ;; Return results for potential further processing
    scanned))
