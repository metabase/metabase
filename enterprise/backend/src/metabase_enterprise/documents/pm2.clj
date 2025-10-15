(ns metabase-enterprise.documents.pm2
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]))

;; ============================================================================
;; ProseMirror to Markdown Conversion
;; ============================================================================

;; not needed prob
(defn escape-markdown
  "Escape special Markdown characters in text"
  [text]
  (-> text
      ;; NB WATCH FOR THIS
      (str/replace #"([\\`*_{}][()#+\-.!|])" "\\\\$1")))

(defmulti pm-node->md
  "Convert a ProseMirror node to Markdown string"
  :type)

(defmethod pm-node->md "doc" [{:keys [content]}]
  (str/join "\n\n" (map pm-node->md content)))

(defmethod pm-node->md "paragraph" [{:keys [content]}]
  (if content
    (str/join "" (map pm-node->md content))
    ""))

(defmethod pm-node->md "text" [{:keys [text marks]}]
  (reduce
   (fn [txt mark]
     (case (:type mark)
       "strong" (str "**" txt "**")
       "em" (str "*" txt "*")
       "code" (str "`" txt "`")
       "link" (str "[" txt "](" (get-in mark [:attrs :href]) ")")
       txt))
   text
   (reverse (or marks []))))

(defmethod pm-node->md "heading" [{:keys [attrs content]}]
  (let [level (get attrs :level 1)
        heading-marks (str/join "" (repeat level "#"))]
    (str heading-marks " " (str/join "" (map pm-node->md content)))))

(defmethod pm-node->md "code_block" [{:keys [content]}]
  (let [code-text (str/join "" (map :text content))]
    (str "```\n" code-text "\n```")))

(defmethod pm-node->md "blockquote" [{:keys [content]}]
  (let [inner (str/join "\n\n" (map pm-node->md content))
        lines (str/split-lines inner)]
    (str/join "\n" (map #(str "> " %) lines))))

(defmethod pm-node->md "bulletList" [{:keys [content]}]
  (str/join "\n" (map pm-node->md content)))

(defmethod pm-node->md "ordered_list" [{:keys [content attrs]}]
  (let [start (get attrs :order 1)]
    (str/join "\n"
              (map-indexed
               (fn [idx item]
                 (str/replace (pm-node->md item)
                              #"^- "
                              (str (+ start idx) ". ")))
               content))))

(defmethod pm-node->md "listItem" [{:keys [content]}]
  (let [first-para (first content)
        rest-content (rest content)
        first-line (pm-node->md first-para)
        rest-lines (when (seq rest-content)
                     (str/join "\n\n" (map pm-node->md rest-content)))]
    (str "- " first-line
         (when rest-lines (str "\n  " (str/replace rest-lines #"\n" "\n  "))))))

(defmethod pm-node->md "hard_break" [_]
  "  \n")

(defmethod pm-node->md "horizontal_rule" [_]
  "---")

(defmethod pm-node->md :default [node]
  (str "<!-- Unknown node type: " (:type node) " -->"))

(defn prosemirror->markdown
  "Convert ProseMirror JSON to Markdown string"
  [pm-json]
  (pm-node->md pm-json))

;; ============================================================================
;; Markdown to ProseMirror Conversion
;; ============================================================================

(defn parse-inline-marks
  "Parse inline markdown marks (bold, italic, code, links) in text"
  [text]
  (let [patterns [;; Bold with **
                  {:regex #"\*\*([^*]+)\*\*"
                   :mark-type "strong"}
                  ;; Italic with *
                  {:regex #"\*([^*]+)\*"
                   :mark-type "em"}
                  ;; Inline code
                  {:regex #"`([^`]+)`"
                   :mark-type "code"}
                  ;; Links
                  {:regex #"\[([^\]]+)\]\(([^)]+)\)"
                   :mark-type "link"}]]
    (loop [remaining text
           result []]
      (if (empty? remaining)
        result
        (let [matches (keep (fn [{:keys [regex mark-type]}]
                              (when-let [m (re-find regex remaining)]
                                {:match m
                                 :type mark-type
                                 :pos (.indexOf remaining (first m))}))
                            patterns)
              earliest (first (sort-by :pos matches))]
          (if earliest
            (let [{:keys [match type pos]} earliest
                  [full-match group1 group2] match
                  before (subs remaining 0 pos)
                  after (subs remaining (+ pos (count full-match)))]
              (recur after
                     (cond-> result
                       (not (empty? before))
                       (conj {:type "text" :text before})

                       true
                       (conj (if (= type "link")
                               {:type "text"
                                :text group1
                                :marks [{:type "link"
                                         :attrs {:href group2}}]}
                               {:type "text"
                                :text group1
                                :marks [{:type type}]})))))
            (conj result {:type "text" :text remaining})))))))

(defn parse-paragraph
  "Parse a paragraph line into ProseMirror nodes"
  [line]
  {:type "paragraph"
   :content (if (empty? line)
              []
              (parse-inline-marks line))})

(defn parse-heading
  "Parse a heading line"
  [line]
  (when-let [[_ hashes content] (re-matches #"^(#{1,6})\s+(.+)$" line)]
    {:type "heading"
     :attrs {:level (count hashes)}
     :content (parse-inline-marks content)}))

(defn parse-code-block
  "Parse a code block from lines"
  [lines idx]
  (when (str/starts-with? (nth lines idx) "```")
    (let [end-idx (some #(when (str/starts-with? (nth lines % "") "```") %)
                        (range (inc idx) (count lines)))
          code-lines (subvec lines (inc idx) (or end-idx (count lines)))
          code-text (str/join "\n" code-lines)]
      {:node {:type "code_block"
              :content [{:type "text" :text code-text}]}
       :consumed (- (or end-idx (count lines)) idx)})))

(defn markdown->prosemirror
  "Convert Markdown string to ProseMirror JSON"
  [md-string]
  (let [lines (vec (str/split-lines md-string))
        nodes (loop [idx 0
                     result []]
                (if (>= idx (count lines))
                  result
                  (let [line (str/trim (nth lines idx))]
                    (cond
                      ;; Empty line
                      (empty? line)
                      (recur (inc idx) result)

                      ;; Heading
                      (str/starts-with? line "#")
                      (if-let [heading (parse-heading line)]
                        (recur (inc idx) (conj result heading))
                        (recur (inc idx) (conj result (parse-paragraph line))))

                      ;; Code block
                      (str/starts-with? line "```")
                      (let [{:keys [node consumed]} (parse-code-block lines idx)]
                        (recur (+ idx consumed) (conj result node)))

                      ;; Horizontal rule
                      (re-matches #"^---+$" line)
                      (recur (inc idx) (conj result {:type "horizontal_rule"}))

                      ;; Blockquote
                      (str/starts-with? line ">")
                      (let [quote-text (str/replace line #"^>\s*" "")]
                        (recur (inc idx)
                               (conj result {:type "blockquote"
                                             :content [(parse-paragraph quote-text)]})))

                      ;; Unordered list
                      (re-matches #"^[-*]\s+.+" line)
                      (let [item-text (str/replace line #"^[-*]\s+" "")]
                        (recur (inc idx)
                               (conj result {:type "bulletList"
                                             :content [{:type "listItem"
                                                        :content [(parse-paragraph item-text)]}]})))

                      ;; Ordered list
                      (re-matches #"^\d+\.\s+.+" line)
                      (let [item-text (str/replace line #"^\d+\.\s+" "")]
                        (recur (inc idx)
                               (conj result {:type "ordered_list"
                                             :content [{:type "listItem"
                                                        :content [(parse-paragraph item-text)]}]})))

                      ;; Regular paragraph
                      :else
                      (recur (inc idx) (conj result (parse-paragraph line)))))))]
    {:type "doc"
     :content nodes}))

;; ============================================================================
;; Public API
;; ============================================================================

(defn pm->md
  "Convert ProseMirror JSON to Markdown"
  [pm-json]
  (prosemirror->markdown pm-json))

(defn md->pm
  "Convert Markdown to ProseMirror JSON"
  [markdown]
  (markdown->prosemirror markdown))

;; Example usage:
(comment
  ;; ProseMirror to Markdown
  (pm->md
   {:type "doc"
    :content [{:type "heading"
               :attrs {:level 1}
               :content [{:type "text" :text "Hello World"}]}
              {:type "paragraph"
               :content [{:type "text"
                          :text "This is "
                          :marks [{:type "strong"}]}
                         {:type "text" :text "bold"}
                         {:type "text" :text " and "}
                         {:type "text"
                          :text "italic"
                          :marks [{:type "em"}]}]}]})

  (-> (toucan2.core/select-one :model/Document :id 2)
      :document
      pm->md
      println)

  ;; Markdown to ProseMirror
  (md->pm "# Hello World\n\nThis is **bold** and *italic*"))