(ns mage.escherize.fix-whitespace
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.util.concurrent Callable Executors TimeUnit]))

(set! *warn-on-reflection* true)

(defn- clean-whitespace-lines
  "Remove lines that contain only whitespace characters"
  [file-path]
  (try
    (let [original-lines (str/split-lines (slurp file-path))
          cleaned-lines (map #(if (re-matches #"^\s*$" %) "" %) original-lines)
          changes-made? (not= original-lines cleaned-lines)]
      (when changes-made?
        (spit file-path (str/join "\n" cleaned-lines)))
      {:file file-path
       :changed changes-made?
       :error nil})
    (catch Exception e
      {:file file-path
       :changed false
       :error (str e)})))

(defn- find-files-from-glob
  "Find files matching the glob pattern"
  [glob-pattern]
  (->> (fs/glob u/project-root-directory glob-pattern)
       (filter fs/regular-file?)
       (map str)
       distinct))

(defn- clamp "Clamp n to the range [lo, hi]." [n lo hi] (max lo (min hi n)))
(def ^:private pool-size (clamp (* 2 (.availableProcessors (Runtime/getRuntime))) 4 32))

(defn- process-files
  "Process all files and clean whitespace-only lines using thread pool"
  [files]
  (let [_ (u/debug (c/yellow "Using thread pool size: " pool-size))
        executor (Executors/newFixedThreadPool pool-size)]
    (try
      (let [callables (mapv (fn [f] #(clean-whitespace-lines f)) files)
            futures (.invokeAll executor callables)
            results (mapv deref futures)
            changed-files (filter :changed results)
            error-files (filter :error results)]

        ;; Report errors
        (doseq [{:keys [file error]} error-files]
          (println (c/red "Error processing " file ": " error)))

        ;; Report changes
        (doseq [{:keys [file]} changed-files]
          (println (c/green "Cleaned: " file)))

        {:total-files (count files)
         :changed-files (count changed-files)
         :error-files (count error-files)})
      (finally
        (.shutdown executor)
        (.awaitTermination executor 10 TimeUnit/SECONDS)))))

(defn run-clean
  "Main entry point for whitespace cleaning"
  [{:keys [arguments]}]
  (when (empty? arguments)
    (throw (ex-info
            nil
            {:mage/error (c/yellow "Please specify a glob pattern, e.g.: **/*.clj")
             :babashka/exit 1})))

  (let [start-time (System/nanoTime)
        glob-pattern (first arguments)
        files (find-files-from-glob glob-pattern)
        _ (println "Found" (c/yellow (count files)) "files matching pattern:" (c/cyan glob-pattern))
        {:keys [total-files changed-files error-files]} (process-files files)
        duration-ms (/ (- (System/nanoTime) start-time) 1e6)]

    (println "Completed in:" (format "%.0f" duration-ms) "ms")
    (println "Files processed:" (c/yellow total-files))
    (println "Files changed:  " ((if (zero? changed-files) c/green c/yellow) changed-files))
    (when (> error-files 0)
      (println "Files with errors:" (c/red error-files)))

    (if (zero? error-files)
      (println (c/green "OK: Whitespace cleaning completed successfully."))
      (throw (ex-info nil
                      {:mage/error (str (c/red "Errors occurred during processing."))
                       :babashka/exit 1})))))

;; Usage examples:
;; (run-clean {:arguments ["**/*.clj"]})      ; Clean all .clj files
;; (run-clean {:arguments ["src/**/*.cljs"]}) ; Clean .cljs files in src/
;; (run-clean {:arguments ["**/*.{clj,cljs,cljc}"]}) ; Clean all Clojure files
