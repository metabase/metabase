(ns metabase.comments.render
  "Server-side rendering of TipTap JSON content to safe HTML.

  Renders from the structured content JSON that TipTap produces, with an allowlist of
  known node types and mark types. Anything not on the allowlist is stripped or rendered
  as plain text."
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [metabase.system.core :as system]
   [metabase.util.log :as log])
  (:import
   (java.net URI URISyntaxException)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Sanitization -------------------------------------------------

(def ^:private allowed-node-types
  "Allowlist of TipTap node types we render. Unknown types are stripped."
  #{"doc" "paragraph" "heading" "bulletList" "orderedList" "listItem"
    "codeBlock" "blockquote" "horizontalRule" "hardBreak" "text" "smartLink"})

(def ^:private allowed-mark-types
  "Allowlist of TipTap mark types we render. Unknown marks are stripped.
  Note: \"link\" is intentionally excluded — the UI only produces smartLinks for entity
  references, so there is no legitimate source of link marks. Excluding them prevents
  phishing links from being injected via crafted API requests."
  #{"bold" "italic" "strike" "code"})

(defn- sanitize-marks
  "Filter marks to only allowed types."
  [marks]
  (when (seq marks)
    (filterv #(allowed-mark-types (:type %)) marks)))

;;; --------------------------------------------------- Rendering --------------------------------------------------

(defn- wrap-marks
  "Wrap text in HTML tags for each mark (bold, italic, etc.)."
  [html marks]
  (reduce (fn [html {:keys [type]}]
            (case type
              "bold"   (str "<strong>" html "</strong>")
              "italic" (str "<em>" html "</em>")
              "strike" (str "<s>" html "</s>")
              "code"   (str "<code>" html "</code>")
              html))
          html
          marks))

(declare render-node)

(defn- render-children
  "Render a sequence of child nodes, skipping nodes with disallowed types."
  [children]
  (str/join (map render-node children)))

(defn- relative-path?
  "Check if a string is a relative path using java.net.URI. Returns true only for paths
  with no scheme and no authority (host), e.g. '/question/42'. Returns false for absolute
  URLs like 'https://evil.example' or protocol-relative '//evil.example'."
  [s]
  (try
    (let [uri (URI. (str s))]
      (and (nil? (.getScheme uri))
           (nil? (.getAuthority uri))
           (str/starts-with? (str (.getPath uri)) "/")))
    (catch URISyntaxException _ false)))

(defn- render-smart-link
  "Render a smartLink node as a clickable link when the href is a safe relative path,
  or as plain text otherwise. Only relative internal paths are rendered as links."
  [{:keys [attrs]}]
  (let [{:keys [label href model entityId]} attrs
        display-text (h (or label
                            (when (= model "user") (str "@" entityId))
                            (str model " " entityId)))]
    (if (and href (relative-path? href))
      (str "<a href=\"" (h (str (system/site-url) href)) "\">" display-text "</a>")
      display-text)))

(defn render-node
  "Render a single TipTap JSON node to safe HTML. Unknown node types are dropped."
  [{:keys [type content text marks attrs] :as node}]
  (if-not (allowed-node-types type)
    (do (log/warnf "Ignoring unknown TipTap node type: %s" type)
        "")
    (case type
      "doc"            (render-children content)
      "paragraph"      (str "<p>" (render-children content) "</p>")
      "heading"        (let [level (min (max (get attrs :level 1) 1) 6)]
                         (str "<h" level ">" (render-children content) "</h" level ">"))
      "bulletList"     (str "<ul>" (render-children content) "</ul>")
      "orderedList"    (str "<ol>" (render-children content) "</ol>")
      "listItem"       (str "<li>" (render-children content) "</li>")
      "codeBlock"      (str "<pre><code>" (h (render-children content)) "</code></pre>")
      "blockquote"     (str "<blockquote>" (render-children content) "</blockquote>")
      "horizontalRule" "<hr/>"
      "hardBreak"      "<br/>"
      "text"           (wrap-marks (h text) (sanitize-marks marks))
      "smartLink"      (render-smart-link node))))

(defn content->html
  "Convert TipTap JSON content to safe HTML. This is the main entry point.
  Returns nil if content is nil."
  [content]
  (when content
    (render-node content)))
