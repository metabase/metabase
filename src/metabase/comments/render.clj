(ns metabase.comments.render
  "Server-side rendering of TipTap JSON content to HTML.

  Instead of trusting client-supplied HTML (which could contain arbitrary/malicious content),
  we render safe HTML from the structured content JSON that TipTap produces."
  (:require
   [clojure.string :as str]
   [metabase.system.core :as system]))

(set! *warn-on-reflection* true)

(defn- escape-html
  "Escape HTML special characters in a string."
  [s]
  (-> (str s)
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")
      (str/replace "\"" "&quot;")))

(defn- wrap-marks
  "Wrap text in HTML tags for each mark (bold, italic, etc.)."
  [html marks]
  (reduce (fn [html {:keys [type attrs]}]
            (case type
              "bold"   (str "<strong>" html "</strong>")
              "italic" (str "<em>" html "</em>")
              "strike" (str "<s>" html "</s>")
              "code"   (str "<code>" html "</code>")
              "link"   (str "<a href=\"" (escape-html (:href attrs)) "\">" html "</a>")
              ;; unknown mark — just pass through
              html))
          html
          marks))

(declare render-node)

(defn- render-children
  "Render a sequence of child nodes."
  [children]
  (str/join (map render-node children)))

(defn- render-smart-link
  "Render a smartLink node as a plain anchor tag. In emails, we can't use React components,
  so we render a simple link to the entity."
  [{:keys [attrs]}]
  (let [{:keys [label href model entityId]} attrs
        resolved-href (if (and href (str/starts-with? (str href) "/"))
                        (str (system/site-url) href)
                        href)
        display-text  (or label
                          (when (= model "user") (str "@" entityId))
                          (str model " " entityId))]
    (if resolved-href
      (str "<a href=\"" (escape-html (str resolved-href)) "\">" (escape-html display-text) "</a>")
      (escape-html display-text))))

(defn render-node
  "Render a single TipTap JSON node to HTML."
  [{:keys [type content text marks attrs] :as node}]
  (case type
    "doc"            (render-children content)
    "paragraph"      (str "<p>" (render-children content) "</p>")
    "heading"        (let [level (min (max (get attrs :level 1) 1) 6)]
                       (str "<h" level ">" (render-children content) "</h" level ">"))
    "bulletList"     (str "<ul>" (render-children content) "</ul>")
    "orderedList"    (str "<ol>" (render-children content) "</ol>")
    "listItem"       (str "<li>" (render-children content) "</li>")
    "codeBlock"      (str "<pre><code>" (escape-html (render-children content)) "</code></pre>")
    "blockquote"     (str "<blockquote>" (render-children content) "</blockquote>")
    "horizontalRule" "<hr/>"
    "hardBreak"      "<br/>"
    "text"           (wrap-marks (escape-html text) marks)
    "smartLink"      (render-smart-link node)
    ;; unknown node type — render children if any, otherwise empty
    (if (seq content)
      (render-children content)
      "")))

(defn content->html
  "Convert TipTap JSON content to safe HTML. This is the main entry point.
  Returns nil if content is nil."
  [content]
  (when content
    (render-node content)))
