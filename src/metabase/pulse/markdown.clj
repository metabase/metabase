(ns metabase.pulse.markdown
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase.public-settings :as public-settings])
  (:import [com.vladsch.flexmark.ast AutoLink BlockQuote BulletList BulletListItem Code Emphasis FencedCodeBlock
            HardLineBreak Heading HtmlBlock HtmlCommentBlock HtmlEntity HtmlInline HtmlInlineBase HtmlInlineComment
            HtmlInnerBlockComment Image ImageRef IndentedCodeBlock Link LinkRef MailLink OrderedList OrderedListItem
            Paragraph Reference SoftLineBreak StrongEmphasis Text ThematicBreak]
           com.vladsch.flexmark.html.HtmlRenderer
           com.vladsch.flexmark.parser.Parser
           [com.vladsch.flexmark.util.ast Document Node]
           java.net.URI))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Markdown parsing                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private parser
  "An instance of a Flexmark parser"
  (delay (.build (Parser/builder))))

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
   OrderedListItem       :ordered-list-item
   BulletListItem        :unordered-list-item
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
                              (get (str/lower-case (str (.getReference this))))
                              to-clojure)}
     :content (convert-children this)})

  ImageRef
  (to-clojure [this]
    {:tag     (node-to-tag this)
     :attrs   {:reference (-> (.getDocument this)
                              (.get Parser/REFERENCES)
                              (get (str/lower-case (str (.getReference this))))
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
  (to-clojure [this]
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
  [uri]
  (when uri
    (if-let [site-url (public-settings/site-url)]
      (.toString (.resolve (new URI ^String site-url) ^String uri))
      uri)))

(defn- ast->mrkdwn
  "Takes an AST representing Markdown input, and converts it to a mrkdwn string that will render nicely in Slack.

  Some of the differences to Markdown include:
    * All headers are just rendered as bold text.
    * Ordered and unordered lists are printed in plain text.
    * Inline images are rendered as text that links to the image source, e.g. <image.png|[Image: alt-text]>."
  [{:keys [tag attrs content]}]
  (let [resolved-content (if (string? content)
                           (escape-text content)
                           (map #(if (string? %)
                                   (escape-text %)
                                   (ast->mrkdwn %))
                                content))
        joined-content   (str/join resolved-content)]
    (case tag
      :document
      joined-content

      :paragraph
      (str joined-content "\n")

      :soft-line-break
      " "

      :hard-line-break
      "\n"

      (:heading)
      (str "*" joined-content "*\n")

      :bold
      (str "*" joined-content "*")

      :italic
      (str "_" joined-content "_")

      :code
      (str "`" joined-content "`")

      :codeblock
      (str "```\n" joined-content "```")

      :blockquote
      (let [lines (str/split-lines joined-content)]
        (str/join "\n" (map #(str ">" %) lines)))

      :link
      (let [resolved-uri (resolve-uri (:href attrs))]
        (if (contains? #{:image :image-ref} (:tag (first content)))
          ;; If this is a linked image, add link target on separate line after image placeholder
          (str joined-content "\n(" resolved-uri ")")
          (str "<" resolved-uri "|" joined-content ">")))

      :link-ref
      (if-let [resolved-uri (resolve-uri (-> attrs :reference :attrs :url))]
        (str "<" resolved-uri "|" joined-content ">")
        joined-content)

      :auto-link
      (str "<" (:href attrs) ">")

      :mail-link
      (str "<" (:address attrs) ">")

      ;; list items might have nested lists or other elements, which should have their indentation level increased
      (:unordered-list-item :ordered-list-item)
      (let [indented-content (->> (rest resolved-content)
                                  str/join
                                  str/split-lines
                                  (map #(str "    " %))
                                  (str/join "\n"))]
        (if-not (str/blank? indented-content)
          (str (first resolved-content) indented-content "\n")
          joined-content))

      :unordered-list
      (str/join (map #(str "• " %) resolved-content))

      :ordered-list
      (str/join (map-indexed #(str (inc %1) ". " %2) resolved-content))

      ;; Replace images with text that links to source, including alt text if available
      :image
      (let [{:keys [src alt]} attrs]
        (if (str/blank? alt)
          (str "<" src "|[Image]>")
          (str "<" src "|[Image: " alt "]>")))

      :image-ref
      (let [src (-> attrs :reference :attrs :url)
            alt joined-content]
        (if (str/blank? alt)
          (str "<" src "|[Image]>")
          (str "<" src "|[Image: " alt "]>")))

      :html-entity
      (some->> content
               (get @html-entities)
               (:characters))

      joined-content)))

(def ^:private renderer
  "An instance of a Flexmark HTML renderer"
  (delay (.build (HtmlRenderer/builder))))

(defmulti process-markdown
  "Converts a markdown string from a virtual card into a form that can be sent to a channel
  (mrkdwn for Slack; HTML for email)."
  (fn [_markdown channel-type] channel-type))

(defmethod process-markdown :mrkdwn
  [markdown _]
  (-> (.parse ^Parser @parser ^String markdown)
      to-clojure
      ast->mrkdwn
      str/trim))

(defmethod process-markdown :html
  [markdown _]
  (let [ast (.parse ^Parser @parser ^String markdown)]
    (.render ^HtmlRenderer @renderer ^Document ast)))
