(ns mage.format
  (:require
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn files
  "Formats or checks a list of files."
  [{:keys [mode]} file-paths]
  (println mode "ing" file-paths "...")
  (let [cmd (str "clojure -T:cljfmt " mode " '" (pr-str {:paths file-paths}) "'")
        format-result (try (u/sh cmd)
                           (catch Exception e {:out (str "Error in cljfmt: " (.getMessage e))}))]
    (if (str/blank? format-result)
      (println file-paths mode "ed correctly")
      (println format-result))))

(defn staged
  "Formats or checks all staged clojure files with cljfmt."
  [{:keys [mode]}]
  (try (let [file-paths (u/staged-files)]
         (if (seq file-paths)
           (files {:check mode} file-paths)
           (println (str "No staged clj, cljc, or cljs files to " mode "."))))
       (catch Exception e
         (println "Error:" (.getMessage e))
         (System/exit 1))))

(defn all
  "Formats or checks of the usual clojure files with cljfmt."
  [{:keys [mode]}]
  (println (str mode "ing all clojure files, sit tight: this could take a minute..."))
  (u/sh (str "clojure -T:cljfmt " mode)))

(comment

  (u/sh (str "clojure -T:cljfmt fix " (pr-str {:paths (staged-files)})))

  (println (str "clojure -T:cljfmt fix " (pr-str {:paths (staged-files)}))))
