(ns mage.token-scan
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.util.concurrent Callable Executors TimeUnit]))

(set! *warn-on-reflection* true)

(def ^:private token-patterns
  "Token regex patterns to scan for and their names for reporting.
   The keys are human-readable names, the values are regex patterns to match the tokens.
   These patterns are designed to catch common token formats used in Metabase."
  {"Airgap Token"    #"airgap_.{400,}" ;; afaik 461 is the absolute minimum, but this is good enough
   "Hash/Dev Token"  #"(mb_dev_[0-9A-Fa-f]{57}|\\b[0-9A-Fa-f]{64}\\b)"
   "OpenAI API Key"  #"sk-[A-Za-z0-9]{43,51}" ;; OpenAI API keys start with sk- and are ~48 chars total
   "JWT Token"       #"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}" ;; JWT format: header.payload.signature
   "JWE Token"       #"eyJ[A-Za-z0-9_-]{400,}" ;; JWE tokens are much longer, minimum ~461 chars
   "GitHub Token"    #"gh[pousr]_[A-Za-z0-9]{36}" ;; GitHub personal access tokens
   "Slack Bot Token" #"xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+" ;; Slack bot tokens
   "AWS Access Key"  #"AKIA[0-9A-Z]{16}" ;; AWS access key IDs
   })

(def token-like-whitelist
  "A coll of token-like strings that are not considered secrets.
   These are used to avoid false positives in the token scanning process.

  Usually we use the ignore-marker but in e.g. markdown code blocks you cannot easily do that without affecting the formatting."
  (->>
   (str u/project-root-directory "/mage/resources/token_scanner/token_whitelist.txt")
   slurp
   str/split-lines
   (remove str/blank?)
   (remove #(str/starts-with? % "#")) ;; Ignore comments
   distinct))

(defn- whitelisted? [line]
  (boolean (some #(str/includes? line %) token-like-whitelist)))

(defn- truncate-around-match
  "Truncate text around a regex match, showing ~100 chars before and after"
  [text pattern]
  (if-let [matcher (re-matcher pattern text)]
    (if (.find matcher)
      (let [match-start (.start matcher)
            match-end (.end matcher)
            context-size 50
            start-pos (max 0 (- match-start context-size))
            end-pos (min (count text) (+ match-end context-size))
            prefix (when (> start-pos 0) "...")
            suffix (when (< end-pos (count text)) "...")
            truncated (str prefix (subs text start-pos end-pos) suffix)]
        truncated)
      text)
    text))

(defn- scan-line [line line-num patterns]
  (keep (fn [[pattern-name pattern]]
          (when (and (re-find pattern line)
                     (not (whitelisted? line)))
            {:pattern-name pattern-name
             :line-number line-num
             :line-text (truncate-around-match line pattern)}))
        patterns))

(defn- scan-lines [reader patterns]
  (loop [line-num 1
         matches []]
    (if-let [line (.readLine reader)]
      (let [line-matches (scan-line line line-num patterns)]
        (recur (inc line-num)
               (into matches line-matches)))
      matches)))

(defn- scan-file
  "Scan a single file for regex patterns. Returns map with file path and matches."
  [patterns ^String file-path]
  (try
    (with-open [reader (io/reader file-path)]
      (let [matches (scan-lines reader patterns)]
        {:file file-path
         :matches matches
         :error nil}))
    (catch Exception e
      {:file file-path
       :matches []
       :error (str e)})))

(defn remove-ignored [files]
  (let [ignored (u/git-ignored-files files) ;; Returns a set of git-ignored files
        _       (u/debug "Ignored files:" (count ignored))
        files'  (remove ignored files)]
    (u/debug "Files to scan:" (count files'))
    (doseq [file files']
      (when-not (fs/exists? file)
        (throw (ex-info (str "Missing file: " file) {:babashka/exit 1 :file file}))))
    (println "Scanning" (c/green (count files')) "and ignoring" (c/magenta (- (count files) (count files'))) ".gitignore'd and whitelisted files...")
    files'))

(defn- get-all-files
  "Get all files in the project (excluding auto-generated files and build artifacts)"
  []
  (u/debug "finding all files in the project directory...")
  (->> (fs/glob u/project-root-directory "**/*")
       (map str)))

(defn- merge-scanned
  "Merge results from parallel scanning"
  ([] {:scanned [] :total-files 0 :files-with-matches 0 :total-matches 0})
  ([acc] acc)
  ([acc scanned]
   (-> acc
       (update :total-files inc)
       (update :files-with-matches (if (seq (:matches scanned)) inc identity))
       (update :total-matches + (count (:matches scanned)))
       (update :scanned conj scanned))))

(defn- clamp "Clamp n to the range [lo, hi]." [n lo hi] (max lo (min hi n)))
(def ^:private pool-size (clamp (* 2 (.availableProcessors (Runtime/getRuntime))) 4 32))

(defn- scan-files [patterns files]
  (let [_ (u/debug (c/yellow "Using thread pool size: " pool-size))
        executor (Executors/newFixedThreadPool pool-size)]
    (try
      (let [callables (mapv (fn [f] (reify Callable (call [_] (scan-file patterns f)))) files)
            futures (.invokeAll executor callables)
            results (mapv #(.get ^java.util.concurrent.Future %) futures)]
        (reduce merge-scanned (merge-scanned) results))
      (finally
        (.shutdown executor)
        (.awaitTermination executor 10 TimeUnit/SECONDS)))))

(defn- find-files-from-options [all-files arguments]
  (let [files (cond
                ;; --all-files flag
                all-files (do
                            (when (seq arguments)
                              (println (c/yellow "Ignoring specific files, scanning all files...")))
                            (get-all-files))
                ;; Default: require specific files
                ;; Arguments provided = specific files to scan
                (seq arguments) arguments
                :else (throw (ex-info
                              nil
                              {:mage/error    (c/yellow "No files specified. Use -a to scan all files or specify files to scan.")
                               :babashka/exit 1})))]
    (->> files
         (filter fs/regular-file?)
         (map str)
         distinct)))

(defn run-scan
  "Main entry point for regex scanning"
  [{:keys [options arguments]}]
  (let [start-time        (System/nanoTime)
        {:keys [all-files
                verbose]} options
        files             (find-files-from-options all-files arguments)
        files'            (remove-ignored files)
        {:keys [scanned total-files files-with-matches total-matches]
         :as   full-info} (scan-files token-patterns files')
        info              (dissoc full-info :scanned :duration-ms)
        duration-ms       (/ (- (System/nanoTime) start-time) 1e6)]

    ;; Print results
    (doseq [{:keys [file matches error]} scanned]
      (when error
        (throw (ex-info (c/red "Error scanning " file ": " error) {:file file :error error :babashka/exit 1})))
      (when (seq matches)
        (doseq [{:keys [pattern-name line-number column-number line-text]} matches]
          (println (c/blue file
                           ":" line-number
                           (when column-number (str ":" column-number))
                           (c/yellow "[" pattern-name "]")
                           (c/magenta (str/trim line-text)))))))

    (println "Scan completed in:   " (format "%.0f" duration-ms) "ms")
    (when verbose
      (println "--------------------")
      (println "Files scanned:      " (c/yellow total-files))
      (println "Files with matches: " ((if (zero? files-with-matches) c/green c/yellow)
                                       files-with-matches))
      (println "Total matches:      " ((if (zero? total-matches) c/green c/yellow)
                                       total-matches)))

    (if (> total-matches 0)
      (throw (ex-info nil
                      {:outcome    info
                       :mage/error (str (c/red "Token Scanning found a potential secret.\n")
                                        (c/magenta "If you know your token is good add it to the token whitelist in mage/resources/token_scanner/token_whitelist.txt\n")
                                        (c/cyan (c/green "More info:") " https://github.com/metabase/metabase/blob/master/docs/developers-guide/security-token-scanner.md"))}))
      (println (c/green "OK: No potential secrets found.")))
    ;; Return results for potential further processing + testing
    info))
