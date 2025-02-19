(ns mage.util
  (:require
   [babashka.tasks :refer [shell]]
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
