(ns util
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
