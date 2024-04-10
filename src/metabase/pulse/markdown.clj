(ns metabase.pulse.markdown
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList BulletListItem Code Emphasis FencedCodeBlock HardLineBreak
                             Heading HtmlBlock HtmlCommentBlock HtmlEntity HtmlInline HtmlInlineBase HtmlInlineComment
                             HtmlInnerBlockComment Image ImageRef IndentedCodeBlock Link LinkRef MailLink OrderedList
                             OrderedListItem Paragraph Reference SoftLineBreak StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.ext.autolink AutolinkExtension)
   (com.vladsch.flexmark.html HtmlRenderer LinkResolver LinkResolverFactory)
   (com.vladsch.flexmark.html.renderer LinkResolverBasicContext LinkStatus)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Document Node)
   (com.vladsch.flexmark.util.data MutableDataSet)
   (java.net URI)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Markdown parsing                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private parser
  "An instance of a Flexmark parser"
  (let [options (.. (MutableDataSet.)
                    (set Parser/EXTENSIONS [(AutolinkExtension/create)]))]
    (.build (Parser/builder options))))

(def ^:private node-to-tag-mapping
  "Mappings from Flexmark AST nodes to keyword tags"
  {Document              :document
   Paragraph             :paragraph
   ThematicBreak         :horizontal-line
   HardLineBreak         :hard-line-break
   SoftLineBreak         :soft-line-break
   Heading               :heading
   StrongEmphasis        :bold
   Emphasis              :italic
   OrderedList           :ordered-list
   BulletList            :unordered-list
   OrderedListItem       :list-item
   BulletListItem        :list-item
   Code                  :code
   FencedCodeBlock       :codeblock
   IndentedCodeBlock     :codeblock
   BlockQuote            :blockquote
   Link                  :link
   Reference             :reference
   LinkRef               :link-ref
   ImageRef              :image-ref
   Image                 :image
   AutoLink              :auto-link
   MailLink              :mail-link
   HtmlEntity            :html-entity
   HtmlBlock             :html-block
   HtmlInline            :html-inline
   HtmlCommentBlock      :html-comment-block
   HtmlInlineBase        :html-inline-base
   HtmlInlineComment     :html-inline-comment
   HtmlInnerBlockComment :html-inner-block-comment})

(defn- node-to-tag
  [node]
  (node-to-tag-mapping (type node)))

(defprotocol ^:private ASTNode
  (to-clojure [this]))

(defn- convert-children [node]
  (map to-clojure (.getChildren ^Node node)))

(extend-protocol ASTNode
  Node
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {}
     :content (convert-children this)})

  Text
  (to-clojure [this]
    (str (.getChars this)))

  FencedCodeBlock
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {}
     :content (str (.getContentChars this))})

  IndentedCodeBlock
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {}
     :content (str (.getContentChars this))})

  Link
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {:href (str (.getUrl this))
               :title (not-empty (str (.getTitle this)))}
     :content (convert-children this)})

  Reference
  (to-clojure [this]
    {:tag   (node-to-tag this)
     :attrs {:title (not-empty (str (.getTitle this)))
             :label (str (.getReference this))
             :url (str (.getUrl this))}})

  LinkRef
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {:reference (-> (.getDocument this)
                              (.get Parser/REFERENCES)
                              (get (u/lower-case-en (str (.getReference this))))
                              to-clojure)}
     :content (convert-children this)})

  ImageRef
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {:reference (-> (.getDocument this)
                              (.get Parser/REFERENCES)
                              (get (u/lower-case-en (str (.getReference this))))
                              to-clojure)}
     :content (convert-children this)})

  Image
  (to-clojure [this]
    {:tag   (node-to-tag this)
     :attrs {:src (str (.getUrl this))
             :alt (str (.getText this))
             :title (not-empty (str (.getTitle this)))}})

  AutoLink
  (to-clojure [this]
    {:tag   (node-to-tag this)
     :attrs {:href (str (.getUrl this))}})

  MailLink
  (to-clojure [this]
    {:tag   (node-to-tag this)
     :attrs {:address (str (.getText this))}})

  HtmlEntity
  (to-clojure [this]
    {:tag (node-to-tag this)
     :content (str (.getChars this))})

  HtmlBlock
  (to-clojure [this]
    (str (.getChars this)))

  HtmlInline
  (to-clojure [this]
    (str (.getChars this)))

  HtmlCommentBlock
  (to-clojure [this]
    (str (.getChars this)))

  HtmlInlineComment
  (to-clojure [this]
    (str (.getChars this)))

  nil
  (to-clojure [_this]
    nil))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Slack markup generation                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private html-entities
  (delay (edn/read-string (slurp (io/resource "html-entities.edn")))))

(def ^:private escaped-chars-regex
  #"\\[\\/*_`'\[\](){}<>#+-.!$@%^&=|\?~]")

(defn- escape-text
  "Insert zero-width characters before and after certain characters that are escaped in the Markdown
  (or are otherwise parsed as plain text) to prevent them from being parsed as formatting in Slack."
  [string]
  (-> string
      ;; First, remove backslashes from escaped formatting characters since they're not removed during Markdown parsing
      (str/replace escaped-chars-regex #(str (second %1)))
      ;; Add a soft hyphen around certain chars to avoid triggering formatting in Slack
      (str/replace "&" "\u00ad&\u00ad")
      (str/replace ">" "\u00ad>\u00ad")
      (str/replace "<" "\u00ad<\u00ad")
      (str/replace "*" "\u00ad*\u00ad")
      (str/replace "_" "\u00ad_\u00ad")
      (str/replace "`" "\u00ad`\u00ad")
      (str/replace "~" "\u00ad~\u00ad")))

(defn- resolve-uri
  "If the provided URI is a relative path, resolve it relative to the site URL so that links work
  correctly in Slack/Email."
  [^String uri]
  (letfn [(ensure-slash [s] (when s
                              (cond-> s
                                (not (str/ends-with? s "/")) (str "/"))))]
    (when uri
      (if-let [^String site-url (ensure-slash (public-settings/site-url))]
        (.. (URI. site-url) (resolve uri) toString)
        uri))))

(defn- ^:private strip-tag
  "Given the value from the :content field of a Markdown AST node, and a keyword representing a tag type, converts all
  instances of the tag in the content to `:default` tags. This is used to suppress rendering of nested bold and italic
  tags, which Slack doesn't support."
  [content tag]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (= (:tag node) tag))
        (assoc node :tag :default)
        node))
   content))

(defmulti ast->slack
  "Takes an AST representing Markdown input, and converts it to a string that will render nicely in Slack.

  Some of the differences to Markdown include:
  * All headers are just rendered as bold text.
  * Ordered and unordered lists are printed in plain text.
  * Inline images are rendered as text that links to the image source, e.g. <image.png|[Image: alt-text]>."
  :tag)

(defn ^:private resolved-content
  "Given the value from the :content field of a Markdown AST node, recursively resolves subnodes into a nested list of
  strings."
  [content]
  (if (string? content)
    (escape-text content)
    (map #(if (string? %)
            (escape-text %)
            (ast->slack %))
         content)))

(defn ^:private resolved-content-string
  "Given the resolved content of a Markdown AST node, converts it into a single flattened string. This is used for
  rendering a couple specific types of nodes, such as list items."
  [resolved-content]
  (-> resolved-content
      flatten
      str/join))

(defn ^:private resolved-lines
  "Given the value from the :content field of a Markdown AST node, recursively resolves it and returns a list of
  strings corresponding to individual lines in the result."
  [content]
  (-> content
      resolved-content
      resolved-content-string
      str/split-lines))

(defmethod ast->slack :default
  [{content :content}]
  (resolved-content content))

(defmethod ast->slack :document
  [{content :content}]
  (resolved-content content))

(defmethod ast->slack :paragraph
  [{content :content}]
  [(resolved-content content) "\n"])

(defmethod ast->slack :soft-line-break
  [_]
  " ")

(defmethod ast->slack :hard-line-break
  [_]
  "\n")

(defmethod ast->slack :horizontal-line
  [_]
  "\n───────────────────\n")

(defmethod ast->slack :heading
  [{content :content}]
  ["*" (resolved-content content) "*\n"])

(defmethod ast->slack :bold
  [{content :content}]
  ["*" (resolved-content (strip-tag content :bold)) "*"])

(defmethod ast->slack :italic
  [{content :content}]
  ["_" (resolved-content (strip-tag content :italic)) "_"])

(defmethod ast->slack :code
  [{content :content}]
  ["`" (resolved-content content) "`"])

(defmethod ast->slack :codeblock
  [{content :content}]
  ["```\n" (resolved-content content) "```"])

(defmethod ast->slack :blockquote
  [{content :content}]
  (let [lines (resolved-lines content)]
    (interpose "\n" (map (fn [line] [">" line]) lines))))

(defmethod ast->slack :link
  [{:keys [content attrs]}]
  (let [resolved-uri     (resolve-uri (:href attrs))
        resolved-content (resolved-content content)]
    (if (contains? #{:image :image-ref} (:tag (first content)))
      ;; If this is a linked image, add link target on separate line after image placeholder
      [resolved-content "\n(" resolved-uri ")"]
      ["<" resolved-uri "|" resolved-content ">"])))

(defmethod ast->slack :link-ref
  [{:keys [content attrs]}]
  (let [resolved-uri     (resolve-uri (-> attrs :reference :attrs :url))
        resolved-content (resolved-content content)]
    (if resolved-uri
      ["<" resolved-uri "|" resolved-content ">"]
      ;; If this was parsed as a link-ref but has no reference, assume it was just a pair of square brackets and
      ;; restore them. This is a known discrepency between flexmark-java and Markdown rendering on the frontend.
      ["[" resolved-content "]"])))

(defmethod ast->slack :auto-link
  [{{href :href} :attrs}]
  ["<" href ">"])

(defmethod ast->slack :mail-link
  [{{address :address} :attrs}]
  ["<mailto:"  address "|" address ">"])

(defmethod ast->slack :list-item
  [{content :content}]
  (let [resolved-content (resolved-content content)
        ;; list items might have nested lists or other elements, which should have their indentation level increased
        indented-content (->> (rest resolved-content)
                              resolved-content-string
                              str/split-lines
                              (map #(str "    " %))
                              (str/join "\n"))]
    (if-not (str/blank? indented-content)
      [(first resolved-content) indented-content "\n"]
      resolved-content)))

(defmethod ast->slack :unordered-list
  [{content :content}]
  (map (fn [list-item] ["• " list-item])
       (resolved-content content)))

(defmethod ast->slack :ordered-list
  [{content :content}]
  (map-indexed (fn [idx list-item] [(inc idx) ". " list-item])
               (resolved-content content)))

(defmethod ast->slack :image
  [{{:keys [src alt]} :attrs}]
  ;; Replace images with text that links to source, including alt text if available
  (if (str/blank? alt)
    ["<" src "|[Image]>"]
    ["<" src "|[Image: " alt "]>"]))

(defmethod ast->slack :image-ref
  [{:keys [content attrs]}]
  (let [src (-> attrs :reference :attrs :url)
        alt (-> content resolved-content resolved-content-string)]
    (if (str/blank? alt)
      ["<" src "|[Image]>"]
      ["<" src "|[Image: " alt "]>"])))

(defmethod ast->slack :html-entity
  [{content :content}]
  (some->> content
           (get @html-entities)
           (:characters)))

(defn- empty-link-ref?
  "Returns true if this node was parsed as a link ref, but has no references. This probably means the original text
  was just a pair of square brackets, and not an actual link ref. This is a known discrepency between flexmark-java
  and Markdown rendering on the frontend."
  [^Node node]
  (and (instance? LinkRef node)
       (-> (.getDocument node)
           (.get Parser/REFERENCES)
           empty?)))

(def ^:private renderer
  "An instance of a Flexmark HTML renderer"
  (let [options    (.. (MutableDataSet.)
                       (set HtmlRenderer/ESCAPE_HTML true)
                       (toImmutable))
        lr-factory (reify LinkResolverFactory
                     (^LinkResolver apply [_this ^LinkResolverBasicContext _context]
                       (reify LinkResolver
                         (resolveLink [_this node _context link]
                           (if-let [url (cond
                                          (instance? MailLink node) (.getUrl link)
                                          (empty-link-ref? node) nil
                                          :else (resolve-uri (.getUrl link)))]
                             (.. link
                                 (withStatus LinkStatus/VALID)
                                 (withUrl url))
                             link)))))]
    (.build (.linkResolverFactory (HtmlRenderer/builder options) lr-factory))))

(defmulti process-markdown
  "Converts a markdown string from a virtual card into a form that can be sent to a channel
  (Slack's markup language, or HTML for email)."
  (fn [_markdown channel-type] channel-type))

(defmethod process-markdown :slack
  [markdown _channel-type]
  (-> (.parse ^Parser parser ^String markdown)
      to-clojure
      ast->slack
      flatten
      str/join
      str/trim))

(defmethod process-markdown :html
  [markdown _channel-type]
  (let [ast (.parse ^Parser parser ^String markdown)]
    (.render ^HtmlRenderer renderer ^Document ast)))
