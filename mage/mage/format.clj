(ns mage.format
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- ->mode [force-check?] (if force-check? "check" "fix"))

(defn files
  "Formats or checks a list of files."
  [{{force-check? :force-check} :options
    file-paths :arguments}]
  (let [mode (->mode force-check?)]
    (when-not (seq file-paths)
      (println (str "No files to " mode "."))
      (System/exit 0))
    (printf (c/green "%sing %s...\n") mode (str/join ", " file-paths))
    (flush)
    (let [cmd (str "clojure -T:cljfmt " mode " '" (pr-str {:paths file-paths}) "'")
          format-result (try (u/sh cmd)
                             (catch Exception e {:out (str "Error in cljfmt: " (.getMessage e))}))]
      (if (str/blank? format-result)
        (printf "%s %sed correctly" file-paths mode)
        (println format-result)))))

(defn staged
  "Formats or checks all staged clojure files with cljfmt."
  [{{force-check? :force-check} :options}]
  (try (let [file-paths (u/staged-files)]
         (if (seq file-paths)
           (files {:options {:force-check force-check?}
                   :arguments file-paths})
           (println (str "No staged clj, cljc, or cljs files to " (->mode force-check?) "."))))
       (catch Exception e
         (println "Error:" (.getMessage e))
         (System/exit 1))))

(defn all
  "Formats or checks of the usual clojure files with cljfmt."
  [{{force-check? :force-check} :options}]
  (let [mode (->mode force-check?)]
    (println (str mode "ing all clojure files, sit tight: this could take a minute..."))
    (u/sh (str "clojure -T:cljfmt " mode))))
