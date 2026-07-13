(ns metabase.documents.prose-mirror-markdown
  "Two-way conversion between a document's ProseMirror AST and Metabase-flavored Markdown, plus the
  source-mapped splice that applies string edits to a document without disturbing the blocks they
  don't touch.

  Metabase-flavored Markdown is CommonMark plus the tokens the editor's own nodes already emit as
  text, extended to the layout wrappers the document schema carries:

    {% card id=118 name=\"Revenue\" height=442 %}      a block card embed
    {% entity id=42 model=\"dashboard\" label=\"…\" %}   an inline smart link
    {% columns widths=[50,50] height=442 %}           a flexContainer, one {% column %} per child
    {% column %} … {% /column %}                      a supportingText block, or a lone card embed
    {% /columns %}

  Two node types have no Markdown projection: the metabot prompt block, which is transient by design,
  and any node the schema gains without a token here. Both are dropped from the Markdown, which means
  a full re-parse loses them — but an [[apply-edits]] splice does not, because it only re-parses the
  blocks an edit lands on.

  Block identity is what makes that distinction matter. Blocks carry a stable `_id` attr and comment
  threads anchor to it (`child_target_id`, a plain string with no FK), so a re-created node silently
  orphans its threads. `_id`s never appear in the Markdown: [[apply-edits]] serializes the AST with a
  source map (block node -> character span), locates each `old_str`, re-parses only the blocks whose
  span the match overlaps, and splices those back into the stored AST. Untouched blocks keep their
  nodes, ids, and attrs by construction. Touched blocks get fresh ids, and the `_id`s that went away
  come back in `:orphaned-block-ids` so the caller can name the threads that lost their anchor."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock HardLineBreak Heading
                             HtmlInline Image IndentedCodeBlock Link MailLink OrderedList Paragraph SoftLineBreak
                             StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.ext.gfm.strikethrough Strikethrough StrikethroughExtension)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Node)
   (com.vladsch.flexmark.util.data MutableDataSet)))

(set! *warn-on-reflection* true)

(def ^:private resize-default-height 442)
(def ^:private resize-min-height 280)

(def ^:private id-carrying-types
  "Node types whose `_id` attr anchors comment threads."
  #{"paragraph" "heading" "blockquote" "bulletList" "orderedList" "codeBlock" "cardEmbed" "supportingText"})

(defn- new-id [] (str (random-uuid)))

;;; ---------------------------------------------- AST -> Markdown ------------------------------------------------

(defn- escape-attr
  [s]
  (-> (str s)
      (str/replace "\\" "\\\\")
      (str/replace "\"" "\\\"")))

(defn- escape-text
  "Escape the Markdown syntax a text run could otherwise be read as, including the `{%` that opens a token."
  [s]
  (-> s
      (str/replace #"[\\`*\[\]~<>]" #(str "\\" %))
      ;; `_` is only emphasis at a word boundary, and escaping it inside identifiers makes the projection
      ;; noticeably harder to read
      (str/replace #"(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])" "\\\\_")
      (str/replace "{%" "\\{%")))

(defn- escape-block-start
  "Escape a leading character that would otherwise turn a paragraph into a heading or a list item."
  [s]
  (condp re-find s
    #"^#{1,6}\s"  (str "\\" s)
    #"^[-+]\s"    (str "\\" s)
    #"^\d+[.)]\s" (str/replace-first s #"([.)])" "\\\\$1")
    s))

(defn- code-span
  [s]
  (let [longest (->> (re-seq #"`+" s) (map count) (apply max 0))
        fence   (apply str (repeat (inc longest) "`"))
        pad     (if (or (str/starts-with? s "`") (str/ends-with? s "`")) " " "")]
    (str fence pad s pad fence)))

(def ^:private mark-order
  "The marks a text run can carry, outermost first."
  ["link" "strike" "bold" "italic" "underline" "code"])

(defn- wrap-mark
  [s {:keys [type attrs]}]
  (case type
    "bold"      (str "**" s "**")
    "italic"    (str "*" s "*")
    "strike"    (str "~~" s "~~")
    "underline" (str "<u>" s "</u>")
    "link"      (str "[" s "](" (:href attrs) ")")
    s))

(defn- card-token
  [{:keys [id name]} height]
  (str "{% card id=" id
       (when-not (str/blank? name) (str " name=\"" (escape-attr name) "\""))
       (when height (str " height=" height))
       " %}"))

(defn- entity-token
  [{:keys [entityId model label href]}]
  (str "{% entity id=" entityId " model=\"" model "\""
       (when-not (str/blank? label) (str " label=\"" (escape-attr label) "\""))
       ;; `/` is the schema default and carries nothing; a real href would be lost if an edit re-parsed it
       (when-not (contains? #{nil "" "/"} href) (str " href=\"" href "\""))
       " %}"))

(defn- text-node->markdown
  [{:keys [text marks]}]
  (let [by-type (into {} (map (juxt :type identity)) marks)
        base    (if (by-type "code") (code-span text) (escape-text text))]
    (reduce (fn [s mark-type]
              (if-let [mark (by-type mark-type)]
                (wrap-mark s mark)
                s))
            base
            (reverse (remove #{"code"} mark-order)))))

(defn- merge-text-runs
  "Merge adjacent text nodes that carry the same marks, so a run doesn't come out as `**a****b**`."
  [nodes]
  (reduce (fn [acc node]
            (let [prev (peek acc)]
              (if (and (= "text" (:type node) (:type prev))
                       (= (:marks node) (:marks prev)))
                (conj (pop acc) (update prev :text str (:text node)))
                (conj acc node))))
          []
          nodes))

(defn- inline->markdown
  [nodes]
  (->> (merge-text-runs nodes)
       (map (fn [{:keys [type attrs] :as node}]
              (case type
                "text"      (text-node->markdown node)
                "hardBreak" "\\\n"
                "smartLink" (entity-token attrs)
                ;; the schema has no inline image, so this only happens for content built outside the editor
                "image"     (str "[" (escape-text (or (:alt attrs) "")) "](" (:src attrs) ")")
                "")))
       str/join))

(defn- image-markdown
  [{:keys [src alt title]}]
  (str "![" (escape-text (or alt "")) "](" src
       (when-not (str/blank? title) (str " \"" (escape-attr title) "\""))
       ")"))

(defn- prefix-lines
  [s first-prefix rest-prefix]
  (let [[line & more] (str/split-lines s)]
    (str/join "\n" (cons (str first-prefix line)
                         (map #(if (str/blank? %) "" (str rest-prefix %)) more)))))

(declare block->markdown)

(defn- blocks->markdown
  [nodes]
  (->> nodes (keep block->markdown) (remove str/blank?) (str/join "\n\n")))

(defn- list->markdown
  [{:keys [type attrs content]}]
  (let [ordered? (= "orderedList" type)]
    (->> content
         (map-indexed (fn [i item]
                        (let [marker (if ordered?
                                       (str (+ i (or (:start attrs) 1)) ". ")
                                       "- ")]
                          (prefix-lines (blocks->markdown (:content item))
                                        marker
                                        (apply str (repeat (count marker) " "))))))
         (str/join "\n"))))

(defn- code-block->markdown
  [{:keys [attrs content]}]
  (str "```" (:language attrs) "\n"
       (str/join (map :text content))
       "\n```"))

(defn- column->markdown
  [{:keys [type attrs content] :as node}]
  (str "{% column %}\n"
       (if (= "cardEmbed" type)
         (card-token attrs nil)
         (blocks->markdown (if (= "supportingText" type) content [node])))
       "\n{% /column %}"))

(defn- columns->markdown
  [{:keys [attrs content]} height]
  (str "{% columns"
       (when-let [widths (:columnWidths attrs)] (str " widths=" (json/encode widths)))
       (when height (str " height=" height))
       " %}\n"
       (str/join "\n" (map column->markdown content))
       "\n{% /columns %}"))

(defn- resize->markdown
  "A `resizeNode` is a presentational wrapper: its height rides on the token of the node it wraps."
  [{:keys [attrs content]}]
  (let [height (when (not= resize-default-height (:height attrs)) (:height attrs))
        child  (first content)]
    (case (:type child)
      "cardEmbed"     (card-token (:attrs child) height)
      "flexContainer" (columns->markdown child height)
      nil)))

(defn- block->markdown
  "Markdown for one block node, or nil when the node has no Markdown projection and is dropped."
  [{:keys [type attrs content] :as node}]
  (case type
    "paragraph"      (escape-block-start (inline->markdown content))
    "heading"        (str (apply str (repeat (or (:level attrs) 1) "#")) " " (inline->markdown content))
    "codeBlock"      (code-block->markdown node)
    "blockquote"     (prefix-lines (blocks->markdown content) "> " "> ")
    "bulletList"     (list->markdown node)
    "orderedList"    (list->markdown node)
    "horizontalRule" "---"
    "image"          (image-markdown attrs)
    "cardEmbed"      (card-token attrs nil)
    "resizeNode"     (resize->markdown node)
    "flexContainer"  (columns->markdown node nil)
    "supportingText" (blocks->markdown content)
    nil))

(defn- source-map
  "Serialize the top-level blocks of a document, returning the Markdown and, for each block, the
  character span it occupies (nil for a block the projection drops)."
  [blocks]
  (reduce (fn [{:keys [markdown] :as acc} node]
            (let [chunk (block->markdown node)]
              (if (str/blank? chunk)
                (update acc :spans conj nil)
                (let [sep   (if (str/blank? markdown) "" "\n\n")
                      start (+ (count markdown) (count sep))]
                  (-> acc
                      (assoc :markdown (str markdown sep chunk))
                      (update :spans conj [start (+ start (count chunk))]))))))
          {:markdown "" :spans []}
          blocks))

(defn ast->markdown
  "Render a document's ProseMirror AST as Metabase-flavored Markdown."
  [ast]
  (:markdown (source-map (:content ast))))

;;; ---------------------------------------------- Markdown -> AST ------------------------------------------------

(def ^:private parser
  (let [options (.. (MutableDataSet.)
                    (set Parser/EXTENSIONS [(StrikethroughExtension/create)]))]
    (.build (Parser/builder options))))

(def ^:private card-open-re    #"^\{%\s*card\s+(.*?)\s*%\}$")
(def ^:private columns-open-re #"^\{%\s*columns\s*(.*?)\s*%\}$")
(def ^:private columns-end-re  #"^\{%\s*/columns\s*%\}$")
(def ^:private column-open-re  #"^\{%\s*column\s*%\}$")
(def ^:private column-end-re   #"^\{%\s*/column\s*%\}$")
(def ^:private entity-re       #"(?<!\\)\{%\s*entity\s+([^%]*?)\s*%\}")
(def ^:private attr-re         #"(\w+)=(?:\"((?:[^\"\\]|\\.)*)\"|(\[[^\]]*\])|([^\s\"]+))")
(def ^:private numeric-attrs   #{:id :entityId :height :minHeight})

(defn- parse-attrs
  "Parse a token's `key=value` list. Values are quoted strings, JSON arrays, or bare literals."
  [s]
  (into {}
        (map (fn [[_ k quoted json-array bare]]
               (let [kw    (keyword k)
                     value (cond
                             quoted     (-> quoted (str/replace "\\\"" "\"") (str/replace "\\\\" "\\"))
                             json-array (json/decode json-array)
                             :else      bare)]
                 [kw (if (and (contains? numeric-attrs kw) (string? value) (re-matches #"-?\d+" value))
                       (parse-long value)
                       value)])))
        (re-seq attr-re (or s ""))))

(defn- entity-attrs
  "Attrs for a `smartLink`. The token says `id` — the schema calls it `entityId` — and `href` has a default
  because an agent writing a link knows the entity, not the route to it."
  [token-attrs]
  (merge {:href "/"}
         (set/rename-keys (parse-attrs token-attrs) {:id :entityId})))

(defn- unescape
  [s]
  (str/replace s #"\\([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])" "$1"))

(defn- text->inline
  "Split a raw text run on `{% entity %}` tokens, unescaping what remains around them."
  [^String s marks]
  (let [matcher   (re-matcher entity-re s)
        text-node (fn [t] (when (seq t) {:type "text" :text (unescape t) :marks marks}))]
    (loop [pos 0, out []]
      (if (.find matcher)
        (recur (.end matcher)
               (-> out
                   (conj (text-node (subs s pos (.start matcher))))
                   (conj {:type "smartLink" :attrs (entity-attrs (.group matcher 1))})))
        (conj out (text-node (subs s pos)))))))

(declare flexmark->inline)

(defn- flexmark-inline-node->pm
  [^Node node marks]
  (condp instance? node
    Text           (text->inline (str (.getChars node)) marks)
    StrongEmphasis (flexmark->inline node (conj marks {:type "bold"}))
    Emphasis       (flexmark->inline node (conj marks {:type "italic"}))
    Strikethrough  (flexmark->inline node (conj marks {:type "strike"}))
    Code           [{:type "text" :text (str (.getText ^Code node)) :marks (conj marks {:type "code"})}]
    Link           (flexmark->inline node (conj marks {:type "link" :attrs {:href (str (.getUrl ^Link node))}}))
    AutoLink       (let [url (str (.getUrl ^AutoLink node))]
                     [{:type "text" :text url :marks (conj marks {:type "link" :attrs {:href url}})}])
    MailLink       (let [address (str (.getText ^MailLink node))]
                     [{:type "text" :text address
                       :marks (conj marks {:type "link" :attrs {:href (str "mailto:" address)}})}])
    ;; the schema has no inline image; one that isn't alone in its paragraph becomes a link to the source
    Image          (let [alt (str (.getText ^Image node))
                         src (str (.getUrl ^Image node))]
                     [{:type "text" :text (if (str/blank? alt) src alt)
                       :marks (conj marks {:type "link" :attrs {:href src}})}])
    SoftLineBreak  [{:type "text" :text " " :marks marks}]
    HardLineBreak  [{:type "hardBreak"}]
    ;; escaped characters and entity references arrive as their own leaf nodes
    (if (.hasChildren node)
      (flexmark->inline node marks)
      [{:type "text" :text (unescape (str (.getChars node))) :marks marks}])))

(defn- flexmark->inline
  "Convert the inline children of `node` to ProseMirror inline nodes, carrying `marks` down."
  [^Node node marks]
  (->> (.getChildren node)
       ;; `<u>` has no CommonMark syntax, so underline travels as inline HTML and toggles a mark
       (reduce (fn [{:keys [marks out]} ^Node child]
                 (if (instance? HtmlInline child)
                   (case (u/lower-case-en (str (.getChars child)))
                     "<u>"  {:marks (conj marks {:type "underline"}) :out out}
                     "</u>" {:marks (vec (remove #(= "underline" (:type %)) marks)) :out out}
                     {:marks marks :out out})
                   {:marks marks
                    :out   (into out (flexmark-inline-node->pm child marks))}))
               {:marks (vec marks) :out []})
       :out
       (remove nil?)
       merge-text-runs
       (mapv #(cond-> % (empty? (:marks %)) (dissoc :marks)))))

(defn- with-id
  [{:keys [type] :as node}]
  (cond-> node
    (contains? id-carrying-types type) (assoc-in [:attrs :_id] (new-id))))

(defn- lone-image
  "The single `Image` child of `node`, if that is all it holds — a paragraph of one image is a block image."
  [^Node node]
  (let [children (remove #(instance? SoftLineBreak %) (.getChildren node))]
    (when (and (= 1 (count children)) (instance? Image (first children)))
      (first children))))

(declare flexmark->blocks)

(defn- flexmark-block->pm
  [^Node node]
  (condp instance? node
    Paragraph         (if-let [^Image image (lone-image node)]
                        {:type "image" :attrs {:src   (str (.getUrl image))
                                               :alt   (not-empty (str (.getText image)))
                                               :title (not-empty (str (.getTitle image)))}}
                        (with-id {:type "paragraph" :content (flexmark->inline node [])}))
    Heading           (with-id {:type    "heading"
                                :attrs   {:level (.getLevel ^Heading node)}
                                :content (flexmark->inline node [])})
    BlockQuote        (with-id {:type "blockquote" :content (flexmark->blocks node)})
    BulletList        (with-id {:type    "bulletList"
                                :content (mapv #(hash-map :type "listItem" :content (flexmark->blocks %))
                                               (.getChildren node))})
    OrderedList       (with-id {:type    "orderedList"
                                :attrs   {:start (.getStartNumber ^OrderedList node) :type nil}
                                :content (mapv #(hash-map :type "listItem" :content (flexmark->blocks %))
                                               (.getChildren node))})
    FencedCodeBlock   (with-id {:type    "codeBlock"
                                :attrs   {:language (not-empty (str (.getInfo ^FencedCodeBlock node)))}
                                :content [{:type "text"
                                           :text (str/trimr (str (.getContentChars ^FencedCodeBlock node)))}]})
    IndentedCodeBlock (with-id {:type    "codeBlock"
                                :attrs   {:language nil}
                                :content [{:type "text"
                                           :text (str/trimr (str (.getContentChars ^IndentedCodeBlock node)))}]})
    ThematicBreak     {:type "horizontalRule"}
    nil))

(defn- flexmark->blocks
  [^Node node]
  (into [] (keep flexmark-block->pm) (.getChildren node)))

(defn- markdown->blocks
  [markdown]
  (flexmark->blocks (.parse ^Parser parser ^String markdown)))

;;; The block scanner runs ahead of Flexmark: container and card tokens own whole lines, so they are cut
;;; out first and the Markdown between them is parsed on its own. Fenced code is opaque to the scan.

(declare scan-columns)

(defn- flush-markdown
  [segments lines]
  (if (some (complement str/blank?) lines)
    (conj segments {:kind :markdown :text (str/join "\n" lines)})
    segments))

(defn- scan
  "Scan `lines` into segments until one matches a regex in `terminators`.

  Returns `[segments remaining-lines terminator]`, where `terminator` is the line that stopped the scan
  (nil if the lines ran out)."
  [lines terminators]
  (loop [[line & more] lines, segments [], markdown [], fence nil]
    (let [trimmed (some-> line str/trim)]
      (cond
        (nil? line)
        [(flush-markdown segments markdown) nil nil]

        fence
        (recur more segments (conj markdown line) (when-not (str/starts-with? trimmed fence) fence))

        (re-find #"^(```|~~~)" trimmed)
        (recur more segments (conj markdown line) (subs trimmed 0 3))

        (some #(re-matches % trimmed) terminators)
        [(flush-markdown segments markdown) more trimmed]

        (re-matches card-open-re trimmed)
        (recur more
               (conj (flush-markdown segments markdown)
                     {:kind :card :attrs (parse-attrs (second (re-matches card-open-re trimmed)))})
               []
               nil)

        (re-matches columns-open-re trimmed)
        (let [[segment remaining] (scan-columns more (parse-attrs (second (re-matches columns-open-re trimmed))))]
          (recur remaining (conj (flush-markdown segments markdown) segment) [] nil))

        :else
        (recur more segments (conj markdown line) nil)))))

(defn- scan-columns
  [lines attrs]
  (loop [lines lines, columns []]
    (let [[_ remaining terminator] (scan lines [column-open-re columns-end-re])]
      (if (or (nil? terminator) (re-matches columns-end-re terminator))
        [{:kind :columns :attrs attrs :columns columns} remaining]
        (let [[segments remaining] (scan remaining [column-end-re])]
          (recur remaining (conj columns segments)))))))

(defn- card-embed
  [attrs]
  (with-id {:type "cardEmbed" :attrs {:id (:id attrs) :name (:name attrs)}}))

(defn- resize
  [height content]
  {:type "resizeNode"
   :attrs {:height (or height resize-default-height) :minHeight resize-min-height}
   :content [content]})

(declare segments->blocks)

(defn- column->node
  [segments]
  (if (= [:card] (map :kind segments))
    (card-embed (:attrs (first segments)))
    ;; supportingText holds prose only, so a card or a nested container inside a column is dropped
    (let [blocks (vec (segments->blocks (filter (comp #{:markdown} :kind) segments)))]
      (with-id {:type "supportingText"
                :content (if (seq blocks) blocks [(with-id {:type "paragraph" :content []})])}))))

(defn- segments->blocks
  [segments]
  (mapcat (fn [{:keys [kind attrs text columns]}]
            (case kind
              :markdown (markdown->blocks text)
              :card     [(resize (:height attrs) (card-embed attrs))]
              :columns  [(resize (:height attrs)
                                 {:type "flexContainer"
                                  :attrs {:columnWidths (:widths attrs)}
                                  :content (mapv column->node columns)})]))
          segments))

(defn markdown->ast
  "Parse Metabase-flavored Markdown into a document's ProseMirror AST. Every block that anchors comments
  gets a fresh `_id`."
  [markdown]
  {:type "doc"
   :content (vec (segments->blocks (first (scan (str/split-lines (or markdown "")) []))))})

;;; ------------------------------------------------- Edit splice --------------------------------------------------

(defn- match-offsets
  [^String haystack ^String needle]
  (loop [from 0, offsets []]
    (let [i (.indexOf haystack needle from)]
      (if (neg? i)
        offsets
        (recur (+ i (max 1 (count needle))) (conj offsets i))))))

(defn- touched-range
  "The first and last block whose span the character range `[start end)` overlaps, or nil for a match that
  lands entirely between blocks."
  [spans [start end]]
  (let [hits (keep-indexed (fn [i span]
                             (when (and span (< (first span) end) (< start (second span)))
                               i))
                           spans)]
    (when (seq hits)
      [(first hits) (last hits)])))

(defn- merge-ranges
  "Collapse overlapping block ranges, so two matches inside one block are spliced once."
  [ranges]
  (reduce (fn [merged [start end :as candidate]]
            (let [[prev-start prev-end] (peek merged)]
              (if (and prev-end (<= start prev-end))
                (conj (pop merged) [prev-start (max end prev-end)])
                (conj merged candidate))))
          []
          (sort ranges)))

(defn- block-ids
  [nodes]
  (into #{}
        (comp (mapcat #(tree-seq :content :content %))
              (keep #(get-in % [:attrs :_id])))
        nodes))

(defn- no-match-error
  [old-str]
  (ex-info (tru (str "No match for old_str in the document. It must match the Markdown projection exactly — "
                     "read the document and copy the snippet from what it returned."))
           {:status-code 400 :old_str old-str :matches 0}))

(defn- ambiguous-match-error
  [old-str matches]
  (ex-info (tru (str "old_str matched {0} times but must match exactly once. Extend it with surrounding "
                     "context until it is unique, or pass replace_all to replace every occurrence.")
                matches)
           {:status-code 400 :old_str old-str :matches matches}))

(defn- splice-range
  "Replace the blocks `[first-block last-block]` with what their Markdown re-parses to once the edit is
  applied to it, and collect the `_id`s they took with them."
  [{:keys [blocks orphans markdown spans edit]} [first-block last-block]]
  (let [{:keys [old_str new_str]} edit
        region  (subs markdown (first (spans first-block)) (second (spans last-block)))
        spliced (:content (markdown->ast (str/replace region old_str (str new_str))))]
    {:blocks  (into (into (subvec blocks 0 first-block) spliced)
                    (subvec blocks (inc last-block)))
     :orphans (into orphans (block-ids (subvec blocks first-block (inc last-block))))}))

(defn- apply-edit
  [{:keys [ast orphaned-block-ids]} {:keys [old_str replace_all] :as edit}]
  (let [blocks   (vec (:content ast))
        {:keys [markdown spans]} (source-map blocks)
        offsets  (match-offsets markdown old_str)
        ranges   (->> offsets
                      (keep #(touched-range spans [% (+ % (count old_str))]))
                      merge-ranges)]
    (when (empty? ranges)
      (throw (no-match-error old_str)))
    (when (and (> (count offsets) 1) (not replace_all))
      (throw (ambiguous-match-error old_str (count offsets))))
    ;; back to front, so a splice doesn't shift the block indexes of the ones still to come
    (let [{:keys [blocks orphans]} (reduce #(splice-range (assoc %1 :markdown markdown :spans spans :edit edit) %2)
                                           {:blocks blocks :orphans orphaned-block-ids}
                                           (reverse ranges))]
      {:ast (assoc ast :content blocks)
       :orphaned-block-ids orphans})))

(defn apply-edits
  "Apply `edits` — `[{:old_str :new_str :replace_all}]` — to a document's ProseMirror AST as string
  match-and-replace over its Markdown projection.

  Each `old_str` must match exactly once unless `replace_all` is set; zero or several matches throw a
  teaching error carrying the match count. Only the blocks a match overlaps are re-parsed, so every
  other block keeps its node, its `_id`, and the attrs the projection doesn't express.

  Returns `{:ast ast, :orphaned-block-ids #{…}}` — the `_id`s that the edits re-created or removed, and
  whose comment threads therefore lost their anchor."
  [ast edits]
  (let [result (reduce apply-edit {:ast ast :orphaned-block-ids #{}} edits)]
    ;; an id a later edit re-created out of an earlier one's work never anchored a thread, so it is not an orphan
    (update result :orphaned-block-ids set/intersection (block-ids (:content ast)))))
