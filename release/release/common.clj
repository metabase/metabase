(ns release.common
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.string :as str]
            [colorize.core :as colorize]
            [environ.core :as env])
  (:import [java.io BufferedReader File InputStreamReader]
           org.apache.commons.io.FileUtils))

(assert (str/ends-with? (env/env :user-dir) "/release")
        "Please run release.clj from the `release` directory e.g. `cd release; clojure -m release`")

(defn env-or-throw
  "Fetch an env var value or throw an Exception if it is unset."
  [k]
  (or (get env/env k)
      (throw (Exception. (format "%s is unset. Please set it and try again." (str/upper-case (str/replace (name k) #"-" "_")))))))

(def ^String root-directory
  "e.g. /Users/cam/metabase"
  (.getParent (File. (env/env :user-dir))))

(def ^String uberjar-path
  (str root-directory "/target/uberjar/metabase.jar"))

(defonce ^:private build-options
  (atom nil))

(defn version
  "Version tag we are currently building, e.g. `0.36.0`"
  []
  (or (:version @build-options)
      (throw (Exception. "Version is not set. Run :set-build-options to set it."))))

(defn set-version! [new-version]
  ;; strip off initial `v` if present
  (swap! build-options assoc :version (str/replace new-version #"^v" "")))

(defn branch
  "Branch we are building from, e.g. `release-0.36.x`"
  []
  (or (:branch @build-options)
      (throw (Exception. "Branch is not set. Run :set-build-options to set it."))))

(defn set-branch! [new-branch]
  (swap! build-options assoc :branch new-branch))

(defn edition
  "Either `:ce` (Community Edition) or `:ee` (Enterprise Edition)."
  []
  (or (:edition @build-options)
      (Exception. "Edition is not set. Run :set-build-options to set it.")))

(defn set-edition! [new-edition]
  (assert (#{:ce :ee} new-edition))
  (swap! build-options assoc :edition new-edition))

(defn pre-release-version?
  "Whether this version should be considered a prerelease. True if the version doesn't follow the usual
  `major.minor.patch[.build]` format."
  []
  (not (re-matches #"^\d+\.\d+\.\d+(?:\.\d+)?$" (version))))

(defn docker-repo []
  (case (edition)
    :ce "metabase/metabase"
    :ee "metabase/metabase-enterprise"))

(defn downloads-url []
  (case (edition)
    :ce "downloads.metabase.com"
    :ee "downloads.metabase.com/enterprise"))

(defn artifact-download-url
  "Public-facing URL where you can download the artifact after it has been uploaded."
  [filename]
  (format "https://%s/v%s/%s" (downloads-url) (version) filename))

(defn s3-artifact-url [filename]
  (format "s3://%s/v%s/%s" (downloads-url) (version) filename))

(defn website-repo []
  (case (edition)
    :ce "metabase/metabase.github.io"
    nil))

(defn heroku-buildpack-repo []
  (case (edition)
    :ce "metabase/metabase-buildpack"
    nil))

(defn version-info-url []
  (case (edition)
    :ce "static.metabase.com/version-info.json"
    nil))

(defn metabase-repo []
  (case (edition)
    :ce "metabase/metabase"
    :ee "metabase/metabase-enterprise"))

(defn docker-tag []
  (format "%s:v%s" (docker-repo) (version)))

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
  (step (colorize/blue (str "$ " (str/join " " (map (comp pr-str str) (if (map? (first args))
                                                                        (rest args)
                                                                        args)))))
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

(defn read-line-with-prompt
  "Prompt for and read a value from stdin. Accepts two options: `:default`, which is the default value to use if the
  user does not enter something else; and `:validator`, a one-arg function that should return an error message if the
  value is invalid, or `nil` if it is valid."
  [prompt & {:keys [default validator]}]
  (loop []
    (print (str prompt " "))
    (when default
      (printf "(default %s) " (pr-str default)))
    (flush)
    (let [line (or (not-empty (str/trim (read-line)))
                   default)]
      (newline)
      (flush)
      (cond
        (empty? line)
        (recur)

        validator
        (let [error (validator line)]
          (if error
            (do
              (println error)
              (recur))
            line))

        :else
        line))))

(defn slack-notify
  "Posts a message to the Slack a channel using `SLACK_WEBHOOK_URL`. If `NO_SLACK` is set, this is a no-op."
  ([format-string & args]
   (slack-notify (apply format format-string args)))

  ([msg]
   (when-not (env/env :no-slack)
     (let [slack-webhook-url (env-or-throw :slack-webhook-url)
           body              (json/generate-string {:text (str msg)})]
       (http/post slack-webhook-url {:headers {"Content-Type" "application/json"}
                                     :body    body})
       :ok))))
