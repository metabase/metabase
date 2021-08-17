(ns metabase.pulse.markdown
  (:require [clojure.string :as str])
  (:import [com.vladsch.flexmark.ast
            AutoLink BlockQuote BulletList BulletListItem Code Emphasis FencedCodeBlock HardLineBreak Heading Image
            ImageRef IndentedCodeBlock Link LinkRef MailLink OrderedList OrderedListItem Paragraph Reference
            SoftLineBreak StrongEmphasis Text ThematicBreak]
           com.vladsch.flexmark.parser.Parser
           [com.vladsch.flexmark.util.ast Document Node]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Markdown parsing                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private parser
  "An instance of a Flexmark parser"
  (.build (Parser/builder)))

(def ^:private node-to-tag-mapping
  "Mappings from Flexmark AST nodes to keyword tags"
  {Document          :document
   Paragraph         :paragraph
   ThematicBreak     :horizontal-line
   HardLineBreak     :hard-line-break
   SoftLineBreak     :soft-line-break
   Heading           :heading
   StrongEmphasis    :bold
   Emphasis          :italic
   OrderedList       :ordered-list
   BulletList        :unordered-list
   OrderedListItem   :ordered-list-item
   BulletListItem    :unordered-list-item
   Code              :code
   FencedCodeBlock   :codeblock
   IndentedCodeBlock :codeblock
   BlockQuote        :blockquote
   Link              :link
   Reference         :reference
   LinkRef           :link-ref
   ImageRef          :image-ref
   Image             :image
   AutoLink          :auto-link})

(defn- node-to-tag
  [node]
  (node-to-tag-mapping (type node)))

(defprotocol ASTNode
  "Provides the protocol for the `to-clojure` method. Dispatches on AST node type"
  (to-clojure [this _]))

(defn- convert-children [node source]
  (map #(to-clojure % source) (.getChildren node)))

(extend-protocol ASTNode
  Node
  (to-clojure [this source]
    {:tag     (node-to-tag this)
     :attrs   {}
     :content (convert-children this source)})

  Text
  (to-clojure [this _]
    (str (.getChars this)))

  FencedCodeBlock
  (to-clojure [this source]
    {:tag     (node-to-tag this)
     :attrs   {}
     :content (str (.getContentChars this))})

  IndentedCodeBlock
  (to-clojure [this _]
    {:tag     (node-to-tag this)
     :attrs   {}
     :content (str (.getContentChars this))})

  Link
  (to-clojure [this source]
    {:tag     (node-to-tag this)
     :attrs   {:href (str (.getUrl this))
               :title (not-empty (str (.getTitle this)))}
     :content (convert-children this source)})

  Reference
  (to-clojure [this _]
    {:tag   (node-to-tag this)
     :attrs {:title (not-empty (str (.getTitle this)))
             :label (str (.getReference this))
             :url (str (.getUrl this))}})

  LinkRef
  (to-clojure [this source]
    {:tag     (node-to-tag this)
     :attrs   {:reference (-> (.getDocument this)
                              (.get Parser/REFERENCES)
                              (get (str (.getReference this)))
                              (#(to-clojure % source)))}
     :content (convert-children this source)})

  ImageRef
  (to-clojure [this source]
    {:tag     (node-to-tag this)
     :attrs   {:reference (-> (.getDocument this)
                              (.get Parser/REFERENCES)
                              (get (str (.getReference this)))
                              (#(to-clojure % source)))}
     :content (convert-children this source)})

  Image
  (to-clojure [this _]
    {:tag   (node-to-tag this)
     :attrs {:src (str (.getUrl this))
             :alt (str (.getText this))
             :title (not-empty (str (.getTitle this)))}})

  AutoLink
  (to-clojure [this _]
    {:tag   (node-to-tag this)
     :attrs {:href (str (.getUrl this))}})

  MailLink
  (to-clojure [this _]
    {:tag   (node-to-tag this)
     :attrs {:address (str (.getText this))}})

  nil
  (to-clojure [this _]
    nil))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Slack markup generation                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- escape-markdown
  "Insert zero-width characters before and after certain characters that are escaped in the Markdown,
  to prevent them from being parsed as formatting in Slack."
  [string]
  (-> string
      (str/replace "\\*" "\u00ad*\u00ad")
      (str/replace "\\_" "\u00ad_\u00ad")
      (str/replace "\\`" "\u00ad`\u00ad")
      (str/replace "\\'" "\u00ad'\u00ad")))

(defn- ast->mrkdwn
  "Takes an AST representing Markdown input, and converts it to a mrkdwn string that will render nicely in Slack.

  Primary differences to Markdown:
    * All headers are just rendered as bold text.
    * Ordered and unordered lists are printed in plain text.
    * Inline images are rendered as text that links to the image source, e.g. <image.png|[Image: alt-text]>."
  [{:keys [tag attrs content]}]
  (let [resolved-content (if (string? content)
                           (escape-markdown content)
                           (map #(if (string? %)
                                   (escape-markdown %)
                                   (ast->mrkdwn %))
                                content))
        joined-content   (str/join resolved-content)]
    (case tag
      :document
      joined-content

      :paragraph
      (str joined-content "\n")
      ; joined-content

      :soft-line-break
      " "

      :hard-line-break
      "\n"

      (:heading :bold)
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
      (if (= (:tag (first content)) :image)
        ;; If this is a linked image, add link target on separate line after image placeholder
        (str joined-content "\n(" (:href attrs) ")")
        (str "<" (:href attrs) "|" joined-content ">"))

      ; li tags might have nested lists or other elements, which should have their indentation level increased
      (:unordered-list-item :ordered-list-item)
      (let [content-to-indent (rest resolved-content)
            lines-to-indent   (str/split-lines
                                ;; Treat blank sub-elements as newlines
                               (str/join (map #(if (str/blank? %) "\n" %)
                                              content-to-indent)))
            indented-content  (str/join "\n" (map #(str "    " %) lines-to-indent))]
        (if-not (str/blank? indented-content)
          (str (first resolved-content) indented-content "\n")
          joined-content))

      :unordered-list
      (str/join (map #(str "• " %) resolved-content))

      :ordered-list
      (str/join (map-indexed #(str (inc %1) ". " %2) resolved-content))

      :image
      ;; Replace images with links, including alt text
      (let [{:keys [src alt]} attrs]
        (if (str/blank? alt)
          (str "<" src "|[Image]>")
          (str "<" src "|[Image: " alt "]>")))

      joined-content)))

(defmulti process-markdown
  "Converts a markdown string from a virtual card into a form that can be sent to the provided channel type
  (mrkdwn for Slack; HTML for email)."
  (fn [_markdown channel-type] channel-type))

(defmethod process-markdown :slack
  [markdown _]
  (-> (to-clojure (.parse parser markdown) markdown)
      ast->mrkdwn
      str/trim))

; (defmethod process-markdown :email
;   [markdown _]
;   (md/md-to-html-string markdown))
