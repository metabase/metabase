(ns build-drivers.util
  (:require [clojure.string :as str]
            [colorize.core :as colorize])
  (:import [java.io BufferedReader File InputStreamReader]
           [java.nio.file Files FileVisitOption Path Paths]
           java.util.function.BiPredicate
           org.apache.commons.io.FileUtils))

;;; ----------------------------------------------------- Output -----------------------------------------------------

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


;;; ------------------------------------------------- File Util Fns --------------------------------------------------

(defn file-exists? [^String filename]
  (when filename
    (.exists (File. filename))))

(defn assert-file-exists
  "If file with `filename` exists, return `filename` as is; otherwise, throw Exception."
  ^String [filename & [message]]
  (when-not (file-exists? filename)
    (throw (ex-info (format "File %s does not exist. %s" (pr-str filename) (or message "")) {:filename filename})))
  (str filename))

(defn create-directory-unless-exists! [^String dir]
  (when-not (exists? dir)
    (step (format "Creating directory %s..." dir)
      (.mkdirs (File. dir))))
  dir)

(defn delete-file!
  "Delete a file or directory if it exists."
  ([^String filename]
   (step (format "Deleting %s..." filename)
     (if (file-exists? filename)
       (let [file (File. filename)]
         (if (.isDirectory file)
           (FileUtils/deleteDirectory file)
           (.delete file))
         (safe-println (format "Deleted %s." filename)))
       (safe-println (format "Don't need to delete %s, file does not exist." filename)))
     (assert (not (file-exists? filename)))))

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

(defn- ->URI ^java.net.URI [filename]
  (java.net.URI. (str "file://" filename)))

(defn- ->Path ^Path [filename]
  (Paths/get (->URI filename)))

(defn find-files
  "Pure Java version of `find`. Recursively find files in `dir-path` that satisfy `pred`, which has the signature

    (pred filename-string) -> Boolean"
  [^String dir-path pred]
  (->> (Files/find (->Path dir-path)
                   Integer/MAX_VALUE
                   (reify BiPredicate
                     (test [_ path _]
                       (boolean (pred (str path)))))
                   ^FileVisitOption (make-array FileVisitOption 0))
       .toArray
       (map str)
       sort))


;;; ------------------------------------------------- Shell Commands -------------------------------------------------

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
  {:arglists '([cmd & args] [{:keys [env dir quiet?]} cmd & args])}
  [& args]
  (step (colorize/blue (str "$ " (str/join " " (map (comp pr-str str) (if (map? (first args))
                                                                        (rest args)
                                                                        args)))))
    (let [[opts & args]     (if (map? (first args))
                              args
                              (cons nil args))
          {:keys [env dir]} opts
          cmd-array         (into-array (map str args))
          env-array         (when env
                              (assert (map? env))
                              (into-array String (for [[k v] env]
                                                   (format "%s=%s" (name k) (str v)))))
          proc              (.exec (Runtime/getRuntime)
                                   ^"[Ljava.lang.String;" cmd-array
                                   ^"[Ljava.lang.String;" env-array
                                   ^File (when dir (File. ^String dir)))]
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
