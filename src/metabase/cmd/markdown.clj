(ns metabase.cmd.markdown
  "Markdown primitives shared by the documentation generators in [[metabase.cmd]].

  Everything here is a pure string function: the generators read their own source of truth — the settings registry,
  the LLM provider registry, the CLI command vars — and lean on these to render it. Resource IO lives in
  [[metabase.cmd.common]] instead."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn code
  "`s` as inline code."
  [s]
  (str "`" s "`"))

(defn bold
  "`s` in bold."
  [s]
  (str "**" s "**"))

(defn link
  "`text` as a link to `url`."
  [text url]
  (str "[" text "](" url ")"))

(defn heading
  "`s` as a level-`n` heading. Callers that want a backticked heading compose the two: `(heading 3 (code s))`."
  [n s]
  (str (str/join (repeat n "#")) " " s))

(defn blockquote
  "`s` as a blockquote. Every line is prefixed, so a quote that runs to several lines stays one quote rather than
  breaking out into body text after the first."
  [s]
  (str/join "\n" (map #(str "> " %) (str/split-lines (str s)))))

(defn thousands
  "`1000000` -> `\"1,000,000\"`."
  [n]
  ;; not `format`, whose grouping separator follows the default locale and so would differ between a laptop and CI
  (str/replace (str n) #"(\d)(?=(\d{3})+$)" "$1,"))

(defn sentence
  "`s` as a sentence: forced out of i18n and terminated with a period. Nil when there is nothing to say, so a field
  whose text is blank contributes no stray `.` to its bullet.

  Knows about the endings docs prose runs into: a trailing `:` reads as a dangling lead-in once the text stands on
  its own, so it becomes a period, and a fenced code block is left exactly as it is."
  [s]
  (let [text (str s)]
    (cond
      (str/blank? text)           nil
      (#{\. \? \!} (last text))   text
      (str/ends-with? text "```") text
      (str/ends-with? text ":")   (str (subs text 0 (dec (count text))) ".")
      :else                       (str text "."))))

(defn- parts
  "`xs` stringified and trimmed, with the empties dropped — a nil `:help` leaves no gap where it was, and a resource
  carrying its own trailing newline opens no extra blank line."
  [xs]
  (into [] (comp (map #(str/trim (str %))) (remove str/blank?)) xs))

(defn sentences
  "Join the non-blank parts into one run of prose, a space between them."
  [xs]
  (str/join " " (parts xs)))

(defn paragraphs
  "Join the non-blank parts with blank lines between them."
  [xs]
  (str/join "\n\n" (parts xs)))

(defn bullets
  "Join the non-blank items as a Markdown list."
  [xs]
  (str/join "\n" (map #(str "- " %) (parts xs))))

(defn document
  "`xs` as a finished page: joined as [[paragraphs]] and terminated with exactly one newline."
  [xs]
  (str (paragraphs xs) "\n"))

(defn labeled-block
  "A `label` line, then `body` beneath it — `Options:` over its list, `Credentials:` over its bullets."
  [label body]
  (paragraphs [label body]))

(defn table
  "A Markdown table. `rows` is a sequence of already-rendered cell vectors."
  [headers rows]
  ;; columns are padded to a common width: the rendered page is what reviewers read in a PR diff, and a ragged table
  ;; is hard to scan there even though it renders identically
  (let [widths    (apply mapv (fn [& cells] (apply max (map count cells))) headers rows)
        row->line (fn [cells]
                    (str "| " (str/join " | " (map #(format (str "%-" %2 "s") %1) cells widths)) " |"))]
    (str/join "\n"
              ;; the separator is just another row — its dashes are already exactly column width, so it pads to itself
              (list* (row->line headers)
                     (row->line (map #(str/join (repeat % "-")) widths))
                     (map row->line rows)))))
