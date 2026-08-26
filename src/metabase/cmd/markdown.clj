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
  (str (apply str (repeat n "#")) " " s))

(defn blockquote
  "`s` as a blockquote. Every line is prefixed, so a quote that runs to several lines stays one quote rather than
  breaking out into body text after the first."
  [s]
  (str/join "\n" (map #(str "> " %) (str/split-lines (str s)))))

(defn- add-period
  "Terminate `s` with a period, unless it already terminates itself. Knows about the endings docs prose runs into: a
  trailing `:` reads as a dangling lead-in once the text stands on its own, so it becomes a period, and a fenced code
  block is left exactly as it is."
  [s]
  (let [text (str s)]
    (cond
      (str/blank? text) text
      (#{\. \? \!} (last text)) text
      (str/ends-with? text "```") text
      (str/ends-with? text ":") (str (subs text 0 (dec (count text))) ".")
      :else (str text "."))))

(defn sentence
  "`s` as a sentence: forced out of i18n and terminated with a period. Nil when there is nothing to say, so a field
  whose text is blank contributes no stray `.` to its bullet."
  [s]
  (let [s (str s)]
    (when-not (str/blank? s)
      (add-period s))))

(defn sentences
  "Join the non-blank parts into one run of prose, a space between them."
  [parts]
  (str/join " " (remove str/blank? parts)))

(defn paragraphs
  "Join the non-blank parts with blank lines between them."
  [parts]
  (str/join "\n\n" (remove str/blank? parts)))

(defn labeled-block
  "A `label` line, then `body` beneath it — `Options:` over its list, `Credentials:` over its bullets."
  [label body]
  (paragraphs [label body]))

(defn bullets
  "Join the non-blank items as a Markdown list."
  [items]
  (str/join "\n" (map #(str "- " %) (remove str/blank? items))))

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
                     (row->line (map #(apply str (repeat % "-")) widths))
                     (map row->line rows)))))
