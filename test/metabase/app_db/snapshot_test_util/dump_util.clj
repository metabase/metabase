(ns metabase.app-db.snapshot-test-util.dump-util
  "What the dialects that shell out to a command-line dump tool have in common: running it, and folding its
  line-oriented output back into whole statements."
  (:require
   [clojure.java.shell :as shell]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private client-host-alias
  "Hostname a containerized dump client uses to reach the machine publishing the server's port. Its own `localhost` is
  the throwaway client container, so [[client-command]] maps this name to the host gateway."
  "host.docker.internal")

(defn client-host
  "The host to hand a dump client, for a server the test config reaches at `host`."
  [host]
  (if (contains? #{"localhost" "127.0.0.1"} (str host)) client-host-alias (str host)))

(defn client-command
  "argv that runs `tool` out of `image`, a throwaway container of a pinned client image.

  The clients are taken from images rather than from PATH because a snapshot records which client dumped it: they
  disagree about how to render the very same data -- one MariaDB release writes a bit column as `0x00` where another
  writes `'\\0'` and MySQL's writes `_binary '\\0'` -- and a client older than the server refuses to dump at all.
  Pinning the image is what makes a regeneration on a developer's machine produce the file CI regenerates."
  [image tool]
  ["docker" "run" "--rm" "--add-host" (str client-host-alias ":host-gateway") image tool])

(defn sh!
  "Run a dump command, returning its stdout. Throws with the command and stderr if it exits non-zero."
  [& args]
  (let [{:keys [exit out err]} (apply shell/sh args)]
    (when-not (zero? exit)
      (throw (ex-info "Dump command failed" {:command args, :exit exit, :err err})))
    out))

(defn- literals-closed?
  "Whether `text` has no unterminated string literal. Quotes escaped either way a dump tool may write them -- doubled
  (`''`, Postgres) or backslashed (`\\'`, MySQL) -- are removed before counting, backslash pairs first so that a
  trailing literal backslash is not mistaken for an escape."
  [text]
  (-> text
      (str/replace "\\\\" "")
      (str/replace "\\'" "")
      (str/replace "''" "")
      (->> (re-seq #"'") count even?)))

(defn lines->statements
  "Fold the line-oriented output of a dump tool into whole statements. A statement ends on a line whose trimmed text
  ends in `;` and that closes every string literal it opened."
  [lines]
  (loop [[line & more] lines, current [], acc []]
    (cond
      (nil? line)
      (cond-> acc (seq current) (conj (str/join "\n" current)))

      ;; comments, client directives and session settings are dump-tool noise, not schema
      (and (empty? current)
           (or (str/blank? line)
               (re-matches #"^\s*(--|/\*!|\\).*" line)
               (re-matches #"(?i)^\s*SET\s+.*" line)
               (re-matches #"(?i)^\s*SELECT pg_catalog\.set_config.*" line)))
      (recur more current acc)

      :else
      (let [current (conj current line)
            text    (str/join "\n" current)]
        (if (and (literals-closed? text) (str/ends-with? (str/trimr line) ";"))
          (recur more [] (conj acc (str/replace text #";\s*$" "")))
          (recur more current acc))))))
