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
    (printf (c/green "%sing %s...\n") mode (str/join ", " file-paths)) (flush)
    (let [cmd (str "clojure -T:cljfmt " mode " '" (pr-str {:paths file-paths}) "'")]
      (println "Running: " cmd)
      (try (u/sh cmd) (catch Exception _e nil)))))

(defn updated
  "Formats or checks all updated clojure files with cljfmt."
  [parsed]
  (let [target-branch (or (first (:arguments parsed)) "HEAD")]
    (println (str "Checking for updated files against " (c/green target-branch)))
    (files (assoc parsed :arguments (u/updated-files target-branch)))))

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
                         {:mage/exit-code 1})))))

(defn all
  "Formats or checks of the usual clojure files with cljfmt."
  [{{force-check? :force-check} :options}]
  (let [mode (->mode force-check?)]
    (println (str mode "ing all clojure files, sit tight: this could take a minute..."))
    (u/sh (str "clojure -T:cljfmt " mode))))
