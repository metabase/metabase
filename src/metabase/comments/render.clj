(ns metabase.comments.render
  "Server-side rendering of TipTap JSON content to safe HTML.

  Renders from the structured content JSON that TipTap produces, with an allowlist of
  known node types and mark types. Anything not on the allowlist is stripped or rendered
  as plain text. Nodes are first converted to Hiccup data structures, then compiled to
  HTML via `hiccup2.core/html`."
  (:require
   [hiccup.util :as hiccup.util]
   [hiccup2.core :as h2]
   [metabase.channel.urls :as channel.urls]
   [metabase.util.log :as log]))

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

(def ^:private mark-type->tag
  {"bold"   :strong
   "italic" :em
   "strike" :s
   "code"   :code})

(defn- wrap-marks
  "Wrap hiccup content in tags for each mark (bold, italic, etc.)."
  [content marks]
  (reduce (fn [inner {:keys [type]}]
            (if-let [tag (mark-type->tag type)]
              [tag inner]
              inner))
          content
          marks))

(declare node->hiccup)

(defn- children->hiccup
  "Convert a sequence of child nodes to hiccup, skipping nodes with disallowed types."
  [children]
  (keep node->hiccup children))

(def ^:private model->url-fn
  "Map of smart link model types to their URL-building functions.
  User mentions don't get links — they render as plain text."
  {"card"       channel.urls/card-url
   "dataset"    channel.urls/card-url
   "dashboard"  channel.urls/dashboard-url
   "collection" channel.urls/collection-url
   "document"   #(format "%s/document/%d" (channel.urls/site-url) %)})

(defn- smart-link->hiccup
  "Convert a smartLink node to hiccup. Builds URLs from model + entityId rather than
  trusting the href attribute, which could be crafted to inject phishing links."
  [{:keys [attrs]}]
  (let [{:keys [label model entityId]} attrs
        display-text (or label
                         (when (= model "user") (str "@" entityId))
                         (str model " " entityId))
        url-fn       (model->url-fn model)]
    (if url-fn
      [:a {:href (url-fn entityId)} display-text]
      ;; Unknown model or user mention — render as escaped plain text
      (hiccup.util/raw-string (hiccup.util/escape-html display-text)))))

(defn node->hiccup
  "Convert a single TipTap JSON node to a Hiccup data structure. Unknown node types return nil.
  Doc nodes return a sequence of hiccup forms (not a single form) so the caller can join them."
  [{:keys [type content text marks attrs] :as node}]
  (if-not (allowed-node-types type)
    (do (log/warnf "Ignoring unknown TipTap node type: %s" type)
        nil)
    (case type
      "doc"            (children->hiccup content)
      "paragraph"      (into [:p] (children->hiccup content))
      "heading"        (let [level (min (max (get attrs :level 1) 1) 6)
                             tag   (keyword (str "h" level))]
                         (into [tag] (children->hiccup content)))
      "bulletList"     (into [:ul] (children->hiccup content))
      "orderedList"    (into [:ol] (children->hiccup content))
      "listItem"       (into [:li] (children->hiccup content))
      "codeBlock"      [:pre [:code (apply str (map :text content))]]
      "blockquote"     (into [:blockquote] (children->hiccup content))
      "horizontalRule" [:hr]
      "hardBreak"      [:br]
      "text"           (wrap-marks text (sanitize-marks marks))
      "smartLink"      (smart-link->hiccup node))))

(defn content->html
  "Convert TipTap JSON content to safe HTML. This is the main entry point.
  Returns nil if content is nil."
  [content]
  (when content
    (let [hiccup (node->hiccup content)]
      (if (sequential? (first hiccup))
        ;; doc node returns a seq of hiccup forms
        (apply str (map #(str (h2/html %)) hiccup))
        (str (h2/html hiccup))))))
