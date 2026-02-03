(ns mage.util
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [babashka.tasks :refer [shell]]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [puget.printer :as puget]
   [table.core :as table]))

(set! *warn-on-reflection* true)

(def ^String project-root-directory
  "Root directory of the Metabase repo."
  (.. (java.io.File. (.toURI (io/resource "mage/util.clj"))) ; this file
      getParentFile ; /Users/me/metabase/mage/src/mage
      getParentFile ; /Users/me/metabase/mage/src
      getParentFile ; /Users/me/metabase/mage
      getParentFile ; /Users/me/metabase
      getCanonicalPath))

(defn sh
  "Run a blocking shell command and return the output as a trimmed string.

  Will throw an exception if the command returns a non-zero exit code."
  [& cmd]
  (->> (apply shell {:out :string :dir project-root-directory} cmd)
       :out
       str/trim-newline))

(defn shl
  "Run a shell command and return the output as a vector of lines."
  [& cmd]
  (-> (apply sh cmd) str/split-lines vec))

(defn node
  "Run a Node.js command string and print the output as a trimmed string."
  [& cmd]
  (apply sh "node" "-p" cmd))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Git Stuff
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn staged-files
  "Returns git staged files as a vector of strings."
  []
  (->> (shl "git diff --name-status --cached -- \"*.clj\" \"*.cljc\" \"*.cljs\"")
       (filter #(re-find #"^[AM]" %))
       (map #(str/split % #"\t"))
       (mapv second)))

(defn env
  "Get environment variables"
  ([] (into {} (System/getenv)))
  ([env-var] (env env-var (fn [] (println "Warning:" (c/yellow env-var) "not found in env."))))
  ([env-var error-thunk] (or ((env) (name env-var)) (error-thunk))))

(defn print-env
  "Prints environment variables matching `match`, or all if no match is given."
  ([] (print-env ".*" (env)))
  ([match] (print-env match (env)))
  ([match env]
   (let [important-env (->> env
                            (filter (fn [[k _]] (re-find (re-pattern (str "(?i).*" match ".*")) k)))
                            (sort-by first))]
     (println (c/underline
               (str "Environment Variables" (when (not= ".*" match) (str " containing '" match "'")) " :")))
     (doseq [[setting value] important-env]
       (print (c/yellow setting))
       (print (c/white "="))
       (println (c/cyan value))))))

(defn debug
  "Prints out verbose info when MAGE_DEBUG is set"
  [& content]
  (when (env "MAGE_DEBUG" (constantly nil))
    (doseq [line (->> (str/join content) str/split-lines)]
      (println (c/cyan "MAGE_DEBUG>") line))))

(defn public-bb-tasks-list
  "Returns all public bb tasks as a vector of strings."
  []
  (->> (str project-root-directory "/bin/bb tasks")
       shl
       (drop 2)
       (map (comp first #(str/split % #"\s+")))
       vec))

(defn all-bb-tasks-list
  "Returns all (even private) bb tasks as a vector of strings."
  []
  (let [task-keys (-> project-root-directory
                      (str "/bb.edn")
                      slurp
                      edn/read-string
                      :tasks
                      keys)]
    (mapv str (remove #{:requires} task-keys))))

(defn updated-files
  "Sequence of filenames that have changes in Git relative to `diff-target`."
  ([] (updated-files "HEAD"))
  ([diff-target]
   (->> (shell {:out :string :dir project-root-directory}
               "git" "diff" "--name-only" diff-target)
        :out
        (str/split-lines)
        ;; filter out any files that have been deleted/moved
        (remove #{""})
        (filter (fn [filename]
                  (fs/exists? (str project-root-directory "/" filename)))))))

(defn updated-clojure-files
  "Sequence of filenames that have changes in Git relative to `diff-target`."
  ([] (updated-clojure-files "HEAD"))
  ([diff-target]
   (->> (shell {:out :string :dir project-root-directory}
               "git" "diff" "--name-only" diff-target
               "--" "*.clj" "*.cljc" "*.cljs" ":!/.clj-kondo" ":!/dev")
        :out
        (str/split-lines)
        ;; filter out any files that have been deleted/moved
        (remove #{""})
        (filter (fn [filename]
                  (fs/exists? (str project-root-directory "/" filename)))))))

(comment
  (count (updated-files "master"))
  (count (updated-files "master...")))

(defn with-throbber
  "Calls a function f and displays a throbber animation while waiting
   for it to complete. Returns the result of calling f."
  [message f]
  (let [frames ["⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏"]
        delay  100
        done?  (atom false)
        result (atom nil)
        err    (atom nil)]
    (future (try
              (loop [i 0]
                (when (not @done?)
                  (print (str "\r" (nth frames (mod i (count frames))) " " message))
                  (flush)
                  (Thread/sleep delay)
                  (recur (inc i))))
              (catch Exception e
                (reset! err e)))
            ;; Clear the throbber when done
            (print "\r")
            (flush))

    ;; Execute the function
    (try
      (let [res (f)]
        (reset! result res)
        res)
      (catch Exception e
        (reset! err e)
        (throw e))
      (finally
        (reset! done? true)))))

(defn pp
  "Pretty prints args in color using puget"
  [& xs]
  (doseq [x xs] (puget/cprint x)))

(defn pp-line
  "Prints args in color, on a single line using puget. Good for Returning 'read-string'-able values."
  [& xs]
  (doseq [x xs] (puget/cprint x {:width 10e30})))

(defn print-tasks [& _]
  (let [task+descriptions (->> "bb.edn"
                               (str project-root-directory "/")
                               slurp
                               edn/read-string
                               :tasks
                               (filter (fn [[task _v]] (symbol? task)))
                               (sort-by (fn [[task _task-data]]
                                          (let [task-name (name task)]
                                            (if (str/starts-with? task-name "-")
                                              (str "z" task-name)
                                              task-name))))
                               (map (fn [[task task-data]]
                                      {:task (name task)
                                       :description (:doc task-data)})))]
    (println "Available" (c/bold ((rand-nth [c/red c/blue c/green]) "Mage")) "Tasks:")
    (table/table task+descriptions :style :unicode)
    (println "For" (c/bold "more") "information on a task, run:")
    (println "  mage <task-name> -h")
    task+descriptions))

(def ^:dynamic *skip-warning* "Skips warnings for can-run?" false)

(defn can-run? [cmd]
  ;; Use "which" instead of "command -v" because "command" is a shell builtin
  ;; that doesn't exist as a binary on Linux (only macOS has /usr/bin/command)
  (try (boolean (sh "which" cmd))
       (catch Exception _
         (when-not *skip-warning*
           (println (c/red "MAGE checked if you can run " cmd ", but it is not installed. Consider installing it for a better experience.")))
         false)))

(defn- check-run!
  [cmd]
  (when-not (can-run? cmd)
    (throw
     (ex-info
      nil
      {:command cmd
       :mage/error (str "You don't have " (c/yellow cmd) " installed. Please install it to use this task.")
       :babashka/exit 1}))))

(declare exit)

(defn fzf-select!
  "Uses fzf to offer interactive selections.

   If the user doesn't have fzf installed, explains instructions
  
   See fzf --help for more info.
   Some useful fzf options:
    --multi - select multiple options
    --preview='cat {}'

  Returns stdout of fzf, if you use --multi str/split-lines it."
  [coll & [fzf-opts]]
  (try (check-run! "fzf")
       (catch Exception e
         (println "You don't have fzf installed.")
         (if (can-run? "brew")
           (do
             (println "Brew Detected: auto-installing it with brew...")
             (println "Running: " (c/green "brew install fzf"))
             (sh "brew install fzf"))
           (throw e))))
  (try
    (->> (shell
          {:out :string :in (str/join "\n" coll)}
          (str "fzf"
               (when (seq fzf-opts) " ")
               fzf-opts))
         :out
         str/trim)
    (catch clojure.lang.ExceptionInfo e
      (let [data (ex-data e)
            exit-code (or (:babashka/exit data)
                          (get-in data [:proc :exit]))]
        (if (= 130 exit-code)
          (exit (c/yellow "Cancelled.") 130)
          (throw e))))))

;; Timing functions, parallel to time function in metabase.util
(defn start-timer
  "Returns the current time in nanoseconds."
  []
  (System/nanoTime))

(defn since-ms
  "Called on the return value of start-timer, returns the elapsed time in milliseconds."
  [timer] (/ (- (System/nanoTime) timer) 1e6))

(defn exit
  "When invoked from a babashka namespace spawned from mage, exits with the given exit code.
  Will not crash your repl. Prefer this to System/exit!"
  ([exit-code]
   (throw (ex-info "" {:mage/quiet true
                       :babashka/exit exit-code})))
  ([message exit-code]
   (println message)
   (throw (ex-info "" {:mage/quiet true :babashka/exit exit-code}))))

(defn git-ignored-files
  "Returns a set of files that are ignored by git."
  [files]
  (println (c/yellow "Checking git ignore status for " (c/white (count files)) " files..."))
  (let [{:keys [exit]
         :as proc} (p/sh {:out :string
                          :err :string
                          :continue true
                          :dir project-root-directory
                          :in (str/join "\n" files)}
                         "git" "check-ignore" "--stdin")
        output (:out proc)]
    (when (= 128 exit)
      (throw (ex-info "git check-ignore has failed with an exceptional status code: maybe git is not initialized in this directory or no gitignore file found."
                      {:babashka/exit exit :git-error (:err proc)})))
    (->> output
         str/split-lines
         (remove str/blank?)
         (map str/trim)
         set)))
