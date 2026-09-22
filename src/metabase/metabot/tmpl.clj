(ns metabase.metabot.tmpl
  "Simple bag of functions for templating markdown-like strings"
  (:require
   [clojure.string :as str]))

(defn lines
  "Just join lines."
  [& elements]
  (->> elements
       flatten
       (remove nil?)
       (str/join "\n")))

(defn code
  "```{lang}\n{content}\n```"
  ([content] (code content nil))
  ([content lang]
   (when content
     (str "```" (or lang "") "\n" content "\n```\n"))))

(defn field
  "`{label}: {value}` or `{label}:\n{value}` if multiline value or skip if no value"
  [label value]
  (cond
    (nil? value)               nil
    (str/includes? value "\n") (str label ":\n" value)
    :else                      (str label ": " value "\n")))

(defn link
  "[{label}]({(join link)}); square brackets are stripped from the label — they
  break markdown link parsing (the label can't contain `]`)"
  [label & bits]
  (format "[%s](%s)" (str/replace (str label) #"[\[\]]" "") (apply str bits)))

(defn markdown-table
  "Render a sequence of maps as a markdown table.

  Arguments:
  - rows: A sequence of maps/vectors/a map with the data to render
  - column-mapping: Either a map of {key \"Header Name\"} or a vector of keys
                    If nil, uses all keys from first row with title-cased headers
  - opts: Optional map with:
    - :value-fn - (fn [key value] string) to format cell values.
                  Defaults to stringifying + escaping pipe characters.

  Example:
    (markdown-table
      [{:name \"foo\" :field_id \"c1\" :type \"string\"}
       {:name \"bar\" :field_id \"c2\" :type \"number\"}]
      {:name \"Field Name\" :field_id \"Field ID\" :type \"Type\"})

  Produces:
    | Field Name | Field ID | Type |
    | ---------- | -------- | ---- |
    | foo | c1 | string |
    | bar | c2 | number |"
  ([rows column-mapping]
   (markdown-table rows column-mapping nil))
  ([rows column-mapping {:keys [value-fn]}]
   (when (seq rows)
     (let [columns       (cond
                           (nil? column-mapping)    (keys (first rows))
                           (vector? column-mapping) column-mapping
                           (map? column-mapping)    (keys column-mapping))
           headers       (cond
                           (nil? column-mapping)    (map #(-> % name (str/replace "_" " ") str/capitalize) columns)
                           (vector? column-mapping) (map #(-> % name (str/replace "_" " ") str/capitalize) column-mapping)
                           (map? column-mapping)    (map #(get column-mapping %) columns))
           default-fn    (fn [_k v]
                           (if (nil? v)
                             ""
                             (str/replace (str v) "|" "\\|")))
           fmt           (or value-fn default-fn)
           mkline        #(str "| " (str/join " | " %) " |")
           header-row    (mkline headers)
           separator-row (mkline (map #(apply str (repeat (count %) "-")) headers))
           data-rows     (for [row rows]
                           (if (map? row)
                             (mkline (for [col columns] (fmt col (get row col))))
                             (mkline (map fmt columns row))))]
       (str/join "\n" (concat [header-row separator-row] data-rows))))))

(defn ellipsize
  "`s` (nil reads as \"\") cut to its first `max-chars` characters, with `marker` (default \"…\") appended when it
  was longer."
  ([s max-chars] (ellipsize s max-chars "…"))
  ([s max-chars marker]
   (let [s (str s)]
     (if (> (count s) max-chars)
       (str (subs s 0 max-chars) marker)
       s))))

(def default-max-output-chars
  "Default character cap for `truncate-output`; a JVM/context safety valve for LLM-facing tool output."
  100000)

(defn truncate-output
  "Cap `s` to `default-max-output-chars` characters, appending a truncation marker when it overflows. The tool
  `:output` string is the only channel the LLM sees, so this keeps a single huge result from blowing the
  context/JVM."
  [s]
  (ellipsize s default-max-output-chars "\n…[output truncated]"))
