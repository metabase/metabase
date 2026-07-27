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

  Known lossy edges: strikethrough/underline marks serialize as plain text (no CommonMark
  form the parser could round-trip), and literal token text typed into prose is
  indistinguishable from a real token and round-trips into one.

  This namespace takes and returns plain data; it performs no permission checks. The only
  database access is the unchecked display-name/href lookup that `parse` runs for
  `{% entity %}` tokens (mirroring the serdes path in
  [[metabase.documents.models.document]])."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading HtmlBlock HtmlCommentBlock HtmlEntity HtmlInline
                             IndentedCodeBlock Link MailLink OrderedList Paragraph
                             SoftLineBreak StrongEmphasis Text ThematicBreak)
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

(defn- resolve-smart-link-attrs
  "Fill `:label`/`:href` for a smart link from the target row. Unchecked lookup by design —
  the caller's own write/read check on the *document* gates the operation; a display-name
  lookup is not a new permission surface. A dangling id keeps the node (with default
  label/href) and logs a warning: bad content, not a parse error."
  [{:keys [entityId model] :as attrs}]
  (let [db-model (smart-link-model->db-model model)
        row      (when db-model
                   (try
                     (t2/select-one db-model :id entityId)
                     (catch Exception e
                       (log/warnf e "smart link lookup failed for %s at id: %s" model entityId)
                       nil)))]
    (if row
      (assoc attrs :label (smart-link-label row) :href (smart-link-href model row))
      (do
        (when db-model
          (log/warnf "smart link target not found for %s at id: %s" model entityId))
        attrs))))

;;; ------------------------------------------------ Token grammar -------------------------------------------------

(def ^:private fence-open-re
  #"[ \t]{0,3}:::[ \t]*(resize|flex|supporting)[ \t]*(?:\{([^}]*)\})?[ \t]*")

(def ^:private fence-close-re
  #"[ \t]{0,3}:::[ \t]*")

(def ^:private card-token-line-re
  #"[ \t]{0,3}\{%\s*card\s+((?:\"(?:[^\"\\]|\\.)*\"|[^%}\"])*?)\s*%\}[ \t]*")

(def ^:private entity-token-re
  #"\{%\s*entity\s+((?:\"(?:[^\"\\]|\\.)*\"|[^%}\"])*?)\s*%\}")

(def ^:private attr-pair-re
  #"([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(\"(?:[^\"\\]|\\.)*\"|\[[^\]]*\]|[^\s\"\[]+)")

(defn- parse-scalar
  [^String s]
  (cond
    (re-matches #"-?\d+" s)        (Long/parseLong s)
    (re-matches #"-?\d+\.\d+" s)   (Double/parseDouble s)
    :else                          s))

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
  (into {}
        (for [[_ k v] (re-seq attr-pair-re (or attrs-str ""))]
          [(keyword k) (parse-attr-value v)])))

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

(defn- scan-segments
  "Scan `lines` from index `i` into segments. `open-fence` names the container fence being
  filled, or nil at the top level. Returns [segments next-index]."
  [lines i open-fence]
  (loop [i        i
         md-lines []
         segments []]
    (if (>= i (count lines))
      (if open-fence
        (throw (teaching-error (format "Unclosed ::: %s container — add a closing ::: line." open-fence)))
        [(flush-markdown segments md-lines) i])
      (let [^String line (nth lines i)]
        (cond
          (re-matches fence-open-re line)
          (let [[_ fence-name attrs-str] (re-matches fence-open-re line)
                [children next-i] (scan-segments lines (inc i) fence-name)]
            (recur next-i
                   []
                   (conj (flush-markdown segments md-lines)
                         {:kind :container :name fence-name :attrs (parse-token-attrs attrs-str)
                          :children children})))

          (re-matches fence-close-re line)
          (if open-fence
            [(flush-markdown segments md-lines) (inc i)]
            ;; A stray ::: outside any container is plain text.
            (recur (inc i) (conj md-lines line) segments))

          (re-matches card-token-line-re line)
          (let [[_ attrs-str] (re-matches card-token-line-re line)]
            (recur (inc i)
                   []
                   (conj (flush-markdown segments md-lines)
                         {:kind :card :attrs (card-attrs attrs-str)})))

          :else
          (recur (inc i) (conj md-lines line) segments))))))

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

(defn- text-node
  [s marks]
  (cond-> {:type "text" :text s}
    (seq marks) (assoc :marks marks)))

(defn- mark
  ([type] {:type type})
  ([type attrs] {:type type :attrs attrs}))

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
      Link           (mapcat #(convert-inline % (conj marks (mark "link" {:href (str (.getUrl ^Link node))})))
                             (fm-children node))
      AutoLink       [(text-node (str (.getText ^AutoLink node))
                                 (conj marks (mark "link" {:href (str (.getUrl ^AutoLink node))})))]
      MailLink       [(text-node (str (.getText ^MailLink node))
                                 (conj marks (mark "link" {:href (str "mailto:" (.getText ^MailLink node))})))]
      SoftLineBreak  [(text-node " " marks)]
      HardLineBreak  [{:type "hardBreak"}]
      HtmlEntity     [(text-node (str (.getChars ^Node node)) marks)]
      HtmlInline     [(text-node (str (.getChars ^Node node)) marks)]
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
       :attrs (resolve-smart-link-attrs {:entityId id :model model :label nil :href "/"})})))

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
  {:type    "listItem"
   :content (convert-blocks (fm-children item))})

(defn- code-block-text
  ^String [^Block node]
  (str/replace (str (.getContentChars node)) #"\n\z" ""))

(defn- convert-block
  [node]
  (condp instance? node
    Paragraph         [{:type    "paragraph"
                        :attrs   {:_id (mint-id)}
                        :content (convert-inlines (fm-children node))}]
    Heading           [{:type    "heading"
                        :attrs   {:level (.getLevel ^Heading node) :_id (mint-id)}
                        :content (convert-inlines (fm-children node))}]
    BulletList        [{:type    "bulletList"
                        :attrs   {:_id (mint-id)}
                        :content (mapv convert-list-item (fm-children node))}]
    OrderedList       [{:type    "orderedList"
                        :attrs   {:start (.getStartNumber ^OrderedList node) :_id (mint-id)}
                        :content (mapv convert-list-item (fm-children node))}]
    BlockQuote        [{:type    "blockquote"
                        :attrs   {:_id (mint-id)}
                        :content (convert-blocks (fm-children node))}]
    FencedCodeBlock   [{:type    "codeBlock"
                        :attrs   {:language (not-empty (first (str/split (str (.getInfo ^FencedCodeBlock node)) #"\s+")))
                                  :_id      (mint-id)}
                        :content (let [text (code-block-text node)]
                                   (if (= text "") [] [{:type "text" :text text}]))}]
    IndentedCodeBlock [{:type    "codeBlock"
                        :attrs   {:language nil :_id (mint-id)}
                        :content (let [text (code-block-text node)]
                                   (if (= text "") [] [{:type "text" :text text}]))}]
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
    (into [] (mapcat segment->nodes) segments)))

(defn parse
  "Metabase-flavored Markdown string -> ProseMirror AST map, i.e. the value that goes in a
  Document's `:document` column: `{:type \"doc\" :content [...]}`. Mints a fresh `:_id` on
  every node type that carries one. Malformed structure (unclosed fences, invalid container
  content, bad card tokens) throws a 400 `ex-info` whose message names the fix; a smart-link
  id that doesn't resolve keeps the node and logs a warning instead."
  [markdown-string]
  (let [content (parse-content markdown-string)]
    {:type    "doc"
     :content (if (seq content)
                content
                [{:type "paragraph" :attrs {:_id (mint-id)} :content []}])}))

;;; ------------------------------------------------ Serialize: inline ---------------------------------------------

(defn- escape-inline
  ^String [^String s]
  (str/replace s #"([\\*_`\[\]])" "\\\\$1"))

(defn- escape-line-start
  "Escape a leading character that would otherwise start a block construct (heading, list,
  blockquote, fence, thematic break) when this paragraph line is re-parsed."
  ^String [^String line]
  (let [[_ ws body] (re-matches #"([ \t]{0,3})(.*)" line)]
    (cond
      (nil? body) line

      (re-find #"^(#{1,6}([ \t]|$)|>|[-+]([ \t]|$)|:::|~~~|=+[ \t]*$|-+[ \t]*$)" body)
      (str ws "\\" body)

      (re-find #"^\d{1,9}[.)]([ \t]|$)" body)
      (let [[_ digits delim tail] (re-matches #"(\d{1,9})([.)])(.*)" body)]
        (str ws digits "\\" delim tail))

      :else line)))

(defn- escape-block-starts
  ^String [^String s]
  (str/join "\n" (map escape-line-start (str/split s #"\n" -1))))

(defn- code-span
  ^String [^String s]
  (if (str/includes? s "`")
    (str "`` " s " ``")
    (str "`" s "`")))

(defn- has-mark?
  [marks type]
  (boolean (some #(= type (:type %)) marks)))

(defn- mark-attrs
  [marks type]
  (some #(when (= type (:type %)) (:attrs %)) marks))

(defn- entity-token
  ^String [{:keys [entityId model]}]
  (format "{%% entity id=\"%s\" model=\"%s\" %%}" entityId model))

(defn- card-token
  ^String [{:keys [id name]}]
  (if (and (string? name) (not (str/blank? name)))
    (format "{%% card id=%d name=\"%s\" %%}" (long id) (str/replace name "\"" "\\\""))
    (format "{%% card id=%d %%}" (long id))))

(defn- inline->markdown
  ^String [{:keys [type text marks attrs] :as _node}]
  (case type
    "text"            (let [s (if (has-mark? marks "code")
                                (code-span text)
                                (escape-inline text))
                            s (cond-> s
                                (has-mark? marks "italic") (as-> t (str "*" t "*"))
                                (has-mark? marks "bold")   (as-> t (str "**" t "**")))]
                        (if-let [{:keys [href]} (mark-attrs marks "link")]
                          (str "[" s "](" (or href "") ")")
                          s))
    "hardBreak"       "\\\n"
    "smartLink"       (entity-token attrs)
    "metabot-mention" ""
    (throw (ex-info (format "Cannot serialize unknown inline node type %s to Markdown." (pr-str type))
                    {:status-code 400 :node-type type}))))

(defn- inlines->markdown
  ^String [content]
  (apply str (map inline->markdown content)))

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
          (format-number (or height resize-node-default-height))
          (format-number (or minHeight resize-node-default-min-height))))

(defn- flex-fence
  ^String [{:keys [columnWidths]}]
  (if (seq columnWidths)
    (format "::: flex {columns=[%s]}" (str/join "," (map format-number columnWidths)))
    "::: flex"))

(defn- block-body
  "The Markdown text of a leaf (non-container) block node, or nil when the node type is not a
  leaf block handled inline here."
  [{:keys [type attrs content] :as _node}]
  (case type
    "paragraph"      (escape-block-starts (inlines->markdown content))
    "heading"        (str (apply str (repeat (max 1 (long (or (:level attrs) 1))) "#"))
                          " "
                          (inlines->markdown content))
    "codeBlock"      (let [text  (apply str (map :text content))
                           fence (code-fence-for text)]
                       (str fence (or (:language attrs) "") "\n"
                            (when-not (= text "") (str text "\n"))
                            fence))
    "blockquote"     (prefix-quote (render-blocks content))
    "bulletList"     (->> content
                          (map #(prefix-list-item "- " (render-blocks (:content %))))
                          (str/join "\n"))
    "orderedList"    (let [start (long (or (:start attrs) 1))]
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

(defn- emit-blocks!
  "Append `nodes` (block siblings) separated by blank lines; returns their extents, index-aligned
  with `nodes`. Transient metabot nodes emit nothing and get an empty extent at their position."
  [{:keys [^StringBuilder sb] :as ctx} nodes]
  (loop [nodes (seq nodes), emitted? false, extents []]
    (if-not nodes
      extents
      (let [{:keys [type] :as node} (first nodes)]
        (if (transient-types type)
          (recur (next nodes) emitted?
                 (conj extents {:node node :start (.length sb) :end (.length sb) :children nil}))
          (do (when emitted?
                (.append sb "\n\n"))
              (recur (next nodes) true (conj extents (emit-block! ctx node)))))))))

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
  skipped entirely — no token, no span."
  [ast]
  (dissoc (serialize* ast) :extents))

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
            new-nodes    (parse-content new-text)
            result       (into (into (subvec nodes 0 i) new-nodes) (subvec nodes (inc j)))]
        (validate-spliced! parent-type result)
        result))))

(defn splice
  "`old-ast`, the `{:markdown :spans}` from a prior [[serialize]] call on `old-ast`, a character
  span [start end) to replace, and the replacement text -> new AST.

  Finds the minimal children array whose combined span contains [start end), recursing into
  layout containers as needed. Every sibling whose own text doesn't overlap the span is reused
  by identity from `old-ast` — same `:_id`, same attrs, same nested content. The overlapping
  sibling(s) are discarded: their serialized text, with the edit applied, is re-parsed via
  [[parse]] and the resulting nodes (fresh `:_id`s) take their place. Throws a 400 `ex-info`
  when `markdown` doesn't match `old-ast`'s serialization (a stale source map), when the span
  is out of bounds, or when the re-parsed result violates a container's content model."
  [old-ast {:keys [markdown] :as _serialized} start end replacement-text]
  (let [{fresh-markdown :markdown extents :extents} (serialize* old-ast)]
    (when (not= fresh-markdown markdown)
      (throw (teaching-error "The provided markdown doesn't match the document's current serialization — re-serialize and retry.")))
    (when-not (and (int? start) (int? end) (<= 0 start end (count fresh-markdown)))
      (throw (teaching-error (format "Invalid splice span [%s %s) for a %d-character document."
                                     start end (count fresh-markdown)))))
    (assoc old-ast :content
           (splice-level (:content old-ast) extents fresh-markdown
                         start end (or replacement-text "") "doc"))))
