(ns metabase.documents.markdown
  "Convert between Metabase-flavored Markdown and the ProseMirror-JSON AST stored in a
  Document's `:document` column.

  Metabase-flavored Markdown is CommonMark (as parsed by flexmark — core spec plus bare-URL
  autolinking; no tables, strikethrough, or task lists, since the document editor's ProseMirror
  schema has no nodes for them) extended with a token vocabulary:

  Leaf tokens — the text forms the editor's own nodes emit via `renderText`:

    {% card id=118 name=\"Revenue by region\" %}   ; block-level cardEmbed (name optional)
    {% entity id=\"42\" model=\"dashboard\" %}      ; inline smartLink (id quoted, per the editor)

  Container tokens — Pandoc-fenced-div-style fences for the layout wrappers, which have no
  client-side text form. `::: <name> {attr=val ...}` on its own line opens a container, a bare
  `:::` line closes the innermost open one:

    ::: resize {height=442 minHeight=280}
    ::: flex {columns=[60,40]}
    ::: supporting
    A paragraph of supporting text.
    :::
    {% card id=118 name=\"Revenue by region\" %}
    :::
    :::

  This grammar is jointly versioned with the Tiptap node specs under
  `frontend/src/metabase/rich_text_editing/tiptap/extensions/` — a frontend change to
  `flexContainer`/`resizeNode`/`supportingText` attrs or content models must update this
  namespace in lockstep; nothing enforces the correspondence automatically.

  `parse` emits the AST in the editor's own normal form: every attribute the schema declares
  is present, marks are in schema rank order, and childless nodes carry no `:content`. The
  document editor compares the JSON it reads against the JSON it would write to decide whether
  a document has unsaved changes, so an AST that merely means the same thing is not enough —
  it has to be byte-identical to what ProseMirror produces. The one attribute out of reach is
  the `class` on a link mark, whose default is a CSS-module class name minted by the frontend
  build: a document containing a Markdown link opens with the editor reporting a change.

  Known lossy edges: strikethrough/underline marks serialize as plain text (no CommonMark
  form the parser could round-trip); literal token text typed into prose is
  indistinguishable from a real token and round-trips into one; a paragraph's leading
  indentation is not preserved (four or more columns would read back as an indented code
  block, so it collapses to at most three spaces, which CommonMark itself absorbs);
  boundary whitespace inside a bold/italic run moves outside the mark; and spaces in link
  hrefs percent-encode to `%20`.

  This namespace takes and returns plain data; it performs no permission checks. The only
  database access is the unchecked display-name/href lookup that `parse` runs for
  `{% entity %}` tokens (mirroring the serdes path in
  [[metabase.documents.models.document]])."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading HtmlBlock HtmlCommentBlock HtmlEntity HtmlInline
                             IndentedCodeBlock Link MailLink OrderedList Paragraph
                             SoftLineBreak StrongEmphasis Text TextBase ThematicBreak)
   (com.vladsch.flexmark.ext.autolink AutolinkExtension)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Block Node)
   (com.vladsch.flexmark.util.data MutableDataSet)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Vocabulary ----------------------------------------------------

;; The node types that carry a `:_id` attr — paragraph, heading, codeBlock, bulletList,
;; orderedList, blockquote, supportingText, cardEmbed — are the ones whose Tiptap extension
;; spreads `createIdAttribute`. Comments anchor to these ids, so they are the units of the
;; source map; `parse` mints one wherever it builds such a node.

(def ^:private transient-types
  "UI-session-scoped scratch nodes (in-progress AI generation); dropped from the Markdown
  projection entirely — no token, no span."
  #{"metabot" "metabot-mention"})

(def ^:private container-types
  #{"resizeNode" "flexContainer" "supportingText"})

(def ^:private resize-node-default-height 442)
(def ^:private resize-node-default-min-height 280)

(defn- mint-id
  []
  (str (random-uuid)))

(defn- teaching-error
  [msg]
  (ex-info msg {:status-code 400}))

;;; ------------------------------------------------ Smart links ---------------------------------------------------

(def ^:private smart-link-model->db-model
  {"card"       :model/Card
   "dataset"    :model/Card
   "metric"     :model/Card
   "dashboard"  :model/Dashboard
   "collection" :model/Collection
   "table"      :model/Table
   "database"   :model/Database
   "document"   :model/Document
   "user"       :model/User})

(defn- smart-link-href
  [model {:keys [id db_id]}]
  (case model
    "card"       (str "/question/" id)
    "dataset"    (str "/model/" id)
    "metric"     (str "/metric/" id)
    "dashboard"  (str "/dashboard/" id)
    "collection" (str "/collection/" id)
    "document"   (str "/document/" id)
    "database"   (str "/browse/databases/" id)
    "table"      (str "/question#?db=" db_id "&table=" id)
    "/"))

(defn- smart-link-label
  [row]
  (or (:display_name row)
      (:name row)
      (:common_name row)
      (not-empty (str/trim (str (:first_name row) " " (:last_name row))))))

(defn- smart-link-rows
  "`{[model id] row}` for every distinct smart-link target among `links`, one query per
  referenced model. Unchecked lookup by design — the caller's own write/read check on the
  *document* gates the operation; a display-name lookup is not a new permission surface."
  [links]
  (into {}
        (mapcat (fn [[model model-links]]
                  (let [db-model (smart-link-model->db-model model)
                        ids      (distinct (map #(get-in % [:attrs :entityId]) model-links))
                        rows     (when db-model
                                   (try
                                     (t2/select db-model :id [:in ids])
                                     (catch Exception e
                                       (log/warnf e "smart link lookup failed for %s" model)
                                       nil)))]
                    (for [row rows]
                      [[model (:id row)] row]))))
        (group-by #(get-in % [:attrs :model]) links)))

(defn- resolve-smart-links
  "Fill `:label`/`:href` on every smartLink node in `content` from its target row. A dangling
  id keeps the node (with default label/href) and logs a warning: bad content, not a parse
  error."
  [content]
  (let [links (->> (tree-seq :content :content {:content content})
                   (filter #(= "smartLink" (:type %))))]
    (if (empty? links)
      content
      (let [rows (smart-link-rows links)]
        (walk/postwalk
         (fn [node]
           (if (and (map? node) (= "smartLink" (:type node)))
             (let [{:keys [entityId model]} (:attrs node)]
               (if-let [row (get rows [model entityId])]
                 (update node :attrs assoc
                         :label (smart-link-label row)
                         :href (smart-link-href model row))
                 (do
                   (when (smart-link-model->db-model model)
                     (log/warnf "smart link target not found for %s at id: %s" model entityId))
                   node)))
             node))
         content)))))

;;; ------------------------------------------------ Token grammar -------------------------------------------------

(def ^:private fence-open-re
  #"[ \t]{0,3}:::[ \t]*(resize|flex|supporting)[ \t]*(?:\{([^}]*)\})?[ \t]*")

(def ^:private fence-close-re
  #"[ \t]{0,3}:::[ \t]*")

;; Token regexes are written to match in linear time with no backtracking over alternation
;; loops — a lazy loop over an alternation recurses per character in the JVM regex engine,
;; and a StackOverflowError from a long unclosed token would bypass every Exception handler.
;; The card regex is greedy to the line's last `%}`; bodies containing another token
;; delimiter are rejected after the match instead of via backtracking.

(def ^:private card-token-line-re
  #"[ \t]{0,3}\{%\s*card\s+(.*)%\}[ \t]*")

(def ^:private entity-token-re
  #"\{%\s*entity\s+([^%{}]{0,500})%\}")

(def ^:private attr-pair-re
  #"([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(\"[^\"\\]*(?:\\.[^\"\\]*)*\"|\[[^\]]*\]|[^\s\"\[]+)")

(def ^:private max-token-attrs-length 2000)

(defn- parse-scalar
  [^String s]
  (cond
    (re-matches #"-?\d{1,18}" s)      (Long/parseLong s)
    (re-matches #"-?\d{1,18}\.\d+" s) (Double/parseDouble s)
    :else                             s))

(defn- parse-attr-value
  [^String v]
  (cond
    (and (str/starts-with? v "\"") (str/ends-with? v "\"") (>= (count v) 2))
    (-> (subs v 1 (dec (count v)))
        (str/replace #"\\([\"\\])" "$1"))

    (and (str/starts-with? v "[") (str/ends-with? v "]"))
    (let [inner (str/trim (subs v 1 (dec (count v))))]
      (if (str/blank? inner)
        []
        (mapv (comp parse-scalar str/trim) (str/split inner #","))))

    :else
    (parse-scalar v)))

(defn- parse-token-attrs
  [attrs-str]
  (let [attrs-str (or attrs-str "")]
    (when (> (count attrs-str) max-token-attrs-length)
      (throw (teaching-error (format "Token attributes exceed %d characters — shorten the token."
                                     max-token-attrs-length))))
    (into {}
          (for [[_ k v] (re-seq attr-pair-re attrs-str)]
            [(keyword k) (parse-attr-value v)]))))

;;; ------------------------------------------------ Parse: block scan ---------------------------------------------

;; Segments are the line-level pre-parse: container fences and block card tokens are ours,
;; everything between them accumulates into chunks handed to flexmark.
;;   {:kind :markdown :text "..."}
;;   {:kind :card :attrs {...}}
;;   {:kind :container :name "flex" :attrs {...} :children [segment ...]}

(defn- flush-markdown
  [segments md-lines]
  (let [text (str/join "\n" md-lines)]
    (cond-> segments
      (not (str/blank? text)) (conj {:kind :markdown :text text}))))

(defn- card-attrs
  [attrs-str]
  (let [{:keys [id name] :as attrs} (parse-token-attrs attrs-str)]
    (when-not (pos-int? id)
      (throw (teaching-error (format "Invalid card token {%% card %s %%} — expected {%% card id=<int> %%} or {%% card id=<int> name=\"…\" %%}."
                                     attrs-str))))
    (when-let [unknown (seq (remove #{:id :name} (keys attrs)))]
      (throw (teaching-error (format "Unknown card token attribute(s) %s — a card token takes id and an optional name."
                                     (str/join ", " (map clojure.core/name unknown))))))
    {:id id :name (when (string? name) name)}))

(defn- card-token-line-body
  "The attr text of a line that is exactly one `{% card … %}` token, else nil. The greedy
  regex captures to the line's last `%}`, so a body containing another token delimiter means
  the line isn't a single card token."
  ^String [^String line]
  (when-let [[_ body] (re-matches card-token-line-re line)]
    (let [body (str/trim body)]
      (when-not (or (str/includes? body "{%") (str/includes? body "%}"))
        body))))

(def ^:private code-fence-re
  #"[ \t]{0,3}(`{3,}|~{3,})(.*)")

(defn- code-fence-open
  "The fence descriptor `{:ch :len}` a line opens, or nil. A backtick fence's info string
  cannot contain a backtick (CommonMark 4.5)."
  [^String line]
  (when-let [[_ fence info] (re-matches code-fence-re line)]
    (when-not (and (str/starts-with? fence "`") (str/includes? info "`"))
      {:ch (first fence) :len (count fence)})))

(defn- code-fence-close?
  [^String line {:keys [ch len]}]
  (boolean
   (when-let [[_ fence] (re-matches #"[ \t]{0,3}(`{3,}|~{3,})[ \t]*" line)]
     (and (= ch (first fence)) (>= (count fence) (long len))))))

(defn- scan-segments
  "Scan `lines` from index `i` into segments. `open-fence` names the container fence being
  filled, or nil at the top level. Lines inside a fenced code block are opaque: token syntax
  there is content, not structure. Returns [segments next-index]."
  [lines i open-fence]
  (loop [i          i
         md-lines   []
         segments   []
         code-fence nil]
    (if (>= i (count lines))
      (if open-fence
        (throw (teaching-error (format "Unclosed ::: %s container — add a closing ::: line." open-fence)))
        [(flush-markdown segments md-lines) i])
      (let [^String line (nth lines i)]
        (cond
          code-fence
          (recur (inc i) (conj md-lines line) segments
                 (when-not (code-fence-close? line code-fence) code-fence))

          (code-fence-open line)
          (recur (inc i) (conj md-lines line) segments (code-fence-open line))

          (re-matches fence-open-re line)
          (let [[_ fence-name attrs-str] (re-matches fence-open-re line)
                [children next-i] (scan-segments lines (inc i) fence-name)]
            (recur next-i
                   []
                   (conj (flush-markdown segments md-lines)
                         {:kind :container :name fence-name :attrs (parse-token-attrs attrs-str)
                          :children children})
                   nil))

          (re-matches fence-close-re line)
          (if open-fence
            [(flush-markdown segments md-lines) (inc i)]
            ;; A stray ::: outside any container is plain text.
            (recur (inc i) (conj md-lines line) segments nil))

          (card-token-line-body line)
          (recur (inc i)
                 []
                 (conj (flush-markdown segments md-lines)
                       {:kind :card :attrs (card-attrs (card-token-line-body line))})
                 nil)

          :else
          (recur (inc i) (conj md-lines line) segments nil))))))

;;; ------------------------------------------------ Parse: flexmark -> AST ----------------------------------------

(def ^:private ^Parser flexmark-parser
  (let [options (.. (MutableDataSet.)
                    (set Parser/EXTENSIONS [(AutolinkExtension/create)]))]
    (.build (Parser/builder options))))

(defn- fm-children
  [^Node node]
  (seq (iterator-seq (.iterator (.getChildren node)))))

(defn- unescape-md
  ^String [^String s]
  (str/replace s #"\\(\p{Punct})" "$1"))

(def ^:private mark-rank
  "ProseMirror sorts a text node's marks by their schema rank when it loads a document
  (`Mark.setFrom`), so marks emitted in any other order describe a different AST than the one
  the editor hands back on the next save. The ranks are the document editor's schema
  registration order — link outranks the rest because the Link extension declares a higher
  extension priority."
  (zipmap ["link" "bold" "code" "italic" "strike" "underline"] (range)))

(defn- text-node
  [s marks]
  (cond-> {:type "text" :text s}
    (seq marks) (assoc :marks (vec (sort-by #(mark-rank (:type %) (count mark-rank)) marks)))))

(defn- mark
  ([type] {:type type})
  ([type attrs] {:type type :attrs attrs}))

(def ^:private link-mark-defaults
  "The `target`/`rel` defaults the editor's Link extension applies to every link mark. Its
  `class` attribute is a build-time CSS-module name and is deliberately left off — it can only
  be filled in by the client."
  {:target "_blank" :rel "noopener noreferrer nofollow"})

(defn- link-mark
  [href]
  (mark "link" (assoc link-mark-defaults :href href)))

(defn- with-content
  "Attach `content` to `node`, omitting the key when there is nothing to attach — ProseMirror's
  own `toJSON` drops `content` on a childless node."
  [node content]
  (cond-> node
    (seq content) (assoc :content (vec content))))

(defn- convert-inline
  "Convert one flexmark inline node to a seq of ProseMirror inline nodes, with `marks`
  accumulated from enclosing emphasis/link nodes."
  [node marks]
  (letfn [(children-with [extra-mark]
            (mapcat #(convert-inline % (conj marks extra-mark)) (fm-children node)))]
    (condp instance? node
      Text           [(text-node (unescape-md (str (.getChars ^Node node))) marks)]
      StrongEmphasis (children-with (mark "bold"))
      Emphasis       (children-with (mark "italic"))
      ;; CommonMark strips one space of padding from a code span that has it on both sides
      ;; (the escape hatch for content with edge backticks); flexmark's getText keeps it.
      Code           [(text-node (let [s (str (.getText ^Code node))]
                                   (if (and (str/starts-with? s " ") (str/ends-with? s " ")
                                            (not (str/blank? s)) (> (count s) 1))
                                     (subs s 1 (dec (count s)))
                                     s))
                                 (conj marks (mark "code")))]
      ;; flexmark keeps backslash escapes in the destination it reports.
      Link           (mapcat #(convert-inline % (conj marks (link-mark (unescape-md (str (.getUrl ^Link node))))))
                             (fm-children node))
      AutoLink       [(text-node (str (.getText ^AutoLink node))
                                 (conj marks (link-mark (str (.getUrl ^AutoLink node)))))]
      MailLink       [(text-node (str (.getText ^MailLink node))
                                 (conj marks (link-mark (str "mailto:" (.getText ^MailLink node)))))]
      SoftLineBreak  [(text-node " " marks)]
      HardLineBreak  [{:type "hardBreak"}]
      HtmlEntity     [(text-node (str (.getChars ^Node node)) marks)]
      HtmlInline     [(text-node (str (.getChars ^Node node)) marks)]
      ;; AutolinkExtension wraps a text run containing a bare URL in a TextBase around
      ;; [Text AutoLink Text] children.
      TextBase       (into [] (mapcat #(convert-inline % marks)) (fm-children node))
      ;; Anything without a ProseMirror counterpart (images, refs, …) keeps its source text.
      [(text-node (str (.getChars ^Node node)) marks)])))

(defn- merge-adjacent-text
  [inlines]
  (reduce (fn [acc {:keys [type text marks] :as node}]
            (let [prev (peek acc)]
              (if (and prev
                       (= type "text") (= (:type prev) "text")
                       (= marks (:marks prev)))
                (conj (pop acc) (assoc prev :text (str (:text prev) text)))
                (conj acc node))))
          []
          inlines))

(defn- entity-token->smart-link
  "Parse the attrs of one `{% entity %}` token match. Returns a smartLink node, or nil when
  the token is malformed / references an unknown model (left as literal text)."
  [attrs-str]
  (let [{:keys [id model]} (parse-token-attrs attrs-str)
        id (if (string? id) (parse-scalar id) id)]
    (when (and (pos-int? id) (contains? smart-link-model->db-model model))
      {:type  "smartLink"
       :attrs {:entityId id :model model :label nil :href "/"}})))

(defn- split-entity-tokens
  [{:keys [text marks] :as node}]
  (let [m (re-matcher entity-token-re text)]
    (loop [out [] last-end 0]
      (if (.find m)
        (if-let [link (entity-token->smart-link (.group m 1))]
          (recur (cond-> out
                   (< last-end (.start m)) (conj (text-node (subs text last-end (.start m)) marks))
                   true                    (conj link))
                 (.end m))
          (recur out last-end))
        (if (zero? last-end)
          [node]
          (cond-> out
            (< last-end (count text)) (conj (text-node (subs text last-end) marks))))))))

(defn- expand-entity-tokens
  [inlines]
  (into []
        (mapcat (fn [{:keys [type text marks] :as node}]
                  (if (and (= type "text")
                           (str/includes? (or text "") "{%")
                           (not-any? #(= "code" (:type %)) marks))
                    (split-entity-tokens node)
                    [node])))
        inlines))

(defn- convert-inlines
  [nodes]
  (-> (into [] (mapcat #(convert-inline % [])) nodes)
      merge-adjacent-text
      expand-entity-tokens
      (->> (remove #(and (= "text" (:type %)) (= "" (:text %))))
           (into []))))

(declare convert-blocks)

(defn- convert-list-item
  [item]
  (with-content {:type "listItem"} (convert-blocks (fm-children item))))

(defn- code-block-text
  ^String [^Block node]
  (str/replace (str (.getContentChars node)) #"\n\z" ""))

(defn- code-block-node
  [node language]
  (with-content {:type  "codeBlock"
                 :attrs {:language language :_id (mint-id)}}
    (let [text (code-block-text node)]
      (when-not (= text "") [{:type "text" :text text}]))))

(defn- convert-block
  [node]
  (condp instance? node
    Paragraph         [(with-content {:type  "paragraph"
                                      :attrs {:_id (mint-id)}}
                         (convert-inlines (fm-children node)))]
    Heading           [(with-content {:type  "heading"
                                      :attrs {:level (.getLevel ^Heading node) :_id (mint-id)}}
                         (convert-inlines (fm-children node)))]
    BulletList        [(with-content {:type  "bulletList"
                                      :attrs {:_id (mint-id)}}
                         (map convert-list-item (fm-children node)))]
    OrderedList       [(with-content {:type  "orderedList"
                                      :attrs {:start (.getStartNumber ^OrderedList node) :type nil :_id (mint-id)}}
                         (map convert-list-item (fm-children node)))]
    BlockQuote        [(with-content {:type  "blockquote"
                                      :attrs {:_id (mint-id)}}
                         (convert-blocks (fm-children node)))]
    FencedCodeBlock   [(code-block-node node (not-empty (first (str/split (str (.getInfo ^FencedCodeBlock node)) #"\s+"))))]
    IndentedCodeBlock [(code-block-node node nil)]
    ThematicBreak     [{:type "horizontalRule"}]
    HtmlBlock         [{:type    "paragraph"
                        :attrs   {:_id (mint-id)}
                        :content [{:type "text" :text (str/trimr (str (.getChars ^Node node)))}]}]
    HtmlCommentBlock  []
    ;; Anything unrecognized flattens to its converted children.
    (convert-blocks (fm-children node))))

(defn- convert-blocks
  [nodes]
  (into [] (mapcat convert-block) nodes))

(defn- markdown-chunk->nodes
  [text]
  (-> (.parse flexmark-parser ^String text)
      fm-children
      convert-blocks))

;;; ------------------------------------------------ Parse: containers ---------------------------------------------

(defn- content-model-error
  [container-type]
  (teaching-error
   (case container-type
     "resizeNode"     "A ::: resize container must wrap exactly one ::: flex container or {% card %} embed."
     "flexContainer"  "A ::: flex container must hold 1-3 columns, each a ::: supporting block or a {% card %} embed."
     "supportingText" "A ::: supporting block can only hold prose blocks (paragraphs, headings, lists, blockquotes, code blocks).")))

(defn- validate-container-content!
  [container-type children]
  (let [types (map :type children)
        ok?   (case container-type
                "resizeNode"     (and (= 1 (count children))
                                      (contains? #{"flexContainer" "cardEmbed"} (first types)))
                "flexContainer"  (and (<= 1 (count children) 3)
                                      (every? #{"supportingText" "cardEmbed"} types))
                "supportingText" (and (seq children)
                                      (every? #{"paragraph" "heading" "bulletList" "orderedList" "blockquote" "codeBlock"}
                                              types)))]
    (when-not ok?
      (throw (content-model-error container-type)))))

(defn- check-known-attrs!
  [fence-name attrs allowed]
  (when-let [unknown (seq (remove allowed (keys attrs)))]
    (throw (teaching-error (format "Unknown ::: %s attribute(s) %s — allowed: %s."
                                   fence-name
                                   (str/join ", " (map name unknown))
                                   (str/join ", " (map name (sort allowed))))))))

(declare segment->nodes)

(defn- container-node
  [{:keys [name attrs children]}]
  (let [child-nodes (into [] (mapcat segment->nodes) children)]
    (case name
      "supporting"
      (do (check-known-attrs! name attrs #{})
          (validate-container-content! "supportingText" child-nodes)
          {:type "supportingText" :attrs {:_id (mint-id)} :content child-nodes})

      "flex"
      (do (check-known-attrs! name attrs #{:columns})
          (validate-container-content! "flexContainer" child-nodes)
          (let [columns (:columns attrs)]
            (when (and (some? columns) (not (and (vector? columns) (every? number? columns))))
              (throw (teaching-error "::: flex columns must be a numeric array, e.g. {columns=[60,40]}.")))
            {:type    "flexContainer"
             :attrs   {:columnWidths columns}
             :content child-nodes}))

      "resize"
      (do (check-known-attrs! name attrs #{:height :minHeight})
          (validate-container-content! "resizeNode" child-nodes)
          (doseq [k [:height :minHeight]]
            (when-let [v (get attrs k)]
              (when-not (number? v)
                (throw (teaching-error (format "::: resize %s must be a number." (clojure.core/name k)))))))
          {:type    "resizeNode"
           :attrs   {:height    (get attrs :height resize-node-default-height)
                     :minHeight (get attrs :minHeight resize-node-default-min-height)}
           :content child-nodes}))))

(defn- segment->nodes
  [{:keys [kind] :as segment}]
  (case kind
    :markdown  (markdown-chunk->nodes (:text segment))
    :card      [{:type  "cardEmbed"
                 :attrs {:id   (get-in segment [:attrs :id])
                         :name (get-in segment [:attrs :name])
                         :_id  (mint-id)}}]
    :container [(container-node segment)]))

(defn- parse-content
  [markdown-string]
  (let [[segments _] (scan-segments (str/split-lines (or markdown-string "")) 0 nil)]
    (resolve-smart-links (into [] (mapcat segment->nodes) segments))))

(defn- wrap-loose-embeds
  "Give every top-level `cardEmbed`/`flexContainer` its `resizeNode` wrapper. A chart's height
  lives on that wrapper and nowhere else — everything inside it is `height: 100%` — so an embed
  sitting directly in the document body renders collapsed to nothing. The editor's own
  insertion paths (`wrapCardEmbed` in
  `frontend/src/metabase/rich_text_editing/tiptap/extensions/shared/layout.ts`, and every drop
  handler) hold the same invariant, which is why an explicit `::: resize` fence is optional in
  the Markdown. Applies at document level only: inside a `::: resize` or `::: flex` the wrapper
  is either already there or forbidden by the container's content model."
  [content]
  (mapv (fn [{:keys [type] :as node}]
          (if (#{"cardEmbed" "flexContainer"} type)
            {:type    "resizeNode"
             :attrs   {:height    resize-node-default-height
                       :minHeight resize-node-default-min-height}
             :content [node]}
            node))
        content))

(defn- ensure-trailing-paragraph
  "A document's last block is always a paragraph. The editor's `trailingNode` plugin appends an
  empty one the moment a document whose last block is anything else is loaded (see
  `@tiptap/extensions`, configured through `CustomStarterKit`), so a document stored without one
  is rewritten on open and shows up as unsaved changes nobody made. Also floors an empty
  document to a single paragraph, which `doc`'s `block+` content model requires."
  [content]
  (cond-> content
    (not= "paragraph" (:type (peek content)))
    (conj {:type "paragraph" :attrs {:_id (mint-id)}})))

(defn parse
  "Metabase-flavored Markdown string -> ProseMirror AST map, i.e. the value that goes in a
  Document's `:document` column: `{:type \"doc\" :content [...]}`. Mints a fresh `:_id` on
  every node type that carries one, wraps a bare top-level card embed or flex container in
  the `resizeNode` that gives it a height, and closes the body with a paragraph. Malformed
  structure (unclosed fences, invalid container content, bad card tokens) throws a 400 `ex-info`
  whose message names the fix; a smart-link id that doesn't resolve keeps the node and logs a
  warning instead."
  [markdown-string]
  {:type    "doc"
   :content (-> (parse-content markdown-string) wrap-loose-embeds ensure-trailing-paragraph)})

;;; ------------------------------------------------ Serialize: inline ---------------------------------------------

(defn- escape-inline
  ^String [^String s]
  (str/replace s #"([\\*_`\[\]])" "\\\\$1"))

(defn- escape-line-start
  "Escape a leading character that would otherwise start a block construct (heading, list,
  blockquote, fence, thematic break) when this paragraph line is re-parsed. Leading
  indentation of four or more columns (or any tab) would read as an indented code block, so
  it collapses to three spaces."
  ^String [^String line]
  (let [[_ ws body] (re-matches #"([ \t]*)(.*)" line)
        ws (if (or (str/includes? ws "\t") (>= (count ws) 4)) "   " ws)]
    (cond
      (nil? body) line

      (re-find #"^(#{1,6}([ \t]|$)|>|[-+]([ \t]|$)|:::|~~~|=+[ \t]*$|-+[ \t]*$)" body)
      (str ws "\\" body)

      (re-find #"^\d{1,9}[.)]([ \t]|$)" body)
      (let [[_ digits delim tail] (re-matches #"(\d{1,9})([.)])(.*)" body)]
        (str ws digits "\\" delim tail))

      :else (str ws body))))

(defn- escape-block-starts
  ^String [^String s]
  (str/join "\n" (map escape-line-start (str/split s #"\n" -1))))

(defn- code-span
  "Wrap `s` in a backtick run longer than any run it contains, space-padded when the content
  has edge backticks or symmetric edge spaces (CommonMark strips one pad space from each
  side on parse)."
  ^String [^String s]
  (let [longest (transduce (map count) max 0 (re-seq #"`+" s))
        delim   (apply str (repeat (inc longest) "`"))
        pad     (when (or (str/starts-with? s "`") (str/ends-with? s "`")
                          (and (str/starts-with? s " ") (str/ends-with? s " ") (not (str/blank? s))))
                  " ")]
    (str delim pad s pad delim)))

(defn- split-boundary-whitespace
  "[leading-ws core trailing-ws] of `s` — emphasis delimiters must hug non-whitespace."
  [^String s]
  (let [len   (count s)
        start (loop [i 0]
                (if (and (< i len) (Character/isWhitespace (.charAt s i)))
                  (recur (inc i))
                  i))
        end   (loop [i len]
                (if (and (> i start) (Character/isWhitespace (.charAt s (dec i))))
                  (recur (dec i))
                  i))]
    [(subs s 0 start) (subs s start end) (subs s end)]))

(defn- link-destination
  "A bare CommonMark link destination for `href`: parens and backslashes are
  backslash-escaped (undone by the parser's unescape), whitespace is percent-encoded —
  flexmark accepts neither raw nor angle-bracketed spaces in a destination."
  ^String [href]
  (-> (str href)
      (str/replace "\\" "\\\\")
      (str/replace "(" "\\(")
      (str/replace ")" "\\)")
      (str/replace "<" "\\<")
      (str/replace ">" "\\>")
      (str/replace " " "%20")
      (str/replace "\t" "%09")
      (str/replace "\r" "%0D")
      (str/replace "\n" "%0A")))

(defn- has-mark?
  [marks type]
  (boolean (some #(= type (:type %)) marks)))

(defn- mark-attrs
  [marks type]
  (some #(when (= type (:type %)) (:attrs %)) marks))

(defn- attr-num
  "Coerce a node attribute that must serialize as a number. REST accepts `[:document :any]`,
  so stored attrs can be strings; numeric-looking strings coerce, anything else is a
  teaching error rather than a ClassCastException."
  [node-type attr v]
  (let [v (if (and (string? v) (re-matches #"-?\d{1,18}(\.\d+)?" v))
            (parse-scalar v)
            v)]
    (if (number? v)
      v
      (throw (teaching-error (format "Cannot serialize %s node: attribute %s is %s, expected a number."
                                     node-type (name attr) (pr-str v)))))))

(defn- attr-pos-long
  [node-type attr v]
  (let [n (attr-num node-type attr v)
        l (long n)]
    (when-not (and (== n l) (pos? l))
      (throw (teaching-error (format "Cannot serialize %s node: attribute %s is %s, expected a positive integer."
                                     node-type (name attr) (pr-str v)))))
    l))

(defn- entity-token
  ^String [{:keys [entityId model]}]
  (when-not (and (string? model) (not (str/blank? model)))
    (throw (teaching-error (format "Cannot serialize smartLink node: model %s is not a string." (pr-str model)))))
  (format "{%% entity id=\"%d\" model=\"%s\" %%}" (attr-pos-long "smartLink" :entityId entityId) model))

(defn- escape-card-name
  ^String [^String card-name]
  (-> card-name
      (str/replace "\\" "\\\\")
      (str/replace "\"" "\\\"")
      (str/replace #"\R" " ")))

(defn- card-token
  ^String [{:keys [id name]}]
  (let [id (attr-pos-long "cardEmbed" :id id)]
    (if (and (string? name) (not (str/blank? name)))
      (format "{%% card id=%d name=\"%s\" %%}" id (escape-card-name name))
      (format "{%% card id=%d %%}" id))))

(defn- marked-text
  "One text node's Markdown. Emphasis delimiters cannot touch whitespace (CommonMark
  flanking), so boundary whitespace moves outside them; whole-whitespace text drops its
  emphasis. Code content keeps its whitespace — [[code-span]] pads instead."
  ^String [{:keys [text marks]}]
  (let [text      (or text "")
        code?     (has-mark? marks "code")
        italic?   (has-mark? marks "italic")
        bold?     (has-mark? marks "bold")
        [lead core trail] (if (and (or italic? bold?) (not code?))
                            (split-boundary-whitespace text)
                            ["" text ""])
        body      (if (= core "")
                    (escape-inline text)
                    (let [s (if code? (code-span core) (escape-inline core))
                          s (cond-> s
                              italic? (as-> t (str "*" t "*"))
                              bold?   (as-> t (str "**" t "**")))]
                      (str lead s trail)))]
    (if-let [{:keys [href]} (mark-attrs marks "link")]
      (str "[" body "](" (link-destination href) ")")
      body)))

(defn- inline->markdown
  (^String [node]
   (inline->markdown node nil))
  (^String [{:keys [type attrs] :as node} {:keys [hard-break] :or {hard-break "\\\n"}}]
   (case type
     "text"            (marked-text node)
     "hardBreak"       hard-break
     "smartLink"       (entity-token attrs)
     "metabot-mention" ""
     (throw (ex-info (format "Cannot serialize unknown inline node type %s to Markdown." (pr-str type))
                     {:status-code 400 :node-type type})))))

(defn- inlines->markdown
  (^String [content]
   (inlines->markdown content nil))
  (^String [content opts]
   (apply str (map #(inline->markdown % opts) content))))

;;; ------------------------------------------------ Serialize: blocks ---------------------------------------------

;; ctx is {:sb StringBuilder, :spans volatile-vector-or-nil, :record? bool}. Emission returns
;; an extent {:node …, :start …, :end …, :children …} per block: char offsets into the buffer,
;; end exclusive. :children extents are kept only for container nodes, whose fenced content is
;; emitted verbatim — the recursion path `splice` may descend. Blockquote and list content is
;; re-rendered with line prefixes, so descendant offsets there would be meaningless: those
;; subtrees are rendered through a fresh non-recording context and get no nested extents.

(declare emit-blocks!)

(defn- render-blocks
  ^String [nodes]
  (let [sb (StringBuilder.)]
    (emit-blocks! {:sb sb :spans nil :record? false} nodes)
    (.toString sb)))

(defn- prefix-quote
  ^String [^String s]
  (->> (str/split s #"\n" -1)
       (map #(if (str/blank? %) ">" (str "> " %)))
       (str/join "\n")))

(defn- prefix-list-item
  ^String [^String marker ^String body]
  (let [indent (apply str (repeat (count marker) " "))
        lines  (str/split body #"\n" -1)]
    (str marker
         (first lines)
         (when (next lines)
           (str "\n" (str/join "\n" (map #(if (str/blank? %) "" (str indent %)) (rest lines))))))))

(defn- format-number
  ^String [n]
  (let [d (double n)]
    (if (== d (Math/rint d))
      (str (long d))
      (str d))))

(defn- code-fence-for
  ^String [^String text]
  (let [longest (transduce (map count) max 0 (re-seq #"`+" text))]
    (apply str (repeat (max 3 (inc longest)) "`"))))

(defn- resize-fence
  ^String [{:keys [height minHeight]}]
  (format "::: resize {height=%s minHeight=%s}"
          (format-number (attr-num "resizeNode" :height (or height resize-node-default-height)))
          (format-number (attr-num "resizeNode" :minHeight (or minHeight resize-node-default-min-height)))))

(defn- flex-fence
  ^String [{:keys [columnWidths]}]
  (if (seq columnWidths)
    (format "::: flex {columns=[%s]}"
            (str/join "," (map #(format-number (attr-num "flexContainer" :columnWidths %)) columnWidths)))
    "::: flex"))

(defn- block-body
  "The Markdown text of a leaf (non-container) block node, or nil when the node type is not a
  leaf block handled inline here."
  [{:keys [type attrs content] :as _node}]
  (case type
    "paragraph"      (escape-block-starts (inlines->markdown content))
    ;; A heading is a single ATX line: hard breaks render as spaces, and a trailing hash run
    ;; is escaped so re-parsing doesn't strip it as a closing sequence.
    "heading"        (str (apply str (repeat (max 1 (long (attr-num "heading" :level (or (:level attrs) 1)))) "#"))
                          " "
                          (str/replace (inlines->markdown content {:hard-break " "})
                                       #"(^|[ \t])(#+[ \t]*)$"
                                       "$1\\\\$2"))
    "codeBlock"      (let [text  (apply str (map :text content))
                           fence (code-fence-for text)]
                       (str fence (or (:language attrs) "") "\n"
                            (when-not (= text "") (str text "\n"))
                            fence))
    "blockquote"     (prefix-quote (render-blocks content))
    "bulletList"     (->> content
                          (map #(prefix-list-item "- " (render-blocks (:content %))))
                          (str/join "\n"))
    "orderedList"    (let [start (long (attr-num "orderedList" :start (or (:start attrs) 1)))]
                       (->> content
                            (map-indexed (fn [i item]
                                           (prefix-list-item (str (+ start i) ". ")
                                                             (render-blocks (:content item)))))
                            (str/join "\n")))
    "horizontalRule" "---"
    "cardEmbed"      (card-token attrs)
    nil))

(defn- record-span!
  [{:keys [spans record?]} node start end]
  (when (and record? spans)
    (when-let [id (get-in node [:attrs :_id])]
      (vswap! spans conj {:node-id id :start start :end end}))))

(defn- emit-block!
  "Append `node`'s Markdown to the buffer; returns its extent."
  [{:keys [^StringBuilder sb] :as ctx} {:keys [type attrs content] :as node}]
  (let [start (.length sb)
        child-extents
        (if (container-types type)
          (do (.append sb ^String (case type
                                    "resizeNode"     (resize-fence attrs)
                                    "flexContainer"  (flex-fence attrs)
                                    "supportingText" "::: supporting"))
              (.append sb "\n")
              (let [extents (emit-blocks! ctx content)]
                (.append sb "\n:::")
                extents))
          (if-let [body (block-body node)]
            (do (.append sb ^String body) nil)
            (throw (ex-info (format "Cannot serialize unknown block node type %s to Markdown." (pr-str type))
                            {:status-code 400 :node-type type}))))
        end (.length sb)]
    (record-span! ctx node start end)
    {:node node :start start :end end :children child-extents}))

(def ^:private list-block-types #{"bulletList" "orderedList"})

(defn- emit-blocks!
  "Append `nodes` (block siblings) separated by blank lines; returns their extents, index-aligned
  with `nodes`. Adjacent lists of the same type additionally get an HTML-comment separator (a
  blank line alone would merge them into one list on re-parse; the comment drops out of the
  parsed AST). Transient metabot nodes emit nothing and get an empty extent at their position."
  [{:keys [^StringBuilder sb] :as ctx} nodes]
  (loop [nodes (seq nodes), prev-type nil, extents []]
    (if-not nodes
      extents
      (let [{:keys [type] :as node} (first nodes)]
        (if (transient-types type)
          (recur (next nodes) prev-type
                 (conj extents {:node node :start (.length sb) :end (.length sb) :children nil}))
          (do (when prev-type
                (.append sb ^String (if (and (= prev-type type) (list-block-types type))
                                      "\n\n<!-- -->\n\n"
                                      "\n\n")))
              (recur (next nodes) type (conj extents (emit-block! ctx node)))))))))

(defn- serialize*
  [ast]
  (let [sb      (StringBuilder.)
        spans   (volatile! [])
        extents (emit-blocks! {:sb sb :spans spans :record? true} (:content ast))]
    {:markdown (.toString sb)
     :spans    (vec (sort-by (juxt :start (comp - :end)) @spans))
     :extents  extents}))

(defn serialize
  "ProseMirror AST -> `{:markdown string, :spans [{:node-id string, :start int, :end int} …]}`.
  `:spans` covers every node carrying an `:_id` whose text appears verbatim in `:markdown`
  (blocks nested inside blockquotes/lists are re-rendered with line prefixes and are covered
  by their outermost block's span instead), in document order; offsets are character indexes,
  end exclusive. Deterministic: the same AST always serializes to the same string, which is
  what makes untouched-node reuse in [[splice]] well-defined. Transient metabot nodes are
  skipped entirely — no token, no span.

  The namespaced `::extents`/`::ast` keys are a fast path for [[splice]]: when handed the
  serialization of the very AST being spliced, it reuses these instead of re-serializing."
  [ast]
  (let [{:keys [markdown spans extents]} (serialize* ast)]
    {:markdown  markdown
     :spans     spans
     ::markdown markdown
     ::extents  extents
     ::ast      ast}))

;;; --------------------------------------------- Node reconciliation ----------------------------------------------

(def ^:private convertible-block-types
  "Block types the editor turns into one another in place. Tiptap's input rules, `setNode` and
  the list toggles rewrite the node while keeping its attrs, so typing `## ` in front of a
  paragraph leaves the block's `:_id` — and any comment anchored to it — intact. Reconciliation
  treats a change within this set as the same block; every other type matches only its own kind,
  so a comment on a chart can never migrate onto prose."
  #{"paragraph" "heading" "blockquote" "bulletList" "orderedList" "codeBlock"})

(def ^:private block-content-types
  "Node types whose `:content` holds block nodes rather than inline content. Reconciliation
  recurses through these to reach nested ids: a paragraph inside a blockquote or a list item is
  an anchor target in its own right."
  #{"blockquote" "listItem" "bulletList" "orderedList" "supportingText" "flexContainer" "resizeNode"})

(defn- node-key
  "Content-identity key for a block: its type plus its canonical Markdown. Equal keys mean the
  two nodes are byte-identical in the projection, which is what makes a block the edit didn't
  touch recognisable wherever it moved to. A `listItem` has no standalone rendering — its marker
  belongs to the parent list — so it is keyed by its children's text."
  [{:keys [type content] :as node}]
  [type (render-blocks (if (= "listItem" type) content [node]))])

(defn- lcs-pairs
  "Index pairs `[i j]` of a longest common subsequence of `a` and `b`, ascending. Ties resolve
  toward advancing `a`, making the alignment a pure function of the two vectors."
  [a b]
  (let [n  (count a)
        m  (count b)
        ;; dp[i][j] = length of the LCS of a[i:] and b[j:]; row n and column m are the zero base.
        dp (reduce (fn [dp i]
                     (assoc dp i
                            (reduce (fn [row j]
                                      (assoc row j
                                             (if (= (nth a i) (nth b j))
                                               (inc (long (get-in dp [(inc i) (inc j)])))
                                               (max (long (get-in dp [(inc i) j]))
                                                    (long (get row (inc j)))))))
                                    (vec (repeat (inc m) 0))
                                    (range (dec m) -1 -1))))
                   (vec (repeat (inc n) (vec (repeat (inc m) 0))))
                   (range (dec n) -1 -1))]
    (loop [i 0, j 0, acc []]
      (cond
        (or (= i n) (= j m))
        acc

        (= (nth a i) (nth b j))
        (recur (inc i) (inc j) (conj acc [i j]))

        (>= (long (get-in dp [(inc i) j])) (long (get-in dp [i (inc j)])))
        (recur (inc i) j acc)

        :else
        (recur i (inc j) acc)))))

(defn- align
  "Pairs `[old-index new-index]` matching `old-nodes` to `new-nodes`. Blocks the edit left alone
  match on content wherever they moved; the runs between those anchors pair up head-first, which
  is how ProseMirror resolves the ambiguous cases — a split leaves the id on the first of the two
  halves, a merge keeps the head block's id and drops the tail's."
  [old-nodes new-nodes]
  (let [anchors (lcs-pairs (mapv node-key old-nodes) (mapv node-key new-nodes))]
    (loop [oi 0, ni 0, anchors (seq anchors), acc []]
      (let [[ao an] (first anchors)
            o-stop  (or ao (count old-nodes))
            n-stop  (or an (count new-nodes))
            acc     (into acc
                          (map (fn [k] [(+ oi k) (+ ni k)]))
                          (range (min (- o-stop oi) (- n-stop ni))))]
        (if anchors
          (recur (inc (long ao)) (inc (long an)) (next anchors) (conj acc [ao an]))
          acc)))))

(defn- same-block?
  [old new]
  (let [ot (:type old)
        nt (:type new)]
    (or (= ot nt)
        (and (convertible-block-types ot) (convertible-block-types nt)))))

(defn- carry-id
  [new-node old-node]
  (let [id (get-in old-node [:attrs :_id])]
    (cond-> new-node
      (and id (contains? (:attrs new-node) :_id)) (assoc-in [:attrs :_id] id))))

(defn- reconcile-ids
  "Give freshly parsed `new-nodes` the `:_id`s of the `old-nodes` they replace, so a block whose
  text an edit rewrote keeps the identity its comments anchor to — the same guarantee the editor
  gives, where a node survives its own text changing. Follows [[align]]'s pairs and recurses
  through nested block content. A new node with no counterpart keeps the id [[parse]] minted for
  it, and an old id with no counterpart is dropped: that block is genuinely gone."
  [old-nodes new-nodes]
  (let [old (vec old-nodes)
        new (vec new-nodes)]
    (reduce (fn [acc [oi ni]]
              (let [o (nth old oi)
                    n (nth acc ni)]
                (if-not (same-block? o n)
                  acc
                  (assoc acc ni
                         (cond-> (carry-id n o)
                           (and (block-content-types (:type n)) (seq (:content n)))
                           (update :content #(reconcile-ids (:content o) %)))))))
            new
            (align old new))))

;;; ------------------------------------------------ Splice --------------------------------------------------------

(defn- touched-range
  "Indexes [i j] of the extents overlapping [s e), or nil when the span falls entirely between
  siblings. An insertion point (s = e) touching a block boundary belongs to that block."
  [extents s e]
  (if (= s e)
    (when-let [i (first (keep-indexed (fn [i {:keys [start end]}]
                                        (when (<= start s end) i))
                                      extents))]
      [i i])
    (let [is (keep-indexed (fn [i {:keys [start end]}]
                             (when (if (= start end)
                                     (and (< s start) (> e start))
                                     (and (< s end) (> e start)))
                               i))
                           extents)]
      (when (seq is)
        [(first is) (last is)]))))

(defn- insertion-index
  [extents pos]
  (or (first (keep-indexed (fn [i {:keys [start]}] (when (>= start pos) i)) extents))
      (count extents)))

(defn- validate-spliced!
  [parent-type children]
  (when (container-types parent-type)
    (validate-container-content! parent-type children)))

(defn- splice-level
  "Splice [s e) -> `replacement` into the children `nodes` (extents index-aligned). Descends
  into a single touched container when the span fits inside its children region; otherwise
  re-parses the touched sibling run and reuses every other sibling untouched."
  [nodes extents ^String markdown s e replacement parent-type]
  (let [nodes (vec nodes)
        [i j] (touched-range extents s e)]
    (cond
      (nil? i)
      (if (= s e)
        (let [idx      (insertion-index extents s)
              inserted (parse-content replacement)
              result   (into (into (subvec nodes 0 idx) inserted) (subvec nodes idx))]
          (validate-spliced! parent-type result)
          result)
        ;; The span deletes separator text between two siblings: both get re-parsed together.
        (let [idx (insertion-index extents e)
              i   (max 0 (dec idx))
              j   (min (dec (count nodes)) idx)]
          (recur nodes extents markdown
                 (:start (nth extents i)) (:end (nth extents j))
                 (str (subs markdown (:start (nth extents i)) s)
                      replacement
                      (subs markdown e (:end (nth extents j))))
                 parent-type)))

      ;; A single touched container whose children region contains the whole span: descend, so
      ;; the edit re-parses the innermost siblings and everything else keeps its identity.
      (and (= i j)
           (container-types (:type (nth nodes i)))
           (seq (:children (nth extents i)))
           (>= s (:start (first (:children (nth extents i)))))
           (<= e (:end (last (:children (nth extents i))))))
      (let [node (nth nodes i)]
        (assoc nodes i
               (assoc node :content
                      (splice-level (:content node) (:children (nth extents i))
                                    markdown s e replacement (:type node)))))

      :else
      ;; The edit span may spill past the touched blocks into separator whitespace on either
      ;; side; widen the re-parsed region to cover it so the substring arithmetic stays valid.
      (let [region-start (min s (:start (nth extents i)))
            region-end   (max e (:end (nth extents j)))
            new-text     (str (subs markdown region-start s)
                              replacement
                              (subs markdown e region-end))
            new-nodes    (reconcile-ids (subvec nodes i (inc j)) (parse-content new-text))
            result       (into (into (subvec nodes 0 i) new-nodes) (subvec nodes (inc j)))]
        (validate-spliced! parent-type result)
        result))))

(defn splice
  "`old-ast`, the `{:markdown :spans}` from a prior [[serialize]] call on `old-ast`, a character
  span [start end) to replace, and the replacement text -> new AST.

  Finds the minimal children array whose combined span contains [start end), recursing into
  layout containers as needed. Every sibling whose own text doesn't overlap the span is reused
  by identity from `old-ast` — same `:_id`, same attrs, same nested content. The overlapping
  sibling(s) have their serialized text, with the edit applied, re-parsed via [[parse]], and
  [[reconcile-ids]] then carries the old nodes' `:_id`s onto the parsed result, so editing a
  block's text preserves the identity its comments anchor to. Throws a 400 `ex-info`
  when `markdown` doesn't match `old-ast`'s serialization (a stale source map), when the span
  is out of bounds, or when the re-parsed result violates a container's content model."
  [old-ast {:keys [markdown] ::keys [extents ast] trusted-markdown ::markdown} start end replacement-text]
  (let [{fresh-markdown :markdown extents :extents}
        (if (and extents trusted-markdown (identical? ast old-ast))
          {:markdown trusted-markdown :extents extents}
          (serialize* old-ast))]
    (when (not= fresh-markdown markdown)
      (throw (teaching-error "The provided markdown doesn't match the document's current serialization — re-serialize and retry.")))
    (when-not (and (int? start) (int? end) (<= 0 start end (count fresh-markdown)))
      (throw (teaching-error (format "Invalid splice span [%s %s) for a %d-character document."
                                     start end (count fresh-markdown)))))
    (assoc old-ast :content
           (-> (splice-level (:content old-ast) extents fresh-markdown
                             start end (or replacement-text "") "doc")
               wrap-loose-embeds
               ensure-trailing-paragraph))))
