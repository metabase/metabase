(ns indent
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [util :as u]))

(defn staged-files []
  (->> (u/shl! "git diff --name-status --cached -- \"*.clj\" \"*.cljc\" \"*.cljs\"")
       (filter #(re-find #"^[AM]" %))
       (map #(str/split % #"\t"))
       (mapv second)))

(defn indent
  "Indents the changed files in the previous commit."
  [m]
  (prn ["indent got:" m])
  (try
    (let [files-to-format (staged-files)]
      (if (seq files-to-format)
        (let [cmd (str "clojure -T:cljfmt fix '" (pr-str {:paths files-to-format}) "'")
              _ (prn ["running:" cmd])
              format-result (try (u/sh! cmd)
                                 (catch Exception e {:out (str "Error: " (.getMessage e))}))]
          (if (str/blank? format-result)
            (println "All staged clj, cljc, or cljs formatted correctly")
            (println format-result)))
        (println "No staged clj, cljc, or cljs files to format")))
    (catch Exception e
      (println "Error:" (.getMessage e))
      (System/exit 1))))

(defn help [m]
  (prn ["ih" (assoc m :fn :help)]))

(comment
  (u/sh! (str "clojure -T:cljfmt fix " (pr-str {:paths (staged-files)})))

  (println (str "clojure -T:cljfmt fix " (pr-str {:paths (staged-files)}))))
