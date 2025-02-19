(ns mage.format
  (:require
   [clojure.string :as str]
   [mage.util :as u]))

(defn files [file-paths]
  (println "Formatting" file-paths "...")
  (let [cmd (str "clojure -T:cljfmt fix '" (pr-str {:paths file-paths}) "'")
        format-result (try (u/sh! cmd)
                           (catch Exception e {:out (str "Error: " (.getMessage e))}))]
    (if (str/blank? format-result)
      (println file-paths "formatted correctly")
      (println format-result))))

(defn staged
  "Formats all staged clojure files with cljfmt."
  []
  (try (let [files-to-format (u/staged-files)]
         (if (seq files-to-format)
           (files files-to-format)
           (println "No staged clj, cljc, or cljs files to format.")))
       (catch Exception e
         (println "Error:" (.getMessage e))
         (System/exit 1))))

(defn all []
  (println "Formatting all clojure files, sit tight: this could take a minute...")
  (u/sh! "clojure -T:cljfmt fix"))

(comment
  (u/sh! (str "clojure -T:cljfmt fix " (pr-str {:paths (staged-files)})))

  (println (str "clojure -T:cljfmt fix " (pr-str {:paths (staged-files)}))))
