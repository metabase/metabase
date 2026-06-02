(ns metabase.channel.render.pdf
  "Prototype: render a whole dashboard to a PDF on the backend, following the dashboard's
  explicit grid layout.

  Metabase dashboards are a 24-column grid; every dashcard (chart, text, heading, ...) has an
  explicit position (`row`/`col`) and size (`size_x`/`size_y`) in grid cells. This namespace
  reproduces that layout in the PDF: the printable page width is divided into 24 square units,
  and each dashcard is drawn into its grid rectangle at the corresponding scale. We follow the
  layout literally -- no reflow, repacking, or moving cards around -- and simply insert page
  breaks when the next card won't fit in the remaining vertical space (leaving the bottom of a
  page blank rather than splitting a card across pages).

  Paper is flexible between A4 (treated as 24x35 units) and Letter (24x32); units are square,
  so A4 leaves a little unused space at the page bottom. The first page spends some vertical
  cells on the dashboard title, and each tab's first page spends cells on the tab heading; the
  number of cells consumed is derived from the header font sizes (see `header-block-pt` /
  `rows-for-pt`).

  Chart/query cards are rasterized whole (title + description + chart/table) via the same
  static-viz pipeline the subscription emails use, then fit (preserving aspect, top-left) into
  their grid rectangle. Text and heading cards are drawn as native PDF text within their cell.

  Prototype limitations: markdown in text cards is not interpreted; link/iframe/placeholder
  virtual cards are skipped; a card taller than a full page is scaled down to fit."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.channel.render.card :as render.card]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.request.core :as request]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading IndentedCodeBlock Link MailLink OrderedList
                             Paragraph SoftLineBreak StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.ext.autolink AutolinkExtension)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Node)
   (com.vladsch.flexmark.util.data MutableDataSet)
   (java.awt Color)
   (java.io ByteArrayOutputStream)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.font PDType1Font Standard14Fonts$FontName)
   (org.apache.pdfbox.pdmodel.graphics.image PDImageXObject)))

(set! *warn-on-reflection* true)

(def ^:private margin 36.0)
(def ^:private grid-cols 24)

(def ^:private paper
  "Paper specs. `:rows` is the number of square grid cells we lay down vertically -- A4's
  printable height is ~35.31 units so we use 35 and accept the slack; Letter is exactly 32."
  {:a4     {:rect PDRectangle/A4     :rows 35}
   :letter {:rect PDRectangle/LETTER :rows 32}})

(def ^:private dashboard-title-pt 20.0)
(def ^:private tab-title-pt 15.0)
(def ^:private heading-card-pt 13.0)
(def ^:private text-card-pt 10.5)
(def ^:private chart-title-pt 11.0)
(def ^:private chart-desc-pt 9.0)
(def ^:private line-height-factor 1.3)
(def ^:private header-pad-pt 6.0)

(def ^:private dpi
  "Pixels per inch used to size rasterized charts. Higher = crisper but larger PDFs. A grid
  cell's pixel dimensions are derived from its printed point size and this DPI."
  150.0)

(def ^:private desc-color (Color. 0x6B 0x73 0x80))
(def ^:private link-color (Color. 0x1B 0x6F 0xC2))
(def ^:private code-color (Color. 0x3B 0x3B 0x3B))

(def ^:private rectangular-displays
  "Display types whose static-viz (ECharts/visx) renderer honors an explicit width AND height,
  so we can render them to exactly fill their grid cell (like the frontend). Other types (pie,
  gauge, funnel, progress, scalar, table, ...) are rendered whole and fit preserving aspect."
  #{:line :area :bar :combo :scatter :boxplot :waterfall :sankey :row})

(defn- bold-font ^PDType1Font [] (PDType1Font. Standard14Fonts$FontName/HELVETICA_BOLD))
(defn- regular-font ^PDType1Font [] (PDType1Font. Standard14Fonts$FontName/HELVETICA))

(defn- header-block-pt
  "Vertical points a header line of `font-pt` occupies (line height + a little padding)."
  [font-pt]
  (+ (* font-pt line-height-factor) header-pad-pt))

(defn- rows-for-pt
  "How many whole grid rows are needed to hold `pt` points of vertical space."
  [pt unit]
  (long (Math/ceil (/ (double pt) (double unit)))))

(defn- paper-dims
  [paper-key]
  (let [{:keys [^PDRectangle rect rows]} (paper paper-key)]
    {:rect rect
     :rows rows
     :unit (/ (- (.getWidth rect) (* 2 margin)) grid-cols)}))

;; --------------------------------------------------------------------------------------------
;; Text helpers
;; --------------------------------------------------------------------------------------------

(defn- sanitize
  "Standard-14 PDF fonts can't encode arbitrary characters; restrict to printable ASCII so
  `showText` never throws, and collapse whitespace (showText can't contain newlines)."
  ^String [s]
  (-> (str s)
      (str/replace #"\s+" " ")
      (str/replace #"[^\x20-\x7E]" "?")
      str/trim))

(defn- wrap-text
  "Greedy word-wrap `text` to fit `max-width` points at `font-pt`. Returns a vector of lines."
  [^PDType1Font font font-pt text max-width]
  (let [width-of (fn [^String s] (* font-pt (/ (.getStringWidth font s) 1000.0)))]
    (reduce
     (fn [lines word]
       (let [last-line (peek lines)
             candidate (if (str/blank? last-line) word (str last-line " " word))]
         (if (and (seq last-line) (> (width-of candidate) max-width))
           (conj lines word)
           (conj (if (empty? lines) [] (pop lines)) candidate))))
     []
     (str/split (sanitize text) #" "))))

(defn- text-width
  [^PDType1Font font font-pt ^String s]
  (* font-pt (/ (.getStringWidth font s) 1000.0)))

(defn- wrap-clamped
  "Wrap text to at most `max-lines` lines. If it would need more, truncate the last kept line
  and append an ellipsis (trimming characters until `line...` fits `max-w`)."
  [^PDType1Font font font-pt text max-w max-lines]
  (let [lines (wrap-text font font-pt text max-w)]
    (cond
      (<= max-lines 0)          []
      (<= (count lines) max-lines) lines
      :else
      (let [kept     (vec (take max-lines lines))
            ellipsis "..."
            fitted   (loop [s (peek kept)]
                       (cond
                         (str/blank? s)                                      ellipsis
                         (<= (text-width font font-pt (str s ellipsis)) max-w) (str s ellipsis)
                         :else                                               (recur (subs s 0 (dec (count s))))))]
        (conj (pop kept) fitted)))))

(defn- draw-line!
  "Draw a single pre-sanitized line of text at a baseline."
  [^PDPageContentStream cs ^PDType1Font font font-pt x baseline-y ^String text]
  (.beginText cs)
  (.setFont cs font (float font-pt))
  (.newLineAtOffset cs (float x) (float baseline-y))
  (.showText cs text)
  (.endText cs))

(defn- draw-lines!
  "Draw a seq of already-wrapped lines top-down from `top-y`, optionally in `color`."
  [^PDPageContentStream cs ^PDType1Font font font-pt ^Color color x top-y lines]
  (when color (.setNonStrokingColor cs color))
  (loop [ls lines, y (- (double top-y) font-pt)]
    (when (seq ls)
      (draw-line! cs font font-pt x y (first ls))
      (recur (rest ls) (- y (* font-pt line-height-factor)))))
  (when color (.setNonStrokingColor cs Color/BLACK)))

(defn- draw-text-block!
  "Draw wrapped text top-aligned within `[x, top-y]` bounded by `max-w`/`max-h`, optionally in
  `color` (reset to black afterward). Returns the vertical points consumed."
  [^PDPageContentStream cs ^PDType1Font font font-pt ^Color color x top-y max-w max-h text]
  (let [lh (* font-pt line-height-factor)]
    (when color (.setNonStrokingColor cs color))
    (let [used (loop [lines (if (str/blank? (str text)) [] (wrap-text font font-pt text max-w))
                      y     (- (double top-y) font-pt)
                      used  0.0]
                 (if (and (seq lines) (<= (+ used lh) max-h))
                   (do (draw-line! cs font font-pt x y (first lines))
                       (recur (rest lines) (- y lh) (+ used lh)))
                   used))]
      (when color (.setNonStrokingColor cs Color/BLACK))
      used)))

(defn- draw-text-in-cell!
  "Draw wrapped text top-aligned within a cell rectangle, clipping to the cell height."
  [^PDPageContentStream cs ^PDType1Font font font-pt x top-y cell-w cell-h text]
  (draw-text-block! cs font font-pt nil x top-y cell-w cell-h text))

;; --------------------------------------------------------------------------------------------
;; Markdown -> styled runs (text cards). We parse with flexmark (the same library the email
;; pipeline uses) but walk the AST ourselves, emitting block + inline-run structure that maps to
;; PDFBox fonts/colors -- since PDFBox has no HTML engine, the email's HTML output is no use here.
;; --------------------------------------------------------------------------------------------

(def ^:private md-parser
  (delay (.build (Parser/builder (.set (MutableDataSet.) Parser/EXTENSIONS
                                       [(AutolinkExtension/create)])))))

(defn- node-children [^Node node]
  (loop [c (.getFirstChild node), acc []]
    (if c (recur (.getNext c) (conj acc c)) acc)))

(defn- md-unescape
  "Resolve CommonMark backslash escapes (`\\,` -> `,`) the way flexmark's HtmlRenderer does --
  `.getChars` on a Text node returns the raw source, escapes included. (Parameter substitution
  escapes interpolated values, so e.g. a multi-value filter arrives as `A\\, B\\, and C`.)"
  [s]
  (str/replace (str s) #"\\(\p{Punct})" "$1"))

(defn- inline-runs
  "Flatten a block node's inline children into styled runs: each is `{:text :bold? :italic?
  :code? :href}`, plus `{:break? true}` for a hard line break."
  ([^Node node] (inline-runs node {} nil))
  ([^Node node style href]
   (vec (mapcat
         (fn [^Node c]
           (condp instance? c
             Text           [(assoc style :text (md-unescape (.getChars c)) :href href)]
             StrongEmphasis (inline-runs c (assoc style :bold? true) href)
             Emphasis       (inline-runs c (assoc style :italic? true) href)
             Code           [(assoc style :code? true :text (str (.getText ^Code c)) :href href)]
             Link           (inline-runs c style (str (.getUrl ^Link c)))
             AutoLink       (let [u (str (.getText ^AutoLink c))] [(assoc style :text u :href u)])
             MailLink       (let [u (str (.getText ^MailLink c))] [(assoc style :text u :href (str "mailto:" u))])
             SoftLineBreak  [{:text " " :space? true}]
             HardLineBreak  [{:break? true}]
             (if (.getFirstChild c)
               (inline-runs c style href)
               [(assoc style :text (md-unescape (.getChars c)) :href href)])))
         (node-children node)))))

(declare block->blocks)

(defn- list->blocks [^Node list-node depth ordered?]
  (vec (apply concat
              (map-indexed
               (fn [idx ^Node item]
                 (let [child-blocks (vec (mapcat #(block->blocks % (inc depth)) (node-children item)))]
                   (map-indexed
                    (fn [i b]
                      (if (and (zero? i) (= :paragraph (:kind b)))
                        (assoc b :kind :list-item :indent depth
                               :marker (if ordered? (str (inc idx) ". ") "- "))
                        b))
                    child-blocks)))
               (node-children list-node)))))

(defn- block->blocks
  "Convert a flexmark block node into a flat vector of layout blocks `{:kind :runs ...}`."
  [^Node node depth]
  (condp instance? node
    Heading           [{:kind :heading :level (.getLevel ^Heading node) :runs (inline-runs node)}]
    Paragraph         [{:kind :paragraph :runs (inline-runs node)}]
    BulletList        (list->blocks node depth false)
    OrderedList       (list->blocks node depth true)
    FencedCodeBlock   [{:kind :code-block :text (str (.getContentChars ^FencedCodeBlock node))}]
    IndentedCodeBlock [{:kind :code-block :text (str (.getContentChars ^IndentedCodeBlock node))}]
    BlockQuote        (mapv #(update % :indent (fnil inc 0))
                            (vec (mapcat #(block->blocks % depth) (node-children node))))
    ThematicBreak     [{:kind :hr}]
    (if (.getFirstChild node)
      (vec (mapcat #(block->blocks % depth) (node-children node)))
      [])))

(defn- parse-markdown-blocks [text]
  (vec (mapcat #(block->blocks % 0) (node-children (.parse ^Parser @md-parser (str text))))))

(defn- run-font ^PDType1Font [{:keys [bold? italic? code?]}]
  (PDType1Font.
   (cond
     code?               Standard14Fonts$FontName/COURIER
     (and bold? italic?) Standard14Fonts$FontName/HELVETICA_BOLD_OBLIQUE
     bold?               Standard14Fonts$FontName/HELVETICA_BOLD
     italic?             Standard14Fonts$FontName/HELVETICA_OBLIQUE
     :else               Standard14Fonts$FontName/HELVETICA)))

(defn- heading-pt [level]
  (case (long level) 1 15.0 2 13.5 3 12.0 11.5))

(defn- runs->words
  "Split runs into a flat seq of word tokens, each `{:text :style :space-before?}` (or
  `{:break? true}`), so that adjacent runs with no whitespace between them don't get a space."
  [runs]
  (loop [runs runs, pending false, out []]
    (if (empty? runs)
      out
      (let [r (first runs)]
        (if (:break? r)
          (recur (rest runs) false (conj out {:break? true}))
          (let [style (dissoc r :text :space? :break? :href)
                style (cond-> style (:href r) (assoc :link? true))
                [out2 pend2] (reduce (fn [[acc pend] tok]
                                       (if (str/blank? tok)
                                         [acc true]
                                         [(conj acc {:text tok :style style :space-before? pend}) false]))
                                     [out pending]
                                     (re-seq #"\S+|\s+" (str (:text r ""))))]
            (recur (rest runs) pend2 out2)))))))

(defn- words->lines
  "Greedily wrap `words` to `max-w`, resolving each word's font/color. Returns a vector of lines;
  each line is a vector of drawable items `{:text :font :pt :color :ww :sp :space-before?}`."
  [words base-pt heading? max-w]
  (loop [ws words, line [], line-w 0.0, lines []]
    (if (empty? ws)
      (if (seq line) (conj lines line) lines)
      (let [w (first ws)]
        (if (:break? w)
          (recur (rest ws) [] 0.0 (conj lines line))
          (let [style      (:style w)
                font       (run-font (cond-> style heading? (assoc :bold? true)))
                txt        (sanitize (:text w))
                ww         (text-width font base-pt txt)
                sp         (text-width font base-pt " ")
                color      (cond (:link? style) link-color (:code? style) code-color :else Color/BLACK)
                add-space? (boolean (and (seq line) (:space-before? w)))
                advance    (+ (if add-space? sp 0.0) ww)
                item       {:text txt :font font :pt base-pt :color color
                            :ww ww :sp sp :space-before? add-space?}]
            (if (and (seq line) (> (+ line-w advance) max-w))
              (recur ws [] 0.0 (conj lines line))
              (recur (rest ws) (conj line item) (+ line-w advance) lines))))))))

(defn- block-height
  "Vertical points a block consumes when laid out at `scale` (mirrors `draw-block!`)."
  [block cell-w scale]
  (case (:kind block)
    :hr (* 10.0 scale)
    :code-block (let [pt (* 9.0 scale)
                      lh (* pt line-height-factor)]
                  (+ (* (count (str/split-lines (str (:text block)))) lh) 2.0))
    (let [heading? (= :heading (:kind block))
          base-pt  (* (if heading? (heading-pt (:level block)) text-card-pt) scale)
          marker   (:marker block)
          marker-w (if marker (text-width (regular-font) base-pt marker) 0.0)
          content-w (- cell-w (* (long (or (:indent block) 0)) 14.0) marker-w)
          lines    (words->lines (runs->words (:runs block)) base-pt heading? content-w)]
      (* (count lines) (* base-pt line-height-factor)))))

(defn- markdown-total-height [blocks cell-w scale]
  (reduce (fn [acc b] (+ acc (block-height b cell-w scale) (* 4.0 scale))) 0.0 blocks))

(defn- fit-scale
  "Largest font scale (<= 1.0, down to a readability floor) at which the markdown fits `cell-h`.
  Shrinks the text only when the content would otherwise overflow (and clip) the cell."
  [blocks cell-w cell-h]
  (or (some (fn [s] (when (<= (markdown-total-height blocks cell-w s) cell-h) s))
            (map #(/ (double %) 100.0) (range 100 44 -5)))
      0.45))

(defn- draw-md-line!
  [^PDPageContentStream cs x baseline items]
  (loop [items items, cx (double x)]
    (when (seq items)
      (let [it  (first items)
            cx2 (+ cx (if (:space-before? it) (:sp it) 0.0))]
        (.setNonStrokingColor cs ^Color (:color it))
        (draw-line! cs (:font it) (:pt it) cx2 baseline (:text it))
        (recur (rest items) (+ cx2 (:ww it))))))
  (.setNonStrokingColor cs Color/BLACK))

(defn- draw-code-block!
  [^PDPageContentStream cs block x top-y cell-w bottom scale]
  (let [font (PDType1Font. Standard14Fonts$FontName/COURIER)
        pt   (* 9.0 scale)
        lh   (* pt line-height-factor)]
    (.setNonStrokingColor cs ^Color code-color)
    (let [y (loop [ls (str/split-lines (str (:text block))), y (double top-y)]
              (if (or (empty? ls) (< (- y lh) bottom))
                y
                (do (draw-line! cs font pt (+ x 4.0) (- y pt) (sanitize (first ls)))
                    (recur (rest ls) (- y lh)))))]
      (.setNonStrokingColor cs Color/BLACK)
      (- y 2.0))))

(defn- draw-block!
  "Draw one markdown block within `[x, top-y]` of `cell-w`, clipping at `bottom`. Returns the y
  below the block (top of the next)."
  [^PDPageContentStream cs block x top-y cell-w bottom scale]
  (case (:kind block)
    :hr (let [y (- (double top-y) (* 5.0 scale))]
          (.setStrokingColor cs ^Color desc-color)
          (.moveTo cs (float x) (float y))
          (.lineTo cs (float (+ x cell-w)) (float y))
          (.stroke cs)
          (.setStrokingColor cs Color/BLACK)
          (- y (* 5.0 scale)))
    :code-block (draw-code-block! cs block x top-y cell-w bottom scale)
    ;; heading / paragraph / list-item
    (let [heading?    (= :heading (:kind block))
          base-pt     (* (if heading? (heading-pt (:level block)) text-card-pt) scale)
          lh          (* base-pt line-height-factor)
          indent-x    (+ (double x) (* (long (or (:indent block) 0)) 14.0))
          ;; markers ("- ", "1. ") are ASCII; keep their trailing space (sanitize would trim it)
          marker      (:marker block)
          marker-font (regular-font)
          marker-w    (if marker (text-width marker-font base-pt marker) 0.0)
          content-x   (+ indent-x marker-w)
          content-w   (- (+ (double x) cell-w) content-x)
          lines       (words->lines (runs->words (:runs block)) base-pt heading? content-w)]
      (loop [lines lines, y (double top-y), first? true]
        (if (or (empty? lines) (< (- y lh) bottom))
          y
          (do
            (when (and first? marker)
              (draw-line! cs marker-font base-pt indent-x (- y base-pt) marker))
            (draw-md-line! cs content-x (- y base-pt) (first lines))
            (recur (rest lines) (- y lh) false)))))))

(defn- draw-markdown-in-cell!
  "Render markdown `text` top-down within a cell rectangle. Shrinks the font (down to a floor)
  so the content fits the cell height instead of clipping; clips only if even the floor overflows."
  [^PDPageContentStream cs x top-y cell-w cell-h text]
  (let [blocks (parse-markdown-blocks text)
        scale  (fit-scale blocks cell-w cell-h)
        bottom (- (double top-y) cell-h)]
    (loop [blocks blocks, y (double top-y)]
      (when (and (seq blocks) (> y (+ bottom 2.0)))
        (recur (rest blocks)
               (- (draw-block! cs (first blocks) x y cell-w bottom scale) (* 4.0 scale)))))))

;; --------------------------------------------------------------------------------------------
;; Cell building -- turn dashcards into renderable cells, preserving grid geometry
;; --------------------------------------------------------------------------------------------

(defn- dashcard->cell
  "Build a renderable cell from a dashcard, preserving its grid geometry. Returns nil for
  dashcard kinds we don't render (link/iframe/placeholder/action) or cards that fail/are empty."
  [dc parameters]
  (let [geom (select-keys dc [:row :col :size_x :size_y])]
    (cond
      (:card_id dc)
      (when-let [part (notification.execute/execute-dashboard-subscription-card dc parameters)]
        (assoc geom :kind :card :part part))

      (notification.execute/virtual-card-of-type? dc "heading")
      (assoc geom :kind :heading
             :text (get-in (notification.execute/process-virtual-dashcard dc parameters)
                           [:visualization_settings :text]))

      (notification.execute/virtual-card-of-type? dc "text")
      (assoc geom :kind :text
             :text (get-in (notification.execute/process-virtual-dashcard dc parameters)
                           [:visualization_settings :text]))

      :else nil)))

(defn- build-cells
  "Order a tab's (or the untabbed dashboard's) dashcards and build cells, normalizing row
  numbers so the first row of the section is 0."
  [dashcards parameters]
  (let [sorted  (sort dashboard-card/dashcard-comparator dashcards)
        min-row (if (seq sorted) (apply min (map :row sorted)) 0)]
    (into [] (keep #(some-> (dashcard->cell % parameters) (update :row - min-row))) sorted)))

;; --------------------------------------------------------------------------------------------
;; Pagination -- slice a section's cells into pages, breaking before a card that won't fit
;; --------------------------------------------------------------------------------------------

(defn- paginate
  "Greedily pack `cells` (sorted, row-normalized) into pages of `total-rows` usable rows. The
  first page of the section reserves `first-header-rows` for the dashboard/tab heading;
  continuation pages reserve none. A card that won't fit in the current page's remaining rows
  starts a new page (we never split a card across pages). Each page records its `:base` row so
  cells can be positioned relative to the top of the page's card area."
  [cells total-rows first-header-rows]
  (loop [cells (seq cells), pages [], cur nil]
    (if (empty? cells)
      (cond-> pages cur (conj cur))
      (let [c    (first cells)
            cbot (+ (:row c) (:size_y c))]
        (if (nil? cur)
          (recur (next cells) pages {:base (:row c) :header-rows first-header-rows :cards [c]})
          (let [cap (- total-rows (:header-rows cur))]
            (if (<= (- cbot (:base cur)) cap)
              (recur (next cells) pages (update cur :cards conj c))
              (recur (next cells) (conj pages cur)
                     {:base (:row c) :header-rows 0 :cards [c]}))))))))

(defn- pages-for-section
  "Produce positioned pages for one section (a tab, or the whole untabbed dashboard). `idx` is
  the section's index; only the very first section's first page carries the dashboard title,
  and (when tabbed) every section's first page carries the tab title."
  [section idx {:keys [unit rows]} tabbed? dash-name]
  (let [dash-rows (rows-for-pt (header-block-pt dashboard-title-pt) unit)
        tab-rows  (rows-for-pt (header-block-pt tab-title-pt) unit)
        first-hdr (+ (if (zero? idx) dash-rows 0)
                     (if tabbed? tab-rows 0))]
    (map-indexed
     (fn [pi pg]
       (assoc pg
              :dashboard-title (when (and (zero? idx) (zero? pi)) dash-name)
              :tab-title       (when (and tabbed? (zero? pi)) (:tab-name section))))
     (paginate (:cells section) rows first-hdr))))

;; --------------------------------------------------------------------------------------------
;; Drawing
;; --------------------------------------------------------------------------------------------

(defn- card-body-png
  "Rasterize a `:card` part's body (chart/table/scalar) to PNG bytes, WITHOUT its title or
  description -- those are drawn natively at the PDF level. Used for card types that can't fill
  an arbitrary box (pie, gauge, funnel, progress, scalar, table, ...); fit preserving aspect."
  ^bytes [timezone {:keys [card dashcard result]} px-width]
  (-> (render.card/render-pulse-card :inline timezone card dashcard result
                                     {:channel.render/include-title?       false
                                      :channel.render/include-description? false})
      (render.card/png-from-render-info px-width)))

(defn- draw-image-in-cell!
  "Draw `img` fit (preserving aspect, top-left anchored) within a cell rectangle."
  [^PDPageContentStream cs ^PDImageXObject img x top-y cell-w cell-h]
  (let [iw    (double (.getWidth img))
        ih    (double (.getHeight img))
        scale (min (/ cell-w iw) (/ cell-h ih))
        dw    (* iw scale)
        dh    (* ih scale)]
    (.drawImage cs img (float x) (float (- (double top-y) dh)) (float dw) (float dh))))

(defn- pt->px [pt] (long (Math/round (* (double pt) (/ dpi 72.0)))))

(defn- card-title [card dashcard]
  (or (get-in dashcard [:visualization_settings :card.title]) (:name card)))

(defn- card-description [card dashcard]
  (or (get-in dashcard [:visualization_settings :card.description]) (:description card)))

(defn- cards-with-data
  "Replicate the multi-series data shape `body/render :javascript_visualization` feeds to
  static-viz (sans timeline events, which static-viz never officially used)."
  [card dashcard data]
  (->> (:series-results dashcard)
       (map (fn [m] (-> m (assoc :data (get-in m [:result :data])) (dissoc :result))))
       (cons {:card card :data data})
       (m/distinct-by #(get-in % [:card :id]))))

(defn- sized-chart-png
  "Render an isomorphic chart to a PNG of exactly `w-px` x `h-px`, telling static-viz to lay the
  chart out into that box (so it fills it the way the frontend does). Used for rectangular
  charts and for square/wide pies (which then place their legend to the side). Returns nil if
  the chart doesn't produce an SVG."
  ^bytes [card dashcard data w-px h-px]
  (binding [js.svg/*chart-size* {:width w-px :height h-px}]
    (let [viz (or (:visualization_settings dashcard) (:visualization_settings card))
          {t :type c :content} (js.svg/*javascript-visualization* (cards-with-data card dashcard data) viz)]
      (when (= :svg t)
        (js.svg/svg-string->bytes c)))))

(defn- text-block-height
  "Vertical points a wrapped text block would consume (without drawing), bounded by `max-h`."
  [^PDType1Font font font-pt max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [lh    (* font-pt line-height-factor)
          lines (count (wrap-text font font-pt text max-w))
          fit   (long (Math/floor (/ (double max-h) lh)))]
      (* (min lines (max 0 fit)) lh))))

(defn- render-card-cell!
  "Render a chart/query card into its cell rectangle. The title and description are always drawn
  natively at the PDF level (crisp text), and the space they consume is reserved before the body
  is rendered. Rectangular (ECharts/visx) charts are then rendered to exactly fill the remaining
  body area (matching the frontend); other types render their body title-less and fit preserving
  aspect into the body area."
  [^PDDocument doc ^PDPageContentStream cs timezone {:keys [card dashcard] :as part} x top-y cell-w cell-h]
  (let [data       (get-in part [:result :data])
        title      (card-title card dashcard)
        desc       (card-description card dashcard)
        th         (text-block-height (bold-font) chart-title-pt cell-w (* 0.5 cell-h) title)
        desc-lh    (* chart-desc-pt line-height-factor)
        ;; Descriptions clip to at most two lines (with an ellipsis), further bounded by cell size.
        desc-max   (min 2 (long (Math/floor (/ (* 0.35 cell-h) desc-lh))))
        desc-lines (when-not (str/blank? (str desc))
                     (wrap-clamped (regular-font) chart-desc-pt desc cell-w desc-max))
        dh         (* (count desc-lines) desc-lh)
        header     (+ th dh (if (or (pos? th) (pos? dh)) 4.0 0.0))
        body-top   (- (double top-y) header)
        body-h     (- cell-h header)
        display    (keyword (:display card))
        ;; Rectangular charts always fill their box; pies fill (and move their legend to the
        ;; side) only when the body area is square-or-wider, otherwise they keep a bottom legend.
        fill?      (or (contains? rectangular-displays display)
                       (and (= :pie display) (>= cell-w body-h)))]
    ;; Native title + (clipped) description for every card type.
    (draw-text-block! cs (bold-font) chart-title-pt nil x top-y cell-w (* 0.5 cell-h) title)
    (when (seq desc-lines)
      (draw-lines! cs (regular-font) chart-desc-pt desc-color x (- (double top-y) th) desc-lines))
    (when (> body-h 12.0)
      (if-let [png (when fill?
                     (sized-chart-png card dashcard data (pt->px cell-w) (pt->px body-h)))]
        ;; rendered at exactly cell-w x body-h px -> draw to fill the body area exactly
        (.drawImage cs (PDImageXObject/createFromByteArray doc png "chart")
                    (float x) (float (- body-top body-h)) (float cell-w) (float body-h))
        ;; fallback: title-less body PNG, fit preserving aspect into the body area
        (when-let [body (card-body-png timezone part (long (max 240 (min 2200 (pt->px cell-w)))))]
          (draw-image-in-cell! cs (PDImageXObject/createFromByteArray doc body "card") x body-top cell-w body-h))))))

(defn- draw-header!
  [^PDPageContentStream cs page-height {:keys [dashboard-title tab-title]}]
  (let [bold (bold-font)
        top  (- (double page-height) margin)]
    (when dashboard-title
      (draw-line! cs bold dashboard-title-pt margin (- top dashboard-title-pt) (sanitize dashboard-title)))
    (when tab-title
      (let [y (if dashboard-title (- top (header-block-pt dashboard-title-pt)) top)]
        (draw-line! cs bold tab-title-pt margin (- y tab-title-pt) (sanitize tab-title))))))

(defn- render-page!
  [^PDDocument doc {:keys [^PDRectangle rect unit]} timezone page]
  (let [pg            (PDPage. rect)
        _             (.addPage doc pg)
        ph            (.getHeight rect)
        cs            (PDPageContentStream. doc pg)
        card-area-top (- ph margin (* (:header-rows page) unit))]
    (try
      (draw-header! cs ph page)
      (doseq [cell (:cards page)]
        (let [rr     (- (:row cell) (:base page))
              x      (+ margin (* (:col cell) unit))
              top-y  (- card-area-top (* rr unit))
              cell-w (* (:size_x cell) unit)
              cell-h (min (* (:size_y cell) unit) (- top-y margin))]
          (try
            (case (:kind cell)
              :card    (render-card-cell! doc cs timezone (:part cell) x top-y cell-w cell-h)
              :heading (draw-text-in-cell! cs (bold-font) heading-card-pt x top-y cell-w cell-h (:text cell))
              :text    (draw-markdown-in-cell! cs x top-y cell-w cell-h (:text cell))
              nil)
            (catch Throwable e
              (log/error e "Error rendering dashboard PDF cell; substituting placeholder")
              (draw-text-in-cell! cs (regular-font) 10.0 x top-y cell-w cell-h "[Unable to render this card]")))))
      (finally
        (.close cs)))))

;; --------------------------------------------------------------------------------------------
;; Public API
;; --------------------------------------------------------------------------------------------

(defn- resolve-parameters
  "Resolve the parameter values a subscription would use: start from the dashboard's own
  parameters (treating each parameter's `:default` as its `:value`), then apply any explicitly
  provided overrides by id. These feed both text-card `{{tag}}` substitution and dashcard query
  filtering, matching how email subscriptions interpolate parameters."
  [dashboard provided]
  (let [by-id (into {} (map (juxt :id identity)) provided)]
    (vec (for [{default-value :default :as p} (:parameters dashboard)]
           (cond-> (dissoc p :default)
             (some? default-value) (assoc :value default-value)
             (by-id (:id p))       (merge (by-id (:id p))))))))

(defn render-dashboard-to-pdf
  "Render the dashboard with `dashboard-id` to PDF bytes, as user `user-id`, applying
  `parameters` (a vector of dashboard parameter overrides; `[]` to use the dashboard's own
  parameter defaults). `paper-key` is `:a4` (default) or `:letter`. Lays cards out following the
  dashboard's explicit 24-column grid."
  (^bytes [dashboard-id user-id parameters]
   (render-dashboard-to-pdf dashboard-id user-id parameters :a4))
  (^bytes [dashboard-id user-id parameters paper-key]
   (request/with-current-user user-id
     (let [dims     (paper-dims paper-key)
           dash     (t2/select-one :model/Dashboard :id dashboard-id)
           tabs     (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})
           dcs      (t2/hydrate (t2/select :model/DashboardCard :dashboard_id dashboard-id) :card)
           tabbed?  (boolean (seq tabs))
           by-tab   (group-by :dashboard_tab_id dcs)
           resolved (resolve-parameters dash parameters)
           sections (if tabbed?
                      (mapv (fn [t] {:tab-name (:name t) :cells (build-cells (get by-tab (:id t)) resolved)}) tabs)
                      [{:tab-name nil :cells (build-cells dcs resolved)}])
           timezone (some (fn [s] (some #(when (= :card (:kind %))
                                           (render.card/defaulted-timezone (-> % :part :card)))
                                        (:cells s)))
                          sections)
           doc      (PDDocument.)]
       (try
         (doseq [[idx section] (map-indexed vector sections)
                 page          (pages-for-section section idx dims tabbed? (:name dash))]
           (render-page! doc dims timezone page))
         (when (zero? (.getNumberOfPages doc))
           (.addPage doc (PDPage. ^PDRectangle (:rect dims))))
         (with-open [os (ByteArrayOutputStream.)]
           (.save doc os)
           (.toByteArray os))
         (finally
           (.close doc)))))))

(defn render-dashboard-to-pdf-file
  "Convenience wrapper for the REPL: render the dashboard to PDF and write it to `path`."
  ([dashboard-id user-id parameters path]
   (render-dashboard-to-pdf-file dashboard-id user-id parameters path :a4))
  ([dashboard-id user-id parameters path paper-key]
   (let [bytes (render-dashboard-to-pdf dashboard-id user-id parameters paper-key)]
     (with-open [os (io/output-stream path)]
       (.write os ^bytes bytes))
     path)))
