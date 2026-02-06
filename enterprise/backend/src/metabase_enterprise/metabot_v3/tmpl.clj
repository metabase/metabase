(ns metabase-enterprise.metabot-v3.tmpl
  "Simple bag of functions for templating markdown-like strings"
  (:require
   [clojure.string :as str]))

(defn md
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
  "[{label}]({(join link)})"
  [label & bits]
  (format "[%s](%s)" label (apply str bits)))

(defn render-markdown-table
  "Render a sequence of maps or objects as a markdown table.

  Arguments:
  - rows: A sequence of maps with the data to render
  - column-mapping: Either a map of {key \"Header Name\"} or a vector of keys
                    If nil, uses all keys from first row with title-cased headers

  Returns a markdown table string, or \"(No data to display)\" if empty.

  Example:
    (render-markdown-table
      [{:name \"foo\" :field_id \"c1\" :type \"string\"}
       {:name \"bar\" :field_id \"c2\" :type \"number\"}]
      {:name \"Field Name\" :field_id \"Field ID\" :type \"Type\"})

  Produces:
    | Field Name | Field ID | Type |
    | ---------- | -------- | ---- |
    | foo | c1 | string |
    | bar | c2 | number |"
  [rows column-mapping]
  (when (seq rows)
    (let [ ;; Determine columns and headers
          columns       (cond
                          (nil? column-mapping)    (keys (first rows))
                          (vector? column-mapping) column-mapping
                          (map? column-mapping)    (keys column-mapping))
          headers       (cond
                          (nil? column-mapping)    (map #(-> % name (str/replace "_" " ") str/capitalize) columns)
                          (vector? column-mapping) (map #(-> % name (str/replace "_" " ") str/capitalize) column-mapping)
                          (map? column-mapping)    (map #(get column-mapping %) columns))
          ;; Escape pipe characters in cell values
          escape-cell   (fn [value]
                          (if (nil? value)
                            ""
                            (str/replace (str value) "|" "\\|")))
          mkline        #(str "| " (str/join " | " %) " |")
          header-row    (mkline headers)
          separator-row (mkline (map #(apply str (repeat (count %) "-")) headers))
          data-rows     (for [row rows]
                          (mkline (for [col columns] (escape-cell (get row col)))))]
      (str/join "\n" (concat [header-row separator-row] data-rows)))))
