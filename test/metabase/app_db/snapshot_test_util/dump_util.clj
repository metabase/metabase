(ns metabase.app-db.snapshot-test-util.dump-util
  "What the dialects dumped by a command-line tool have in common: folding its line-oriented output back into whole
  statements."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

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
