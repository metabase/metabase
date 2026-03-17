(ns metabase.comments.render
  "Server-side rendering of TipTap JSON content to safe HTML.

  Renders from the structured content JSON that TipTap produces, with an allowlist of
  known node types and mark types. Anything not on the allowlist is stripped or rendered
  as plain text. Nodes are first converted to Hiccup data structures, then compiled to
  HTML via `hiccup2.core/html`."
  (:require
   [clojure.string :as str]
   [hiccup.util :as hiccup.util]
   [hiccup2.core :as h2]
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

(defn- smart-link->hiccup
  "Convert a smartLink node to hiccup. Renders as a clickable link when the href is a safe
  relative path, or as escaped plain text otherwise."
  [{:keys [attrs]}]
  (let [{:keys [label href model entityId]} attrs
        display-text (or label
                         (when (= model "user") (str "@" entityId))
                         (str model " " entityId))]
    (if (and href (relative-path? href))
      [:a {:href (str (system/site-url) href)} display-text]
      ;; Return escaped text as a raw string so hiccup won't double-escape it
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
