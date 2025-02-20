(ns mage.util
  (:require
   [babashka.tasks :refer [shell]]
   [bask.colors :as c]
   [clojure.string :as str]))

(defn sh!
  "Run a shell command and return the output as a trimmed string."
  [cmd]
  (str/trim-newline (:out (shell {:out :string} cmd))))

(defn shl!
  "Run a shell command and return the output as a vector of lines."
  [cmd]
  (-> cmd sh! str/split-lines vec))

(defn check-help! [{:keys [opts] :as m} help-thunk]
  (when (or (:h opts) (:help opts))
    (help-thunk)
    (System/exit 0)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Git Stuff
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn staged-files []
  (->> (shl! "git diff --name-status --cached -- \"*.clj\" \"*.cljc\" \"*.cljs\"")
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
