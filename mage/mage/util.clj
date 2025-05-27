(ns mage.util
  (:require
   [babashka.fs :as fs]
   [babashka.tasks :refer [shell]]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]))

(set! *warn-on-reflection* true)

(def ^String project-root-directory
  "Root directory of the Metabase repo."
  (.. (java.io.File. (.toURI (io/resource "mage/util.clj"))) ; this file
      getParentFile ; /Users/me/metabase/bin/mage
      getParentFile ; /Users/me/metabase/bin
      getParentFile ; /Users/me/metabase
      getCanonicalPath))

(defn sh
  "Run a blocking shell command and return the output as a trimmed string.

  Will throw an exception if the command returns a non-zero exit code."
  [cmd]
  (->> (shell {:out :string :dir project-root-directory} cmd)
       :out
       str/trim-newline))

(defn shl
  "Run a shell command and return the output as a vector of lines."
  [cmd]
  (-> cmd sh str/split-lines vec))

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
               (str "Environemnt Variables" (when (not= ".*" match) (str " containing '" match "'")) " :")))
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
  (->> "bb tasks"
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
