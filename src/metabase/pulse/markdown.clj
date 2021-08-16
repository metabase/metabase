(ns metabase.pulse.markdown
  (:require [clojure.string :as str]
            [hickory.core :as hickory]
            [markdown.core :as md]
            [markdown.transformers :as md.transformers]))

(defn- escape-markdown
  "Insert zero-width characters before and after certain characters that are escaped in the Markdown,
  to prevent them from being parsed as formatting in Slack."
  [string]
  (str/escape string
              {\*  "\u00ad*\u00ad"
               \_  "\u00ad_\u00ad"
               \`  "\u00ad`\u00ad"
               ;; Escaped backticks are converted to curly quotes for HTML, so let's change them back
               \‘  "\u00ad`\u00ad"}))

(defn- hickory->mrkdwn
  "Takes a Hickory data structure representing HTML, and converts it to a mrkdwn string that will render
  nicely in Slack.

  Primary differences to Markdown:
    * All headers are just rendered as bold text.
    * Ordered and unordered lists are printed in plain text.
    * Inline images are rendered as text that links to the image source, e.g. <image.png|[Image: alt-text]>."
  [{:keys [tag attrs content]}]
  (let [resolved-content (if (string? content)
                           (escape-markdown content)
                           (map #(if (string? %)
                                   (escape-markdown %)
                                   (hickory->mrkdwn %))
                                content))
        joined-content   (str/join resolved-content)]
    (case tag
      (:strong :b :h1 :h2 :h3 :h4 :h5 :h6)
      (str "*" joined-content "*")

      (:em :i)
      (str "_" joined-content "_")

      :code
      (if (str/includes? joined-content "\n")
        ;; Use codeblock formatting if content contains newlines, since both are parsed to HTML :code tags.
        ;; Add a newline before content since markdown-clj removes it.
        (str "```\n" joined-content "```")
        (str "`" joined-content "`"))

      :blockquote
      (str ">" joined-content)

      :footer
      (str "\n>•" joined-content)

      :a
      (if (= (:tag (first content)) :img)
        ;; If this is a linked image, add link target on separate line after image placeholder
        (str joined-content "\n(" (:href attrs) ")")
        (str "<" (:href attrs) "|" joined-content ">"))

      ;; li tags might have nested lists or other elements, which should have their indentation level increased
      :li
      (let [content-to-indent (rest resolved-content)
            lines-to-indent   (str/split-lines
                               ;; Treat blank sub-elements as newlines
                               (str/join (map #(if (str/blank? %) "\n" %)
                                              content-to-indent)))
            indented-content  (str/join "\n" (map #(str "    " %) lines-to-indent))]
        (if-not (str/blank? indented-content)
          (str (first resolved-content) "\n" indented-content)
          joined-content))

      :ul
      (str/join "\n" (map #(str "• " %) resolved-content))

      :ol
      (str/join "\n" (map-indexed #(str (inc %1) ". " %2) resolved-content))

      :br
      (str "\n" (str/triml joined-content))

      :img
      ;; Replace images with links, including alt text
      (let [{:keys [src alt]} attrs]
        (if (str/blank? alt)
          (str "<" src "|[Image]>")
          (str "<" src "|[Image: " alt "]>")))

      joined-content)))

(defn- escape-html
  "Change special characters into HTML character entities. '>' is not escaped to preserve blockquote parsing."
  [text state]
  [(if-not (or (:code state) (:codeblock state))
     (clojure.string/escape text {\& "&amp;"
                                  \< "&lt;"
                                  \" "&quot;"
                                  \' "&#39;"})
     text)
   state])

(defn- markdown-to-html
  "Wrapper for Markdown parsing that includes escaping HTML entities."
  [markdown]
  (md/md-to-html-string markdown
                        :replacement-transformers (into [escape-html] md.transformers/transformer-vector)))

(defmulti process-markdown
  "Converts a markdown string from a virtual card into a form that can be sent to the provided channel type
  (mrkdwn for Slack; HTML for email)."
  (fn [_markdown channel-type] channel-type))

(defmethod process-markdown :slack
  ;; Converts a markdown string from a virtual card on a dashboard into mrkdwn, the limited markdown dialect
  ;; used by Slack. The original markdown is converted to HTML and then to Hickory, which is used as an
  ;; intermediate representation that is then converted to mrkdwn.
  ;;
  ;; For example, a Markdown header is converted to bold text for Slack:
  ;; Markdown: # header
  ;; HTML:     <h1>header</h1>
  ;; Hickory:  {:type :element, :attrs nil, :tag :h1, :content ["header"]}
  ;; mrkdwn:   *header*
  [markdown _]
  (->> markdown
       markdown-to-html
       hickory/parse-fragment
       (map hickory/as-hickory)
       (map hickory->mrkdwn)
       (str/join "\n")))

(defmethod process-markdown :email
  [markdown _]
  (md/md-to-html-string markdown))
