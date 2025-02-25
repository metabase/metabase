(ns mage.util
  (:require
   [babashka.tasks :refer [shell]]
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
  "Run a shell command and return the output as a trimmed string."
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
  ([env-var] (env env-var (fn [] (println "Warning: cannot find " (c/red env-var) " in env."))))
  ([env-var error-thunk] (or ((env) (name env-var)) (error-thunk))))

(defn print-env
  "Prints environment variables matching `match`"
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
  "Prints out verbose info when "
  [& content]
  (when (env "MAGE_DEBUG" (constantly nil))
    (doseq [line (->> (str/join content) str/split-lines)]
      (println (c/cyan "MAGE_DEBUG>") line))))
