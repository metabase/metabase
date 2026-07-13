(ns metabase.documents.markdown
  "Convert a Markdown string into a ProseMirror document AST — the shape stored in a
  `:model/Document`'s `:document` column.

  Documents are normally authored by the front-end TipTap editor, which owns the ProseMirror
  AST. The Agent API `create_document` tool, however, lets an LLM author a document, and an LLM
  cannot reliably hand-write ProseMirror JSON. This namespace bridges that gap: the agent sends
  Markdown and we convert it to the equivalent ProseMirror nodes.

  A paragraph whose entire text is `{{card:<id>}}` is converted to a `cardEmbed` node that embeds
  the saved question with that id, so an agent can place previously-created charts inline."
  (:require
   [clojure.string :as str]
   [metabase.documents.prose-mirror :as prose-mirror])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading IndentedCodeBlock Link MailLink OrderedList
                             Paragraph SoftLineBreak StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Node)
   (com.vladsch.flexmark.util.data MutableDataSet)))

(set! *warn-on-reflection* true)

(def ^:private parser
  "A Flexmark parser. Core CommonMark features only — no autolink/strike extensions, matching the
  subset of nodes we map below."
  (.build (Parser/builder (MutableDataSet.))))

(def ^:private card-embed-regex
  "Matches a paragraph that is exactly `{{card:<id>}}` (optionally padded), capturing the id."
  #"^\{\{\s*card\s*:\s*(\d+)\s*\}\}$")

;;; ------------------------------------------------- Inline nodes --------------------------------------------------

(defn- text-node
  "A ProseMirror `text` node carrying the accumulated `marks` (a vector, omitted when empty)."
  [marks ^String s]
  (cond-> {:type "text" :text s}
    (seq marks) (assoc :marks marks)))

(declare inline-nodes)

(defn- with-mark
  "Recurse into `node`'s children with `mark` appended to the active mark set."
  [^Node node marks mark]
  (inline-nodes node (conj marks mark)))

(defn- inline-node
  "Convert one inline Flexmark `node` into a seq of ProseMirror inline nodes, carrying the active
  `marks`. Unknown inline nodes fall back to recursing their children, so unsupported syntax still
  contributes its text rather than vanishing."
  [^Node node marks]
  (condp instance? node
    Text           [(text-node marks (str (.getChars node)))]
    StrongEmphasis (with-mark node marks {:type "bold"})
    Emphasis       (with-mark node marks {:type "italic"})
    Code           [(text-node (conj marks {:type "code"}) (str (.getText ^Code node)))]
    Link           (inline-nodes node (conj marks {:type "link"
                                                   :attrs (cond-> {:href (str (.getUrl ^Link node))}
                                                            (not (str/blank? (str (.getTitle ^Link node))))
                                                            (assoc :title (str (.getTitle ^Link node))))}))
    AutoLink       (let [url (str (.getUrl ^AutoLink node))]
                     [(text-node (conj marks {:type "link" :attrs {:href url}}) url)])
    MailLink       (let [address (str (.getText ^MailLink node))]
                     [(text-node (conj marks {:type "link" :attrs {:href (str "mailto:" address)}}) address)])
    SoftLineBreak  [(text-node marks " ")]
    HardLineBreak  [{:type "hardBreak"}]
    (seq (mapcat #(inline-node % marks) (.getChildren node)))))

(defn- inline-nodes
  "Convert the inline children of `node` into a vector of ProseMirror inline nodes."
  [^Node node marks]
  (into [] (mapcat #(inline-node % marks)) (.getChildren node)))

;;; ------------------------------------------------- Block nodes ---------------------------------------------------

(declare block-node)

(defn- block-children
  "Convert the block-level children of `node`, dropping any that map to nil."
  [^Node node]
  (into [] (keep block-node) (.getChildren node)))

(defn- code-block-node
  [^String content ^String info]
  (cond-> {:type "codeBlock" :content (if (str/blank? content)
                                        []
                                        [{:type "text" :text (str/replace content #"\n\z" "")}])}
    (not (str/blank? info)) (assoc :attrs {:language info})))

(defn- paragraph-node
  "Convert a paragraph, or — when its whole text is a `{{card:<id>}}` directive — a `cardEmbed`."
  [^Paragraph node]
  (if-let [[_ id] (re-matches card-embed-regex (str/trim (str (.getChars node))))]
    {:type  prose-mirror/card-embed-type
     :attrs {:id (parse-long id) :name nil}}
    {:type "paragraph" :content (inline-nodes node [])}))

(defn- block-node
  "Convert one block-level Flexmark `node` into a ProseMirror block node, or nil to drop it."
  [^Node node]
  (condp instance? node
    Heading           {:type "heading" :attrs {:level (.getLevel ^Heading node)}
                       :content (inline-nodes node [])}
    Paragraph         (paragraph-node node)
    BulletList        {:type "bulletList" :content (block-children node)}
    OrderedList       {:type "orderedList" :content (block-children node)}
    FencedCodeBlock   (code-block-node (str (.getContentChars ^FencedCodeBlock node))
                                       (str (.getInfo ^FencedCodeBlock node)))
    IndentedCodeBlock (code-block-node (str (.getContentChars ^IndentedCodeBlock node)) "")
    BlockQuote        {:type "blockquote" :content (block-children node)}
    ThematicBreak     {:type "horizontalRule"}
    ;; BulletListItem / OrderedListItem and any other container: a list item wrapping block content.
    (when (seq (.getChildren node))
      {:type "listItem" :content (block-children node)})))

(defn markdown->prose-mirror
  "Convert a Markdown string into a ProseMirror document AST `{:type \"doc\" :content [...]}`.

  Supports headings, paragraphs, bold/italic/inline-code/link marks, bulleted and numbered lists,
  code blocks, blockquotes, and horizontal rules. A paragraph that is exactly `{{card:<id>}}`
  becomes a `cardEmbed` node embedding saved question `<id>`."
  [^String markdown]
  (let [doc     (.parse parser (or markdown ""))
        content (into [] (keep block-node) (.getChildren doc))]
    {:type "doc" :content content}))
