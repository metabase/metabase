(ns macos-release.common
  (:require [clojure.string :as str]
            [colorize.core :as colorize]
            [environ.core :as env])
  (:import [java.io BufferedReader File InputStreamReader]
           org.apache.commons.io.FileUtils))

(def ^String macos-source-dir
  "e.g. /Users/cam/metabase/OSX"
  (env/env :user-dir))

(assert (str/ends-with? macos-source-dir "/OSX")
  "Please switch to the /OSX directory before running macos_release.clj")

(def ^String root-directory
  "e.g. /Users/cam/metabase"
  (.getParent (File. macos-source-dir)))

(def ^String artifacts-directory
  "e.g. /Users/cam/metabase/osx-artifacts"
  (str root-directory "/osx-artifacts"))

;;; ---------------------------------------------------- Util Fns ----------------------------------------------------

(defn announce
  "Like `println` + `format`, but outputs text in green. Use this for printing messages such as when starting build
  steps."
  [format-string & args]
  (locking println (println (colorize/green (apply format format-string args)))))

(defn exists? [^String filename]
  (when filename
    (.exists (File. filename))))

(defn assert-file-exists
  "If file with `filename` exists, return `filename` as is; otherwise, throw Exception."
  ^String [filename & [message]]
  (when-not (exists? filename)
    (throw (ex-info (format "File %s does not exist. %s" (pr-str filename) (or message "")) {:filename filename})))
  (str filename))

(defn create-directory-unless-exists! [dir]
  (when-not (exists? dir)
    (locking println (printf "Creating directory %s...\n" dir))
    (.mkdirs (File. dir)))
  dir)

(defn artifact
  "Return the full path of a file in the build artifacts directory."
  ^String [filename]
  (create-directory-unless-exists! artifacts-directory)
  (str artifacts-directory "/" filename))

(defn delete-file!
  "Delete a file or directory if it exists."
  ([^String filename]
   (announce "Deleting %s..." filename)
   (if (exists? filename)
     (let [file (File. filename)]
       (if (.isDirectory file)
         (FileUtils/deleteDirectory file)
         (.delete file))
       (locking println (printf "Deleted %s.\n" filename)))
     (locking println (printf "Don't need to delete %s, file does not exist.\n" filename)))
   (assert (not (exists? filename))))

  ([file & more]
   (dorun (map delete-file! (cons file more)))))

(defn copy-file! [source dest]
  (announce "Copying %s -> %s" (assert-file-exists source) dest)
  (let [source (File. source)
        dest   (File. dest)]
    (if (.isDirectory source)
      (FileUtils/copyDirectory source dest)
      (FileUtils/copyFile source dest)))
  (assert-file-exists dest))

(defn- read-lines [^java.io.BufferedReader reader quiet?]
  (loop [lines []]
    (if-let [line (.readLine reader)]
      (do
        (when-not quiet?
          (locking println (println line)))
        (recur (conj lines line)))
      lines)))

(defn- deref-with-timeout [dereffable timeout-ms]
  (let [result (deref dereffable timeout-ms ::timed-out)]
    (when (= result ::timed-out)
      (throw (ex-info (format "Timed out after %d ms." timeout-ms) {})))
    result))

(def ^:private command-timeout-ms (* 5 60 1000)) ; 5 minutes

(defn sh
  "Run a shell command. Like `clojure.java.shell/sh`, but prints output to stdout/stderr and returns results as a vector
  of lines."
  {:arglists '([cmd & args] [{:keys [dir quiet?]} cmd & args])}
  [& args]
  (println (colorize/blue (str "Running " (str/join " " (map (comp pr-str str) args)))))
  (let [[opts & args]        (if (map? (first args))
                               args
                               (cons nil args))
        {:keys [dir quiet?]} opts
        cmd-array            (into-array (map str args))
        proc                 (.exec (Runtime/getRuntime) ^"[Ljava.lang.String;" cmd-array nil ^File (when dir (File. dir)))]
    (with-open [out-reader (BufferedReader. (InputStreamReader. (.getInputStream proc)))
                err-reader (BufferedReader. (InputStreamReader. (.getErrorStream proc)))]
      (let [exit-code (future (.waitFor proc))
            out       (future (read-lines out-reader quiet?))
            err       (future (read-lines err-reader quiet?))]
        {:exit (deref-with-timeout exit-code command-timeout-ms)
         :out  (deref-with-timeout out command-timeout-ms)
         :err  (deref-with-timeout err command-timeout-ms)}))))

(defn non-zero-sh
  "Run a shell command, returning its output if it returns zero or throwning an Exception if it returns non-zero."
  {:arglists '([cmd & args] [{:keys [dir quiet?]} cmd & args])}
  [& args]
  (let [{:keys [exit out], :as response} (apply sh args)]
    (if (zero? exit)
      out
      (throw (ex-info (str/join "\n" out) response)))))

(defn- version* []
  (let [[out]       (non-zero-sh (assert-file-exists (str root-directory "/bin/version")))
        [_ version] (re-find #"^v([\d.]+)" out)]
    (when-not (seq version)
      (throw (ex-info "Error parsing version." {:out out})))
    version))

(def ^{:arglists '([])} version
  "Currently tagged Metabase version. e.g. `0.34.3`"
  (partial deref (delay (version*))))

(defn uploaded-artifact-url [artifact]
  (format "https://downloads.metabase.com/v%s/%s" (version) artifact))
