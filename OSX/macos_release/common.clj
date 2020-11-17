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

(def ^:dynamic *steps* [])

(def ^:private step-indent (str/join (repeat 2 \space)))

(defn- steps-indent []
  (str/join (repeat (count *steps*) step-indent)))

(defn safe-println [& args]
  (locking println
    (print (steps-indent))
    (apply println args)))

(defn announce
  "Like `println` + `format`, but outputs text in green. Use this for printing messages such as when starting build
  steps."
  ([s]
   (safe-println (colorize/magenta s)))

  ([format-string & args]
   (announce (apply format (str format-string) args))))

(defn do-step [step thunk]
  (safe-println (colorize/green (str step)))
  (binding [*steps* (conj *steps* step)]
    (try
      (thunk)
      (catch Throwable e
        (throw (ex-info (str step) {} e))))))

(defmacro step {:style/indent 1} [step & body]
  `(do-step ~step (fn [] ~@body)))

(defn exists? [^String filename]
  (when filename
    (.exists (File. filename))))

(defn assert-file-exists
  "If file with `filename` exists, return `filename` as is; otherwise, throw Exception."
  ^String [filename & [message]]
  (when-not (exists? filename)
    (throw (ex-info (format "File %s does not exist. %s" (pr-str filename) (or message "")) {:filename filename})))
  (str filename))

(defn create-directory-unless-exists! [^String dir]
  (when-not (exists? dir)
    (step (format "Creating directory %s..." dir)
      (.mkdirs (File. dir))))
  dir)

(defn artifact
  "Return the full path of a file in the build artifacts directory."
  ^String [filename]
  (create-directory-unless-exists! artifacts-directory)
  (str artifacts-directory "/" filename))

(defn delete-file!
  "Delete a file or directory if it exists."
  ([^String filename]
   (step (format "Deleting %s..." filename)
     (if (exists? filename)
       (let [file (File. filename)]
         (if (.isDirectory file)
           (FileUtils/deleteDirectory file)
           (.delete file))
         (safe-println (format "Deleted %s." filename)))
       (safe-println (format "Don't need to delete %s, file does not exist." filename)))
     (assert (not (exists? filename)))))

  ([file & more]
   (dorun (map delete-file! (cons file more)))))

(declare sh)

(defn copy-file! [^String source ^String dest]
  (let [source-file (File. (assert-file-exists source))
        dest-file   (File. dest)]
    ;; Use native `cp` rather than FileUtils or the like because codesigning is broken when you use those because they
    ;; don't preserve symlinks or something like that.
    (if (.isDirectory source-file)
      (step (format "Copying directory %s -> %s" source dest)
        (sh "cp" "-R" source dest))
      (step (format "Copying file %s -> %s" source dest)
        (sh "cp" source dest))))
  (assert-file-exists dest))

(defn- read-lines [^java.io.BufferedReader reader {:keys [quiet? err?]}]
  (loop [lines []]
    (if-let [line (.readLine reader)]
      (do
        (when-not quiet?
          (safe-println (if err? (colorize/red line) line)))
        (recur (conj lines line)))
      lines)))

(defn- deref-with-timeout [dereffable timeout-ms]
  (let [result (deref dereffable timeout-ms ::timed-out)]
    (when (= result ::timed-out)
      (throw (ex-info (format "Timed out after %d ms." timeout-ms) {})))
    result))

(def ^:private command-timeout-ms (* 15 60 1000)) ; 15 minutes

(defn sh*
  "Run a shell command. Like `clojure.java.shell/sh`, but prints output to stdout/stderr and returns results as a vector
  of lines."
  {:arglists '([cmd & args] [{:keys [dir quiet?]} cmd & args])}
  [& args]
  (step (colorize/blue (str "$ " (str/join " " (map (comp pr-str str) args))))
    (let [[opts & args] (if (map? (first args))
                          args
                          (cons nil args))
          {:keys [dir]} opts
          cmd-array     (into-array (map str args))
          proc          (.exec (Runtime/getRuntime) ^"[Ljava.lang.String;" cmd-array nil ^File (when dir (File. ^String dir)))]
      (with-open [out-reader (BufferedReader. (InputStreamReader. (.getInputStream proc)))
                  err-reader (BufferedReader. (InputStreamReader. (.getErrorStream proc)))]
        (let [exit-code (future (.waitFor proc))
              out       (future (read-lines out-reader opts))
              err       (future (read-lines err-reader (assoc opts :err? true)))]
          {:exit (deref-with-timeout exit-code command-timeout-ms)
           :out  (deref-with-timeout out command-timeout-ms)
           :err  (deref-with-timeout err command-timeout-ms)})))))

(defn sh
  "Run a shell command, returning its output if it returns zero or throwning an Exception if it returns non-zero."
  {:arglists '([cmd & args] [{:keys [dir quiet?]} cmd & args])}
  [& args]
  (let [{:keys [exit out err], :as response} (apply sh* args)]
    (if (zero? exit)
      (concat out err)
      (throw (ex-info (str/join "\n" (concat out err)) response)))))

(defn- version* []
  (let [[out]       (sh (assert-file-exists (str root-directory "/bin/version")))
        [_ version] (re-find #"^v([\d.]+)" out)]
    (when-not (seq version)
      (throw (ex-info "Error parsing version." {:out out})))
    version))

(def ^{:arglists '([])} version
  "Currently tagged Metabase version. e.g. `0.34.3`"
  (partial deref (delay (version*))))

(defn uploaded-artifact-url [artifact]
  (format "https://downloads.metabase.com/v%s/%s" (version) artifact))
