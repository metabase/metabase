(ns mage.token-scan
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.util.concurrent Callable Executors TimeUnit]))

(set! *warn-on-reflection* true)

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

(def token-like-whitelist
  "A set of token-like strings that are not considered secrets.
   These are used to avoid false positives in the token scanning process.

  Usually we use the ignore-marker but in e.g. markdown code blocks you cannot easily do that without affecting the formatting."
  (->>
   (str u/project-root-directory "/mage/resources/token_scanner/token_whitelist.txt")
   slurp
   str/split-lines))

(defn- white-listed? [line]
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
          matches (into []
                        (comp
                         (map-indexed (fn [line-idx line]
                                        (keep (fn [[pattern-name pattern]]
                                                (when (and (re-find pattern line)
                                                           (not (white-listed? line)))
                                                  {:pattern-name pattern-name
                                                   :line-number (inc line-idx)
                                                   :line-text (truncate-around-match line pattern)}))
                                              patterns)))
                         cat)
                        lines)]
      {:file file-path
       :matches matches
       :error nil})
    (catch Exception e
      {:file file-path
       :matches []
       :error (str e)})))

(defn- git-ignored-files
  "Returns a set of files that are ignored by git."
  [files]
  (println
   (c/yellow "Checking git ignore status for " (c/white (count files)) " files..."))
  (let [proc (p/sh {:out :string
                    :err :string
                    :continue true
                    :dir u/project-root-directory
                    :in (str/join "\n" files)}
                   "git" "check-ignore" "--stdin")
        output (:out proc)]
    (->> output str/split-lines
         (remove str/blank?)
         (map str/trim)
         (set))))

(def ^:private our-ignored-files
  (->> "/mage/resources/token_scanner/file_whitelist.txt"
       (str u/project-root-directory)
       slurp
       str/split-lines
       (mapv #(str u/project-root-directory "/" %))
       set))

(defn- ignored-files [files]
  (set/union
   (git-ignored-files files)
   our-ignored-files))

(defn- get-all-files
  "Get all files in the project (excluding auto-generated files and build artifacts)"
  []
  (let [project-root u/project-root-directory]
    (->> (fs/glob project-root "**/*")
         (filter fs/regular-file?)
         (map str))))

(defn- merge-scanned
  "Merge results from parallel scanning"
  ([] {:total-files 0 :files-with-matches 0 :total-matches 0})
  ([acc] acc)
  ([acc scanned]
   (-> acc
       (update :total-files inc)
       (update :files-with-matches (if (seq (:matches scanned)) inc identity))
       (update :total-matches + (count (:matches scanned)))
       (update :scanned conj scanned))))

(defn scan-files [patterns files]
  (let [start-time (System/nanoTime)
        pool-size (-> (/ (count files) 8) int (max 4) (min 32))
        _ (println (c/yellow "Using thread pool size: " pool-size))
        executor (Executors/newFixedThreadPool pool-size)
        callables (mapv (fn [f] (reify Callable (call [_] (scan-file patterns f)))) files)
        futures (.invokeAll executor callables)
        results (mapv #(.get ^java.util.concurrent.Future %) futures)
        merged (reduce merge-scanned (merge-scanned) results)
        duration-ms (/ (- (System/nanoTime) start-time) 1e6)]
    (.shutdown executor)
    (.awaitTermination executor 10 TimeUnit/SECONDS)
    (assoc merged :duration-ms duration-ms)))

(defn run-scan
  "Main entry point for regex scanning"
  [{:keys [options arguments]}]
  (let [{:keys [all-files verbose no-lines]} options
        files (cond
                ;; --all-files flag
                all-files (get-all-files)
                ;; Default: require specific files
                ;; Arguments provided = specific files to scan
                (seq arguments) arguments

                :else (throw (ex-info
                              nil
                              {:mage/error (c/yellow "No files specified. Use -a to scan all files or specify files to scan.")
                               :babashka/exit 1})))

        ;; Filter out git-ignored files + whitelisted files
        ignored (ignored-files files)
        files (remove ignored files)
        
        _ (if (empty? files)
            (throw (ex-info
                    nil
                    {:mage/error (c/yellow "No files to scan")
                     :babshka/exit 0}))
            (println "Scanning" (count files) "files"))
        
        {:keys [scanned duration-ms total-files files-with-matches total-matches] :as full-info}
        (scan-files token-patterns files)
        info (dissoc full-info :scanned :duration-ms)]

    ;; Print results
    (doseq [{:keys [file matches error]} scanned]
      (when error
        (println (c/red "Error scanning " file ": " error)))
      (when (seq matches)
        (println (c/blue file))
        (when-not no-lines
          (doseq [{:keys [pattern-name line-number line-text]} matches]
            (println (c/white "  Line# " (c/bold line-number) " [" (c/yellow pattern-name) "]:" (c/green (str/trim line-text))))))))

    (println (c/green "Scan completed in:   " (format "%.0f" duration-ms) "ms"))
    (when verbose
      (println "--------------------")
      (println (c/yellow "Files scanned:      " total-files))
      (println (c/yellow "Files with matches: " files-with-matches))
      (println (c/yellow "Total matches:      " total-matches)))

    (when (> total-matches 0)
      (throw (ex-info nil
                      {:outcome info
                       :mage/error (str (c/red "Token Scanning found a potential secret.\n")
                                        (c/magenta "If you know your token is good add it to the token whitelist in mage/resources/token_scanner/token_whitelist.txt\n")
                                        (c/cyan (c/green "More info:") " https://github.com/metabase/metabase/blob/master/docs/developers-guide/security-token-scanner.md"))})))
    ;; Return results for potential further processing + testing
    info))
