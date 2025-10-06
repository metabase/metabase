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
      (throw (ex-info (str "No files to " mode "."
                           "\nPlease specify file paths as arguments.")
                      {:babashka/exit 0})))
    (printf (c/green "%sing %s...\n") mode (str/join ", " file-paths)) (flush)
    (let [cmd (str "clojure -T:cljfmt " mode " '" (pr-str {:paths file-paths}) "'")]
      (println "Running: " cmd)
      (try (u/sh cmd) (catch Exception _e nil)))))

(defn updated
  "Formats or checks all updated clojure files with cljfmt."
  [parsed]
  (let [target-branch (or (first (:arguments parsed)) "HEAD")
        updated-files (u/updated-files target-branch)]
    (println (str "Checking for updated files against " (c/green target-branch)))
    (if (seq updated-files)
      (files (assoc parsed :arguments updated-files))
      (throw (ex-info (str "No updated clj, cljc, or cljs files to check against " target-branch ".")
                      {:babashka/exit 0})))))

(defn staged
  "Formats or checks all staged clojure files with cljfmt."
  [{{force-check? :force-check} :options}]
  (try (let [file-paths (u/staged-files)]
         (u/debug "fp " file-paths)
         (if (seq file-paths)
           (files {:options {:force-check force-check?} :arguments file-paths})
           (println (str "No staged clj, cljc, or cljs files to " (->mode force-check?) "."))))
       (catch Exception e
         (throw (ex-info (str (c/red "Problem formatting staged files. Are they readable?") "\ncause:\n" (ex-message e))
                         {:babashka/exit 1})))))

(defn all
  "Formats or checks of the usual clojure files with cljfmt."
  [{{force-check? :force-check} :options}]
  (let [mode (->mode force-check?)]
    (println (str mode "ing all clojure files, sit tight: this could take a minute..."))
    (u/sh (str "clojure -T:cljfmt " mode))))
