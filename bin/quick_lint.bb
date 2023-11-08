#!/usr/bin/env bb
(ns quick-lint
  (:require [babashka.tasks :refer [shell]]
            [clojure.string :as str]))

(defn modified-files []
      (->> (str/split-lines (:out (shell {:out :string} "git diff --name-only --cached -- \"*.clj\" \"*.cljc\" \"*.cljs\"")))
           (filter (comp #{"bin" "src" "test"}
                         first
                         #(str/split % (re-pattern java.io.File/separator))))))

(defn -main [& args]
      (if-let [changes (->> (modified-files)
                            (filter (fn [f] (or
                                              (str/ends-with? f "clj")
                                              (str/ends-with? f "cljc")
                                              (str/ends-with? f "cljs")
                                              (str/ends-with? f "bb"))))
                            not-empty)]
              (do
                (println "Linting:" (str/join ", " changes))
                (let [{:keys [exit] :as res} (shell (str/join " "
                                                              (into ["clj-kondo" "--config"
                                                                     "./.clj-kondo/config.edn" "--config-dir"
                                                                     "./.clj-kondo" "--parallel"
                                                                     "--lint"] changes)))]
                     (when (not= 0 exit)
                           (prn res))))
              (println "no changes to lint.")))

(when (= *file* (System/getProperty "babashka.file"))
      (-main))
