(ns mage.format
  (:require
   [cljfmt.report :as report]
   [cljfmt.tool]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- bb-not-implemented?
  "Returns true if the exception is the babashka cljfmt 'not implemented' error."
  [e]
  (some-> (ex-message e)
          (str/includes? "Not implemented in the babashka version of cljfmt yet")))

(defn- check-results
  "Extract incorrectly formatted file paths from cljfmt check results.
  In babashka, incorrectly formatted files end up in :errored-files because
  diff computation is not implemented. We treat those as 'incorrect' rather
  than 'errored'."
  [result]
  (let [incorrect   (keys (get-in result [:results :incorrect-files]))
        errored     (get-in result [:results :errored-files])
        bb-failures (keep (fn [[path {:keys [exception]}]]
                            (when (bb-not-implemented? exception) path))
                          errored)
        real-errors (keep (fn [[path {:keys [exception]}]]
                            (when (and exception (not (bb-not-implemented? exception)))
                              [path exception]))
                          errored)]
    {:incorrect (concat incorrect bb-failures)
     :errors    real-errors}))

(defn- report-check!
  "Run cljfmt check using the clojure reporter (no System/exit), then print
  which files are incorrectly formatted."
  [opts]
  (let [result                    (cljfmt.tool/check (assoc opts :report report/clojure))
        {:keys [incorrect errors]} (check-results result)]
    (doseq [[path exception] errors]
      (binding [*out* *err*]
        (println "Failed to format file:" path)
        (println (ex-message exception))))
    (if (seq incorrect)
      (do (binding [*out* *err*]
            (println (c/yellow (str (count incorrect) " file(s) formatted incorrectly:")))
            (doseq [path (sort incorrect)]
              (println (str "  " path)))
            (println (str "\nRun " (c/green "./bin/mage cljfmt-files <files>") " to fix.")))
          (throw (ex-info "" {:mage/quiet true :babashka/exit 1})))
      (when-not (seq errors)
        (binding [*out* *err*]
          (println "All source files formatted correctly"))))))

(defn files
  "Formats or checks a list of files."
  [{{force-check? :force-check} :options
    file-paths :arguments}]
  (when-not (seq file-paths)
    (throw (ex-info (str "No files to format."
                         "\nPlease specify file paths as arguments.")
                    {:babashka/exit 0})))
  (if force-check?
    (do (printf (c/green "Checking %s...\n") (str/join ", " file-paths))
        (flush)
        (report-check! {:paths file-paths}))
    (do (printf (c/green "Fixing %s...\n") (str/join ", " file-paths))
        (flush)
        (cljfmt.tool/fix {:paths file-paths}))))

(defn updated
  "Formats or checks all updated clojure files with cljfmt."
  [parsed]
  (let [target-branch (or (first (:arguments parsed)) "HEAD")
        updated-files (u/updated-clojure-files target-branch)]
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
           (println (str "No staged clj, cljc, or cljs files to "
                         (if force-check? "check" "fix") "."))))
       (catch Exception e
         (throw (ex-info (str (c/red "Problem formatting staged files. Are they readable?") "\ncause:\n" (ex-message e))
                         {:babashka/exit 1})))))

(defn all
  "Formats or checks of the usual clojure files with cljfmt."
  [{{force-check? :force-check} :options}]
  (if force-check?
    (do (println "Running check on all clojure files, sit tight: this could take a minute...")
        (report-check! {}))
    (do (println "Running fix on all clojure files, sit tight: this could take a minute...")
        (cljfmt.tool/fix {}))))
