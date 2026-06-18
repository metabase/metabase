(ns metabase.channel.render.pdf
  "Rendering dashboards into PDFs, for sending to emails or Slack, or returning from the API. Powered by Apache PDFBox.

  Metabase dashboards are a 24-column grid; every dashcard (chart, text, heading, ...) has an explicit position
  (`row`/`col`) and size (`size_x`/`size_y`) in grid cells. This layout is reproduced in the PDF: the printable page
  width is divided into 24 square units, and each dashcard is drawn into its grid rectangle at the corresponding
  scale. We follow the layout literally -- no reflow, repacking, or moving cards around -- and simply insert page
  breaks when the next card won't fit in the remaining vertical space. That leaves the bottom of the page blank
  rather than splitting a card across pages.

  Paper is selectable between A4 and Letter; grid cells are square (width = content width / 24 columns). The
  dashboard title, parameters, and tab heading sit at the top of their page and take exactly the height they need
  -- not rounded up to a whole grid row (see `header-height`). Whatever vertical space remains below the header
  holds the dashboard grid, fitting as many rows as there is room for.

  Chart/query card bodies are rendered via the same static-viz pipeline the subscription emails use -- rectangular
  charts to exactly fill their grid rectangle, other types fit preserving aspect -- with the card title drawn natively
  above. Text and heading cards are drawn as native PDF text within their cell.

  Native text (titles, text/heading cards, parameters) is drawn with embedded Noto Sans fonts (via `PDType0Font`), with
  per-glyph font fallback (see `font/font-runs`), so it renders Unicode. We support the Latin, Cyrillic, Greek, Arabic,
  Hebrew alphabets (with accents and unique characters like Polish ł and German ß), Devanagari, (Simplified) Chinese,
  Japanese and Korean. Bold face is supported for all languages; CJK has no italic and fall back to upright.
  Mixed-script text picks the right font per character.

  Right-to-left text (Hebrew, Arabic) is shaped and reordered per line, via ICU4J (see [[font/visual-order]]). This is a
  pragmatic approach that produces good results, but it is an approximation and not a full *bidi* implementation. There
  are some scripts left out (Indic, Thai) but they could be added if there's a call for them.

  On file size: our font faces are TrueType (glyf), which allows PDFBox to include only the subset of glyphs which
  are actually used in the final PDFs, keeping them small even when they contain CJK. The fonts are in
  `resources/fonts/pdf`.

  Link and iframe virtual cards render as clickable links; placeholder (empty section slots) and action cards are
  skipped and just appear blank in the PDF. A card taller than a full page is scaled down to fit."
  (:require
   [better-cond.core :as b]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.card :as render.card]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.pdf.common :as common]
   [metabase.channel.render.pdf.font :as font]
   [metabase.channel.render.pdf.markdown :as md]
   [metabase.channel.render.pdf.typeset :as typeset]
   [metabase.channel.render.png :as png]
   [metabase.channel.render.util :as render.util]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.parameters.shared :as shared.params]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru trun]]
   [metabase.util.log :as log]
   [metabase.util.memoize :as memo]
   [toucan2.core :as t2])
  (:import
   (java.awt Color)
   (java.awt.geom AffineTransform PathIterator)
   (java.io ByteArrayOutputStream StringReader)
   (org.apache.batik.parser AWTPathProducer)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.font PDFont)
   (org.apache.pdfbox.pdmodel.graphics.image PDImageXObject)
   (org.apache.pdfbox.pdmodel.interactive.action PDActionURI)
   (org.apache.pdfbox.pdmodel.interactive.annotation PDAnnotationLink PDBorderStyleDictionary)))

(set! *warn-on-reflection* true)

(def ^:dynamic *debug-boxes*
  "When true, fill the *allocated* bounding box (the full space available, not the content's actual extent) behind
  each chart (red) and each card title / heading card (light blue), so one can see how much of its cell the content
  really fills."
  false)
(def ^:private debug-chart-color   (Color. 0xFF 0xBB 0xBB))
(def ^:private debug-heading-color (Color. 0xCC 0xCC 0xFF))

(def ^:private rectangular-displays
  "Display types whose static-viz (ECharts/visx) renderer honors an explicit width AND height, so we can render them
  to exactly fit their grid cell (like the frontend).

  Other types (pie, gauge, funnel, progress, scalar, table, ...) have a fixed size when rendered, and resized to fit
  their grid cell, preserving aspect ratio."
  #{:line :area :bar :combo :scatter :boxplot :waterfall :sankey :row})

;; --------------------------------------------------------------------------------------------
;; Page geometry
;; --------------------------------------------------------------------------------------------

(defn- header-block-pt
  "Vertical points a header line of `font-pt` occupies (line height + a little padding)."
  [font-pt]
  (+ (* font-pt common/line-height-factor) common/header-pad-pt))

(defn- header-height
  "Exact height in points the header occupies on a page: the dashboard title, parameter table, and/or tab title that
  the page carries (whichever keys are present -- the same ones [[draw-header!]] draws). The dashboard grid starts
  right below this, so the header takes only the space it needs rather than rounding up to a whole grid row."
  [{:keys [dashboard-title param-table tab-title]}]
  (cond-> 0.0
    dashboard-title (+ (header-block-pt common/dashboard-title-pt))
    ;; matches what draw-param-table! advances: its row heights plus a small trailing gap
    param-table     (+ (:height param-table) 4.0)
    tab-title       (+ (header-block-pt common/tab-title-pt))))

(defn- paper-dims
  [paper-key]
  (let [{:keys [^PDRectangle rect rows]} (common/paper paper-key)]
    {:rect rect
     :rows rows
     :unit (/ (- (.getWidth rect) (* 2 common/margin))
              common/grid-cols)}))

(defn- draw-line!
  "Draw a single line of text with `face` at a baseline, switching physical fonts as needed so mixed-script text
  (e.g. English + Japanese) renders the right glyphs."
  [^PDPageContentStream cs face font-pt x baseline-y ^String text]
  (.beginText cs)
  (.newLineAtOffset cs (float x) (float baseline-y))
  (doseq [[phys ^String chunk] (font/font-runs face (font/visual-order (font/normalize-ws text)))]
    (.setFont cs ^PDFont (:font phys) (float font-pt))
    (.showText cs chunk))
  (.endText cs))

;; --------------------------------------------------------------------------------------------
;; Clickable links. PDF link annotations attach to the page, not the content stream, so while a
;; page draws we collect link rectangles into `*link-rects*` and add the annotations afterward.
;; --------------------------------------------------------------------------------------------

(def ^:dynamic *link-rects*
  "While a page renders, an atom holding a vector of `{:x0 :y0 :x1 :y1 :href}` rectangles for the clickable link
  annotations to add to the page once drawing is done."
  nil)

(defn- clickable-href?
  "Only annotate absolute http(s)/mailto links (skip relative or file:/javascript: schemes)."
  [href]
  (boolean (re-find #"(?i)^(?:https?|mailto):" (str href))))

(defn- record-link!
  "Record a clickable rectangle for link `href`, covering text drawn at `[x, baseline]`."
  [x baseline width pt href]
  (when (and *link-rects* (clickable-href? href))
    (swap! *link-rects* conj {:x0   x
                              :y0   (- baseline (* 0.2 pt))
                              :x1   (+ x width)
                              :y1   (+ baseline (* 0.85 pt))
                              :href href})))

(defn- draw-md-ruby-item!
  "Draw a Markdown item with a single part of main text and a *ruby* reading written smaller above it.

  Returns the `x` coordinate after this item."
  [^PDPageContentStream cs x baseline {:keys [base base-ww color font pt reading reading-ww ruby-pt ww] :as item}]
  ;; Either the base or the reading might be longer! `ww` is the greater of the two widths, and we center both
  ;; reading and base text inside a box of width `ww`.
  (let [base-x (common/h-center x ww base-ww)
        read-x (common/h-center x ww reading-ww)]
    (.setNonStrokingColor cs ^Color color)
    (draw-line! cs font pt base-x baseline base)
    (draw-line! cs font ruby-pt read-x (+ baseline pt 1.0) reading)
    (when-let [href (:href item)]
      (record-link! x baseline ww pt href))
    (+ x ww)))

(defn- draw-md-basic-item!
  "Draws a Markdown item for a possibly multi-part styled word.

  Returns the `x` coordinate after this item."
  [^PDPageContentStream cs x baseline item]
  (reduce (fn [px {:keys [^Color color font href pt text ww]}]
            (.setNonStrokingColor cs color)
            (draw-line! cs font pt px baseline text)
            (when href
              (record-link! px baseline ww pt href))
            (+ px ww))
          x (:pieces item)))

(defn- draw-md-item!
  "Draw one markdown text item at `x` and `baseline`.

  This actually only handles any leading space and then hands off to handlers for *ruby* \"readings\" or a regular
  item."
  [^PDPageContentStream cs x baseline {:keys [ruby? sp space-before?] :as item}]
  (let [x (+ x (if space-before? sp 0.0))]
    (if ruby?
      (draw-md-ruby-item! cs x baseline item)
      (draw-md-basic-item! cs x baseline item))))

(defn- draw-md-line!
  "Draw one wrapped markdown line within the box `[x, x+content-w]`.

  When `rtl?`, the line is laid out flush-right within that box. The `items` (words) are reordered to their
  left-to-right *visual* order on the page via [[typeset/reorder-bidi-items]]."
  [^PDPageContentStream cs x content-w rtl? baseline items]
  (reduce #(draw-md-item! cs %1 baseline %2)
          ;; Starting `x` depends on `rtl?`: flush left for LTR, or inset from left to make the line flush right.
          (if rtl?
            (+ x
               (max 0.0 (- content-w
                           (typeset/md-line-width items))))
            x)
          (typeset/reorder-bidi-items items)))

(defn- draw-item-lines!
  "Draw already-wrapped `lines` (each a vector of measured items) top-down from `top-y`, laying each out within
  `[content-x, content-x+content-w]` and stopping before `bottom`. `rtl?` right-aligns. On the first line, `marker`
  (if non-nil) is drawn at `marker-x` in `marker-font`.

  Note that `y` decreases downwards in PDFs; reversed from the convention on the web.

  Returns the y just below the last line actually drawn. Shared by [[draw-block!]] and [[draw-text-block!]]."
  [^PDPageContentStream cs lines content-x content-w top-y bottom base-pt rtl? marker marker-x marker-font]
  (let [lh (* base-pt common/line-height-factor)]
    (when marker
      (draw-line! cs marker-font base-pt marker-x (- top-y base-pt) marker))
    (reduce (fn [y line]
              ;; lines with furigana need extra space above the base for the reading; lower the baseline
              ;; into that band and grow the line advance to match.
              (let [extra    (typeset/line-extra line base-pt)
                    baseline (- y extra base-pt)
                    adv      (+ lh extra)
                    y'       (- y adv)]
                (when (>= y' bottom)
                  (draw-md-line! cs content-x content-w rtl? baseline line))
                y'))
            top-y
            lines)))

(defn- draw-text-block!
  "Draw wrapped plain `text` top-aligned within `[x, top-y]`, bounded by `max-w`/`max-h`. Right-to-left
  text (Arabic/Hebrew) is flush-right within `max-w`; everything else is flush-left. When `color` is
  given, every run is forced to it (otherwise the face's natural colour is used).

  Returns the vertical points consumed.

  This expresses the text as a single styled run and reuses the shared Markdown layout/draw pipeline
  ([[typeset/words->lines]] + [[draw-item-lines!]]) so there is one wrapping/measuring/drawing path for all text."
  [^PDPageContentStream cs face font-pt ^Color color x top-y max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [runs  [(merge {:text (str text)}
                        (get typeset/face-id->style (:id face)))]
          lines (into [] (if-not color
                           identity
                           (map (fn [line]
                                  (mapv #(assoc % :color color) line))))
                      (typeset/words->lines (typeset/runs->words runs) font-pt false max-w))
          y     (draw-item-lines! cs lines x max-w top-y (- top-y max-h)
                                  font-pt (font/base-rtl? text) nil x nil)]
      (- top-y y))))

(defn- draw-code-block!
  "Draws a monospaced code block.

  Returns the `y` below the block. Restores the font and color."
  [^PDPageContentStream cs block x top-y _cell-w _bottom scale]
  (.setNonStrokingColor cs ^Color common/code-color)
  (let [font (font/face :mono)
        pt   (* 9.0 scale)
        lh   (* pt common/line-height-factor)
        y    (reduce (fn [y line]
                       (draw-line! cs font pt (+ x 4.0) (- y pt) line)
                       (- y lh))
                     top-y
                     (str/split-lines (str (:text block))))]
    (.setNonStrokingColor cs Color/BLACK)
    (- y 2.0)))

(defn- inner-draw-image!
  "Inner function to draw an image from a Markdown doc into the PDF. Call [[draw-image-block!]] instead.

  Returns the y below the block."
  [^PDImageXObject img ^PDPageContentStream cs x top-y cell-w bottom]
  (let [iw              (.getWidth img)
        ih              (.getHeight img)
        avail-h         (- top-y bottom)
        draw-w          cell-w
        draw-h          (* draw-w (/ ih iw))
        [draw-w draw-h] (if (> draw-h avail-h)
                          [(* avail-h (/ iw ih)) avail-h]
                          [draw-w draw-h])
        y               (- top-y draw-h)]
    (.drawImage cs img (float x) (float y) (float draw-w) (float draw-h))
    (- y 4.0)))

(defn- inner-draw-image-fallback!
  "Inner function to draw the fallback when a Markdown image failed to fetch. Call [[draw-image-block!]] instead.

  Returns the y below the block."
  [^PDPageContentStream cs {:keys [alt src] :as _block} x top-y cell-w bottom scale]
  (let [pt   (* common/text-card-pt scale)
        txt  (if (str/blank? alt) src alt)
        used (draw-text-block! cs (font/face :regular) pt common/link-color x top-y cell-w
                               (- top-y bottom) txt)]
    (when (and *link-rects* (clickable-href? src))
      (swap! *link-rects* conj {:x0   x
                                :y0   (- top-y used)
                                :x1   (+ x cell-w)
                                :y1   top-y
                                :href src}))
    (- top-y used 4.0)))

(defn- draw-image-block!
  "Draw a Markdown image: securely fetch + embed it scaled to the cell width (clamped to the
  remaining height). If the fetch fails for any reason, fall back to a Markdown link (the alt text
  or URL, in link color). Returns the y below the block."
  [^PDDocument doc ^PDPageContentStream cs block x top-y cell-w bottom scale]
  (if-let [^PDImageXObject img (md/fetch-image! doc (:src block))]
    (inner-draw-image! img cs x top-y cell-w bottom)
    (inner-draw-image-fallback! cs block x top-y cell-w bottom scale)))

(defn- draw-hr-block!
  "Draw a Markdown `:hr` block. Returns the y below the block."
  [^PDPageContentStream cs x top-y cell-w scale]
  (let [y (- top-y (* 5.0 scale))]
    (doto cs
      (.setStrokingColor ^Color common/body-color)
      (.moveTo (float x) (float y))
      (.lineTo (float (+ x cell-w)) (float y))
      (.stroke)
      (.setStrokingColor Color/BLACK))
    (- y (* 5.0 scale))))

(defn- draw-paragraph-block!
  [^PDPageContentStream cs
   {:keys [indent kind level marker runs] :as _block}
   x top-y cell-w bottom scale]
  (let [heading?    (= :heading kind)
        base-pt     (* scale (if heading?
                               (typeset/heading-pt level)
                               common/text-card-pt))
        indent-x    (+ x (* 14.0 (long (or indent 0))))
        ;; markers ("- ", "1. ") are ASCII; keep their trailing space (sanitize would trim it)
        marker-font (font/face :regular)
        marker-w    (if marker
                      (font/text-width marker-font base-pt marker)
                      0.0)
        content-x   (+ indent-x marker-w)
        content-w   (- (+ x cell-w) content-x)
        ;; right-align RTL paragraphs and headings; list items (those with a marker) stay
        ;; left-aligned for now -- proper RTL lists (marker on the right) are a separate change.
        rtl?        (and (nil? marker)
                         (font/base-rtl? (apply str (map typeset/item-text runs))))
        lines       (typeset/words->lines (typeset/runs->words runs) base-pt heading? content-w)]
    (draw-item-lines! cs lines content-x content-w top-y bottom base-pt rtl? marker indent-x marker-font)))

(defn- draw-block!
  "Draw one markdown block within `[x, top-y]` of `cell-w`, clipping at `bottom`.

  Returns the y below the block (top of the next)."
  [^PDDocument doc ^PDPageContentStream cs block x top-y cell-w bottom scale]
  (case (:kind block)
    :hr         (draw-hr-block! cs x top-y cell-w scale)
    :image      (draw-image-block! doc cs block x top-y cell-w bottom scale)
    :code-block (draw-code-block! cs block x top-y cell-w bottom scale)
    ;; heading / paragraph / list-item
    (draw-paragraph-block! cs block x top-y cell-w bottom scale)))

(defn- draw-markdown-in-cell!
  "Render markdown `text` top-down within a cell rectangle.

  Shrinks the font (down to a floor, see [[typeset/fit-scale]]) so the content fits the cell height instead of clipping.
  If it doesn't fit even at the limit of scaling down, we do clip the output."
  [^PDDocument doc ^PDPageContentStream cs x top-y cell-w cell-h text]
  (let [blocks (md/parse-markdown-blocks text)
        scale  (typeset/fit-scale blocks cell-w cell-h)
        bottom (- top-y cell-h)]
    (reduce (fn [y block]
              (if (<= y (+ bottom 2.0))
                y
                (- (draw-block! doc cs block x y cell-w bottom scale)
                   (* 4.0 scale))))
            top-y blocks)))

;; --------------------------------------------------------------------------------------------
;; Cell building -- turn dashcards into renderable cells, preserving grid geometry
;; --------------------------------------------------------------------------------------------

(defn- iframe-url
  "Extract the target URL from an iframe card's `:iframe` setting, which is either a bare URL or an
  `<iframe src=\"...\">` embed snippet (mirrors the frontend's handling). Adds an `https://` scheme if missing.

  Returns nil if no URL can be found."
  [iframe-setting]
  (when-let [s (some-> iframe-setting str str/trim not-empty)]
    (when-let [raw (some-> (if (str/starts-with? s "<iframe")
                             (second (re-find #"(?i)\bsrc\s*=\s*[\"']([^\"']+)[\"']" s))
                             s)
                           str/trim
                           not-empty)]
      (if (re-find #"(?i)^[a-z][a-z0-9+.-]*://" raw)
        raw
        (str "https://" (str/replace raw #"^//" ""))))))

(defn- resolve-inline-params
  "The full parameter definitions (carrying values) for a dashcard's inline parameters, matching how email
  subscriptions resolve them.

  Returns only those with a value, in `parameters` order."
  [dashcard parameters]
  (when-let [ids (not-empty (set (:inline_parameters dashcard)))]
    (not-empty (filterv #(and (ids (:id %))
                              (some? (:value %)))
                        parameters))))

(defn- virtual-dashcard->text [dashcard parameters]
  (-> (notification.payload/process-virtual-dashcard dashcard parameters)
      :visualization_settings
      :text))

(defn- dashcard->cell
  "Build a renderable cell from a dashcard, preserving its grid geometry.

  Returns nil for dashcard kinds we don't render (placeholder/action) or cards that fail/are empty."
  [dashcard parameters]
  (let [inline (resolve-inline-params dashcard parameters)
        geom   (cond-> (select-keys dashcard [:row :col :size_x :size_y])
                 (seq inline) (assoc :inline-params inline))]
    (cond
      (:card_id dashcard)
      (when-let [part (notification.payload/execute-dashboard-subscription-card dashcard parameters)]
        (assoc geom
               :kind :card
               :part (cond-> part
                       (seq inline) (assoc :inline-params inline))))

      (notification.payload/virtual-card-of-type? dashcard "heading")
      (assoc geom :kind :heading, :text (virtual-dashcard->text dashcard parameters))

      (notification.payload/virtual-card-of-type? dashcard "text")
      (assoc geom :kind :text, :text (virtual-dashcard->text dashcard parameters))

      ;; link cards render as a markdown `### [name](url)` text cell (clickable like any md link);
      ;; reuse the email conversion so they match, and so entity links are permission-checked.
      (notification.payload/virtual-card-of-type? dashcard "link")
      (when-let [part (notification.payload/dashcard-link-card->part dashcard)]
        (assoc geom :kind :text, :text (:text part)))

      ;; iframe cards (embedded video/web players) can't render in a PDF -- show the target as a
      ;; clickable link instead (autolinked bare URL).
      (notification.payload/virtual-card-of-type? dashcard "iframe")
      (when-let [url (iframe-url (get-in dashcard [:visualization_settings :iframe]))]
        (assoc geom :kind :text, :text url))

      :else nil)))

(defn- build-cells
  "Order a tab's (or the untabbed dashboard's) dashcards and build cells, normalizing row numbers so the first
  row of the section is 0."
  [dashcards parameters]
  (let [sorted  (sort dashboard-card/dashcard-comparator dashcards)
        min-row (if (seq sorted)
                  (apply min (map :row sorted))
                  0)]
    (into [] (comp (keep #(dashcard->cell % parameters))
                   (map  #(update % :row - min-row)))
          sorted)))

;; --------------------------------------------------------------------------------------------
;; Pagination -- slice a section's cells into pages, breaking before a card that won't fit
;; --------------------------------------------------------------------------------------------

(defn- paginate
  "Stateful transducer for greedily packing input *cells* (sorted, row-normalized dashboard contents) into pages.
  The first page holds `first-page-rows` grid rows (what's left under the header); continuation pages hold
  `cont-rows`. A card that won't fit in the current page's remaining rows starts a new page; we never split a card
  across pages. Each page records its `:base` row so cells can be positioned relative to the top of the page's card
  area, and its row capacity in `:rows`."
  [first-page-rows cont-rows]
  (let [first? (volatile! true)]
    (typeset/segment
     (fn
       ([c]                            ; open a page
        (let [cap (if @first? first-page-rows cont-rows)]
          (vreset! first? false)
          {:base  (:row c)
           :cards [c]
           :rows  cap}))
       ([{:keys [base rows] :as page} c] ; add this cell, or start a new page
        (let [cbot (+ (:row c) (:size_y c))]
          (if (<= (- cbot base) rows)
            (update page :cards conj c)
            ::typeset/reject)))))))

(defn- pages-for-section
  "Produce positioned pages for one section (a tab, or the whole untabbed dashboard). `idx` is the section's index;
  only the very first section's first page carries the dashboard title, and (when tabbed) every section's first page
  carries the tab title."
  [section idx {:keys [unit rows ^PDRectangle rect]} tabbed? dash-name param-table]
  (let [content-h (- (.getHeight rect) (* 2.0 common/margin))
        ;; the header this section's first page carries: dashboard title + parameters on the very first page
        ;; (section 0), tab title on every tabbed section's first page. Same keys [[draw-header!]] reads.
        header    (cond-> {}
                    (zero? idx) (assoc :dashboard-title dash-name :param-table param-table)
                    tabbed?     (assoc :tab-title (:tab-name section)))
        ;; the grid takes whatever rows fit below the header; continuation pages get the full height
        first-rows (max 1 (long (Math/floor (/ (- content-h (header-height header)) unit))))]
    (into [] (comp (paginate first-rows rows)
                   (map-indexed (fn [pi page]
                                  (cond-> page
                                    (zero? pi) (merge header)))))
          (:cells section))))

;; --------------------------------------------------------------------------------------------
;; Drawing
;; --------------------------------------------------------------------------------------------

(defn- card-body-png
  "Rasterize a `:card` part's body (chart/table/scalar) to PNG bytes, WITHOUT its title or description -- those are
  drawn natively at the PDF level.

  Used for card types that can't fill an arbitrary box (pie, gauge, funnel, progress, scalar, table, ...); resize
  to fit while preserving aspect."
  ^bytes [timezone {:keys [card dashcard result]} px-width]
  (-> (render.card/render-pulse-card :inline timezone card dashcard result
                                     {:channel.render/include-title?       false
                                      :channel.render/include-description? false})
      (render.card/png-from-render-info px-width)))

(defn- draw-image-in-cell!
  "Draw `img`, resizing to fit (preserving aspect) within a cell rectangle, horizontally centered and top-anchored.
  Used for card types that can't fill an arbitrary box (scalar, pie, gauge, ...). Horizontal centering keeps a narrow
  scalar (e.g. a big number) from hugging the left edge of its cell."
  [^PDPageContentStream cs ^PDImageXObject img x top-y cell-w cell-h]
  (let [iw    (.getWidth img)
        ih    (.getHeight img)
        scale (min (/ cell-w iw) (/ cell-h ih))
        dw    (* iw scale)
        dh    (* ih scale)
        dx    (common/h-center x cell-w dw)]
    (.drawImage cs img (float dx) (float (- top-y dh)) (float dw) (float dh))))

(defn- pt->px [pt]
  (-> pt (* common/dpi) (/ 72.0) double Math/round long))
(defn- px->pt ^double [px]
  (* (double px)
     (/ 72.0 common/dpi)))

(defn- card-title [card dashcard]
  (or (get-in dashcard [:visualization_settings :card.title])
      (:name card)))

(defn- effective-display
  "The display type the card actually renders as. A visualizer dashcard overrides the underlying card's `:display`
  (e.g. a smartscalar card shown as a `bar`), so prefer the visualizer display when present. This is the same
  logic as `render.card/visualizer-display-type`."
  [card dashcard]
  (or (when (render.util/is-visualizer-dashcard? dashcard)
        (some-> dashcard :visualization_settings :visualization :display keyword))
      (keyword (:display card))))

(defn- cards-with-data
  "Replicate the multi-series data shape `body/render :javascript_visualization` feeds to static-viz, except timeline
  events, which static-viz never officially used."
  [card dashcard data]
  (->> (:series-results dashcard)
       (map (fn [m]
              (-> m
                  (assoc :data (get-in m [:result :data]))
                  (dissoc :result))))
       (cons {:card card
              :data data})
       (m/distinct-by #(get-in % [:card :id]))))

(defn- sized-chart-png
  "Render an isomorphic chart to a PNG, telling static-viz to lay the chart out into a `w-px` x `h-px` logical box
  (so it fills it the way the frontend does), rasterized at [[common/chart-supersample]] times that pixel size for crispness.

  Used for rectangular charts and for square/wide pies (which then place their legend to the side).

  Returns nil if the chart doesn't produce an SVG."
  ^bytes [card dashcard data w-px h-px]
  (binding [js.svg/*chart-size* {:width       w-px
                                 :height      h-px
                                 :scale       common/chart-supersample
                                 :fit-within? true}]
    (let [viz                    (or (:visualization_settings dashcard)
                                     (:visualization_settings card))
          {:keys [content type]} (js.svg/*javascript-visualization* (cards-with-data card dashcard data) viz)]
      (when (= :svg type)
        (js.svg/svg-string->bytes content)))))

(defn- param-entries
  "Name/value strings for each parameter carrying a non-blank formatted value (via `value-string`,
  like the email filter bar)."
  [params]
  (let [locale (system/site-locale)]
    (vec (for [p     params
               :when (some? (:value p))
               :let  [v (some-> (shared.params/value-string p locale) str str/trim)]
               :when (not (str/blank? v))]
           {:name  (str (:name p))
            :value v}))))

(defn- dashboard-param-entries
  "Entries for the dashboard-wide filter table: only top-level (non-inline) parameters. Inline
  parameters render on their own card instead."
  [params inline-ids]
  (param-entries (remove #(contains? inline-ids (:id %)) params)))

(defn- styled-run-lines
  "Wrap a single styled run (`text` with `style`, e.g. {:bold? true} or {:color ...}) to `max-w` at `common/param-pt`,
  returning drawable item-lines via the shared pipeline."
  [text style max-w]
  (-> [(merge {:text (str text)}
              style)]
      typeset/runs->words
      (typeset/words->lines common/param-pt false max-w)))

(defn- measured-name-units
  "Pre-measured word items for a parameter name (bold, `common/param-pt`) -- input to [[typeset/min-column-width]].
  Runs through the same words pipeline as everything else, as a single run of bold text."
  [name]
  (mapv #(typeset/->measured-item % common/param-pt false)
        (typeset/runs->words [{:text  (font/normalize-ws name)
                               :bold? true}])))

(defn- layout-param-table
  "Lay out filter `entries` as a two-column (name | value) table within `avail-w` starting at `x`.

  The names column is sized by [[typeset/min-column-width]] (capped at 40% of `avail-w`); the rest goes to values.
  The columns swap (values left, names right) when the first parameter's name reads right-to-left.

  Returns nil when there are no valued parameters, else a layout map with the column geometry, the wrapped lines
  per row, and the total `:height`."
  [entries avail-w x]
  (when (seq entries)
    (let [rtl?     (font/base-rtl? (:name (first entries)))
          max-nw   (* 0.4 avail-w)
          name-w   (min max-nw (transduce (map #(typeset/min-column-width (measured-name-units (:name %))
                                                                          max-nw typeset/split-word-into-chars))
                                          max 0.0 entries))
          value-w  (- avail-w name-w common/param-chip-gap)
          name-x   (cond-> x
                     rtl? (+ value-w common/param-chip-gap))
          value-x  (cond-> x
                     (not rtl?) (+ name-w common/param-chip-gap))
          rows     (mapv (fn [{:keys [name value]}]
                           (let [nl (styled-run-lines name  {:bold? true}       name-w)
                                 vl (styled-run-lines value {:color common/body-color} value-w)]
                             {:name-lines  nl
                              :value-lines vl
                              :height      (max (typeset/lines-height nl common/param-pt)
                                                (typeset/lines-height vl common/param-pt))}))
                         entries)]
      {:name-x  name-x  :name-w  name-w
       :value-x value-x :value-w value-w
       :rows    rows
       :height  (transduce (map :height) + 0.0 rows)})))

(defn- lines-rtl?
  "Given a seq of lines, check if the first line starts with RTL characters."
  [lines]
  (-> lines ffirst :text (or "") font/base-rtl?))

(defn- draw-param-table!
  "Draw the parameter `table` from `top-y` (the columns already hold absolute x positions).

  Returns the y below it."
  [^PDPageContentStream cs table top-y]
  (let [{:keys [name-x name-w value-x value-w rows]} table
        y (reduce (fn [y {:keys [name-lines value-lines height] :as _row}]
                    (let [bottom (- y height 1.0)]
                      (draw-item-lines! cs name-lines name-x name-w y bottom common/param-pt
                                        (lines-rtl? name-lines) nil name-x nil)
                      (draw-item-lines! cs value-lines value-x value-w y bottom common/param-pt
                                        (lines-rtl? value-lines) nil value-x nil)
                      (- y height)))
                  top-y
                  rows)]
    ;; values are drawn gray; restore black so a following header line (e.g. a tab title) isn't tinted gray
    (.setNonStrokingColor cs Color/BLACK)
    (- y 4.0)))

(defn- inline-param-lines
  "Wrapped item-lines for a card's inline parameters, flowing inline as `Name: value`, `Name2: value2`,
  ... (bold names, gray values), greedily wrapped to `cell-w` (preserving the previous flow behaviour).
  Returns nil when there are none."
  [inline-params cell-w]
  (when-let [entries (seq (param-entries inline-params))]
    (-> (into [] (comp (map-indexed (fn [i e]
                                      (concat (when (pos? i)
                                                [{:text "  "}]) ; gap before each param after the first
                                              [{:text (:name e) :bold? true}
                                               {:text ": "}
                                               {:text (:value e) :color common/body-color}])))
                       cat)
              entries)
        typeset/runs->words
        (typeset/words->lines common/param-pt false cell-w))))

(defn- inline-params-height
  "Vertical points a card's inline parameter lines consume (0 when there are none)."
  [lines]
  (if (empty? lines)
    0.0
    (+ 4.0 (typeset/lines-height lines common/param-pt))))

(defn- draw-inline-params!
  "Draw inline-parameter `lines` from `top-y` within `[x, x+content-w]`."
  [^PDPageContentStream cs lines x content-w top-y]
  (when (seq lines)
    (draw-item-lines! cs lines x content-w top-y (- top-y
                                                    (typeset/lines-height lines common/param-pt)
                                                    1.0)
                      common/param-pt (lines-rtl? lines) nil x nil)))

(defn- fill-rect!
  "Fill the box whose top-left is `[x, top-y]` (and is `w` x `h`) with `color`, then reset to black.
  Used for the [[*debug-boxes*]] overlays drawn behind content."
  [^PDPageContentStream cs ^Color color x top-y w h]
  (.setNonStrokingColor cs color)
  (.addRect cs (float x) (float (- top-y h)) (float w) (float h))
  (.fill cs)
  (.setNonStrokingColor cs Color/BLACK))

;; --------------------------------------------------------------------------------------------
;; Tables. Render the card's HTML table width-filled inside a height-capped wrapper with a row-count
;; footer, supersampled; the outer frame is stroked natively (see [[draw-table-card!]]).
;; --------------------------------------------------------------------------------------------

(def ^:private table-supersample
  "Supersampling factor for table rasters: laid out at logical size but rendered to this many times
  more device pixels for crisp text at the same on-page size. Shares [[chart-supersample]]'s magnitude."
  common/chart-supersample)

(def ^:private table-footer-px
  "Logical-pixel height of the `N rows` footer row at the bottom of a table image."
  32)

(def ^:private table-frame-color
  "Colour of the card's outer frame, stroked natively -- CSSBox's raster is 1px shorter than the
  bordered box, so an HTML bottom border would be clipped. Also the in-image footer divider, as CSS
  via [[table-border-color]]."
  (Color. 0xF0 0xF0 0xF0))

(def ^:private table-border-color
  "CSS form of [[table-frame-color]] for the in-image footer divider (`border-top` above the `N rows` row)."
  (format "#%06X" (bit-and (.getRGB ^Color table-frame-color) 0xFFFFFF)))

(def ^:private table-css
  "CSS appended to the inner `<table>` so it fits the card frame: fill the width, no border/radius/
  margin of its own (the native frame and per-cell dividers remain)."
  ";width:100%;box-sizing:border-box;border:none;border-radius:0;margin:0;")

(def ^:private header-divider-css
  "CSS appended to a header cell for the divider after it, matching the body cells' dividers."
  (format ";border-right:1px solid %s;" table-border-color))

(defn- element?
  "Whether `form` is a Hiccup element with tag `tag`, i.e. `[tag ...]`."
  [form tag]
  (and (vector? form) (= tag (first form))))

(defn- th-cell? [el] (element? el :th))

(defn- header-row?
  "Whether a `:tr` holds header (`:th`) cells -- which `render-table-head` nests inside a lazy seq."
  [tr]
  (some (fn [el] (or (th-cell? el) (and (seq? el) (some th-cell? el)))) tr))

(defn- append-style
  "Append `css` to the `:style` of Hiccup element `el`'s attrs map."
  [el css]
  (update-in el [1 :style] str css))

(defn- add-header-dividers
  "Add a `border-right` to each header cell but the last, matching the body (the renderer leaves
  header cells border-less). They arrive spliced in a nested seq, so flatten the row first."
  [tr]
  (let [items   (into [] (mapcat (fn [el] (if (seq? el) el [el]))) tr)
        last-th (->> items (keep-indexed (fn [i el] (when (th-cell? el) i))) last)]
    (into []
          (map-indexed (fn [i el]
                         (cond-> el
                           (and (th-cell? el) (map? (second el)) (not= i last-th))
                           (append-style header-divider-css))))
          items)))

(defn- restyle-form
  "Restyle one walked Hiccup form: the `<table>` gets [[table-css]]; header rows get per-cell
  dividers. Everything else passes through."
  [form]
  (cond
    (and (element? form :table) (map? (second form)))
    (append-style form table-css)

    (and (element? form :tr) (header-row? form))
    (add-header-dividers form)

    :else form))

(defn- restyle-table
  "Restyle the inner `<table>` to fit the card frame: fill the width, drop its own border/radius/margin
  (the native frame and per-cell dividers remain), and add header dividers to match the body."
  [content]
  (walk/postwalk restyle-form content))

(def ^:private table-footer-css
  "Style of the `N rows` footer row at the bottom of a table image."
  (format (str "height:%1$dpx;line-height:%1$dpx;box-sizing:border-box;"
               "font-size:12.5px;text-align:right;padding-right:16px;"
               "color:#696E7B;border-top:1px solid %2$s")
          table-footer-px table-border-color))

(defn- table-body-png
  "Render a table card body to PNG bytes sized to the `px-w` x `px-h` cell (logical pixels):
  width-filled, height-capped, with a row-count footer, supersampled at [[table-supersample]]x."
  ^bytes [timezone {:keys [card dashcard result]} px-w px-h]
  (let [;; Render directly, not via render-pulse-card: its <p>/.pulse-body margins escape CSSBox's
        ;; height clip and push the image past the cell. body/render gives the bare table.
        info     (body/render :table :inline timezone card dashcard (:data result))
        n-rows   (count (get-in result [:data :rows]))
        clip-css (format "max-height:%dpx;overflow:hidden" (max 0 (- (long px-h) table-footer-px 2)))
        ;; the frame is stroked natively in draw-table-card!, so this wrapper has no border
        content  [:div
                  [:div {:style clip-css} (restyle-table (:content info))]
                  [:div {:style table-footer-css} (trun "{0} row" "{0} rows" n-rows)]]]
    (png/render-html-to-png (assoc info :content content) px-w {:channel.render/scale table-supersample})))

(defn- move-to! [^PDPageContentStream cs x y] (.moveTo cs (float x) (float y)))
(defn- line-to! [^PDPageContentStream cs x y] (.lineTo cs (float x) (float y)))

(defn- curve-to!
  "Append a cubic Bézier from the current point via control points `[x1 y1]` and `[x2 y2]` to `[x3 y3]`."
  [^PDPageContentStream cs x1 y1 x2 y2 x3 y3]
  (.curveTo cs (float x1) (float y1) (float x2) (float y2) (float x3) (float y3)))

(def ^:private bezier-circle-kappa
  "Control-point distance, as a fraction of the radius, at which a cubic Bézier best approximates a
  quarter circle."
  0.5523)

(defn- corner-to!
  "Append a quarter-circle corner around the rectangle corner `[ax ay]`: a cubic Bézier from the
  current point (`r` before the corner along incoming-edge direction `[dx1 dy1]`) to the point `r`
  past it along outgoing-edge direction `[dx2 dy2]`, with control points `c` short of the corner."
  [cs r c ax ay dx1 dy1 dx2 dy2]
  (let [r  r
        rc (- r c)]
    (curve-to! cs
               (- ax (* rc dx1)) (- ay (* rc dy1))
               (+ ax (* rc dx2)) (+ ay (* rc dy2))
               (+ ax (* r  dx2)) (+ ay (* r  dy2)))))

(defn- stroke-round-rect!
  "Stroke a rounded-rectangle outline whose top-left is `[x, top-y]` (and is `w` x `h`) with `color`
  at `line-w` points and corner radius `r` points, then reset to a black hairline. Corners are
  quarter-circle cubic Béziers (see [[corner-to!]])."
  [^PDPageContentStream cs ^Color color line-w r x top-y w h]
  (let [l  x
        t  top-y
        rt (+ l w)
        b  (- t h)
        r  (min r (/ w 2.0) (/ h 2.0))
        c  (* r bezier-circle-kappa)]
    (.setStrokingColor cs color)
    (.setLineWidth cs (float line-w))
    (move-to!   cs (+ l r) t)
    (line-to!   cs (- rt r) t)               ; top edge
    (corner-to! cs r c rt t   1  0   0 -1)   ; TR
    (line-to!   cs rt (+ b r))               ; right edge
    (corner-to! cs r c rt b   0 -1  -1  0)   ; BR
    (line-to!   cs (+ l r) b)                ; bottom edge
    (corner-to! cs r c l  b  -1  0   0  1)   ; BL
    (line-to!   cs l (- t r))                ; left edge
    (corner-to! cs r c l  t   0  1   1  0)   ; TL
    (.stroke cs)
    (.setStrokingColor cs Color/BLACK)
    (.setLineWidth cs (float 1.0))))

(defn- supersampled-px->pt
  "Points spanned on the page by `px` device pixels of a [[table-supersample]]-rastered image."
  ^double [px]
  (px->pt (/ (double px) table-supersample)))

(defn- draw-table-card!
  "Draw the table card body fitted to `[x, body-top]` x `cell-w` x `body-h`, with the card's outer
  frame stroked natively around the image."
  [^PDDocument doc ^PDPageContentStream cs timezone part x body-top cell-w body-h]
  (let [img (PDImageXObject/createFromByteArray
             doc (table-body-png timezone part (pt->px cell-w) (pt->px body-h)) "table")
        ;; image is at table-supersample x logical pixels -> divide back to points
        dw  (supersampled-px->pt (.getWidth img))
        dh  (supersampled-px->pt (.getHeight img))]
    (.drawImage cs img (float x) (float (- body-top dh)) (float dw) (float dh))
    (stroke-round-rect! cs table-frame-color 0.5 4.0 x body-top dw dh)))

(def ^:private no-results-image-bytes
  "Raw bytes of the 'no results' sail-boat asset (the same image the email/dashboard empty state uses), read once."
  (delay
    (with-open [is (io/input-stream (io/resource "frontend_client/app/assets/img/no_results.png"))]
      (.readAllBytes is))))

(def ^:private no-results-icon-pt
  "On-page size (points) of the no-results sail-boat icon, before shrinking to fit a small card body."
  84.0)

(defn- draw-no-results!
  "Draw the empty-state placeholder -- the sail-boat icon above a centered 'No results' label -- centered in a card's
  body area. Shown when a card's query returns no rows (e.g. everything filtered out): rather than letting chart
  rendering fail and overprint the title with an error box, we show the same friendly empty state the dashboard and
  email do (see [[metabase.channel.render.body/render]] `:empty`).

  Drawn natively (asset image + native text) rather than via the HTML pipeline so it centers crisply and reliably.
  The icon + label form one block, centered both horizontally and vertically in the body rectangle; the icon shrinks
  to fit when the body is short."
  [^PDDocument doc ^PDPageContentStream cs x body-top cell-w body-h]
  (let [label          (str (tru "No results"))
        label-pt       common/text-card-pt
        gap            6.0
        img            (PDImageXObject/createFromByteArray doc @no-results-image-bytes "no-results")
        ;; square icon, capped to its design size and shrunk to leave room for the label in a short body
        side           (max 0.0 (min no-results-icon-pt cell-w (- body-h label-pt gap)))
        block-h        (+ side gap label-pt)
        ;; top edge of the icon, so the whole icon+label block is vertically centered in the body band
        icon-top       (common/v-center body-top body-h block-h)
        icon-x         (common/h-center x cell-w side)
        label-w        (font/text-width (font/face :regular) label-pt label)
        label-x        (common/h-center x cell-w label-w)
        label-baseline (- icon-top side gap label-pt)]
    (.drawImage cs img (float icon-x) (float (- icon-top side)) (float side) (float side))
    (.setNonStrokingColor cs ^Color common/body-color)
    (draw-line! cs (font/face :regular) label-pt label-x label-baseline label)
    (.setNonStrokingColor cs Color/BLACK)))

(defn- render-card-cell!
  "Render a chart/query card into its cell rectangle. The title is drawn natively at the PDF level (crisp text) and
  the space it consumes is reserved before the body is rendered. Card descriptions are intentionally omitted -- they
  vary from the frontend dashboard and add little in a static export.

  Rectangular (ECharts/visx) charts are then rendered to exactly fill the remaining body area (matching the frontend);
  other types render their body title-less and resized (preserving aspect) to fit into the body area."
  [^PDDocument doc ^PDPageContentStream cs timezone
   {:keys [card dashcard inline-params]
    {:keys [data]} :result
    :as part}
   x top-y cell-w cell-h]
  (let [title      (card-title card dashcard)
        title-h    (typeset/text-block-height (font/face :bold) common/chart-title-pt cell-w (* 0.5 cell-h) title)
        ;; Inline parameters (filters attached to this card) render between the title and the chart body,
        ;; like the email subscription does.
        ip-lines   (inline-param-lines inline-params cell-w)
        iph        (inline-params-height ip-lines)
        header     (+ title-h iph (if (or (pos? title-h)
                                          (pos? iph))
                                    4.0
                                    0.0))
        top-y      (double top-y)
        body-top   (- top-y header)
        body-h     (- cell-h header)
        display    (effective-display card dashcard)
        ;; Rectangular charts always fill their box; pies fill (and move their legend to the
        ;; side) only when the body area is square-or-wider, otherwise they keep a bottom legend.
        fill?      (or (contains? rectangular-displays display)
                       (and (= :pie display)
                            (>= cell-w body-h)))
        ;; tables, pivots, and table fallbacks (map/object/unknown) all detect as :table; a result with no
        ;; rows (e.g. filtered out) detects as :empty regardless of display, and gets the no-results placeholder.
        chart-type (render.card/detect-pulse-chart-type card dashcard data)
        table?     (= :table chart-type)
        empty?     (= :empty chart-type)]
    ;; Debug overlays (drawn first, so content sits on top): the full title box (blue) and the full
    ;; chart-body box (red) -- the *allocated* space, regardless of how much the content fills.
    (when *debug-boxes*
      (when (pos? title-h)  (fill-rect! cs debug-heading-color x top-y cell-w title-h))
      (when (> body-h 12.0) (fill-rect! cs debug-chart-color x body-top cell-w body-h)))
    ;; Native title for every card type.
    (draw-text-block! cs (font/face :bold) common/chart-title-pt nil x top-y cell-w (* 0.5 cell-h) title)
    ;; Inline parameters.
    (when (seq ip-lines)
      (draw-inline-params! cs ip-lines x cell-w (- top-y title-h)))
    (when (> body-h 12.0)
      ;; in debug mode render charts transparently, so the red box behind them shows through the
      ;; whitespace ECharts/visx leave inside the image.
      (binding [js.svg/*svg-background-color* (when-not *debug-boxes*
                                                js.svg/*svg-background-color*)]
        (b/cond
          ;; no rows: show the centered no-results placeholder instead of attempting (and failing) to draw a chart
          empty?
          (draw-no-results! doc cs x body-top cell-w body-h)

          :let [png (when fill?
                      (sized-chart-png card dashcard data (pt->px cell-w) (pt->px body-h)))]

          ;; rectangular charts (and wide pies): fill the body area exactly
          png
          (.drawImage cs (PDImageXObject/createFromByteArray doc png "chart")
                      (float x) (float (- body-top body-h))
                      (float cell-w) (float body-h))

          table?
          (draw-table-card! doc cs timezone part x body-top cell-w body-h)

          ;; other types (and charts whose render produced no SVG): title-less body PNG,
          ;; fit preserving aspect
          :else
          (when-let [body (card-body-png timezone part (-> cell-w pt->px (min 2200) (max 240) long))]
            (draw-image-in-cell! cs (PDImageXObject/createFromByteArray doc body "card")
                                 x body-top cell-w body-h)))))))

(defn- line-start-x
  "Start x for drawing a single line of `text` (measured with `face`/`font-pt`) within the box
  `[x, x+box-w]`: flush-right when the text's base direction is RTL, flush-left otherwise."
  [face font-pt x box-w ^String text]
  (cond-> (double x)
    (font/base-rtl? text) (+ (max 0.0 (- box-w (font/text-width face font-pt text))))))

;; --------------------------------------------------------------------------------------------
;; "Made with Metabase" branding badge -- drawn top-right of every page. The logo + "Metabase"
;; wordmark come from an SVG whose glyphs are already `<path>` outlines, streamed into the content
;; stream as moveTo/lineTo/curveTo/fill so they stay crisp at any zoom. The "Made with" prefix is
;; ordinary text in the regular body face (Lato, with the usual per-glyph Noto/CJK fallback -- see
;; [[font/load-fonts!]] and [[font/font-runs]]). The badge sits in the empty top common/margin band, so it never
;; collides with the dashboard title (left) or the first card row.
;; --------------------------------------------------------------------------------------------

(def ^:private brand-logo-resource "fonts/pdf/metabase_logo_with_text.svg")

(def ^:private brand-svg-colors
  "Resolves the logo SVG's `var(--mb-color-logo-*)` CSS variables to the Metabase brand colors."
  {"--mb-color-logo-text"      (Color. 0x5A 0x60 0x72)
   "--mb-color-logo-primary"   (Color. 0x50 0x9E 0xE3)
   "--mb-color-logo-secondary" (Color. 0xC2 0xDA 0xF0)})

(def ^:private ^Color brand-text-color (Color. 0x5A 0x60 0x72))
(def ^:private brand-logo-pt 13.0)
(def ^:private brand-text-pt 9.0)
(def ^:private brand-gap-pt 5.0)

(defn- resolve-svg-color ^Color [fill]
  (if-let [[_ v] (re-matches #"var\((--[^)]+)\)" fill)]
    (get brand-svg-colors v Color/BLACK)
    (Color/decode fill)))

(def ^:private brand-logo
  "Parsed logo SVG -- `{:vw _ :vh _ :groups [{:color <Color> :ds [<d-string> ...]} ...]}`. Delayed
  because the asset is static; parsed by regex over the controlled, self-owned resource (the `d`
  attributes contain no quotes, so this is robust here)."
  (delay
    (let [svg          (slurp (io/resource brand-logo-resource))
          [_ vbw vbh]  (re-find #"viewBox=\"0 0 ([\d.]+) ([\d.]+)\"" svg)]
      {:vw     (Double/parseDouble vbw)
       :vh     (Double/parseDouble vbh)
       :groups (vec (for [[_ fill body] (re-seq #"(?s)<g fill=\"([^\"]+)\">(.*?)</g>" svg)]
                      {:color (resolve-svg-color fill)
                       :ds    (mapv second (re-seq #"d=\"([^\"]+)\"" body))}))})))

(def ^:private two-thirds
  "The quadratic->cubic Bézier lift factor (see [[emit-shape!]])."
  (/ 2.0 3.0))

(defn- emit-shape!
  "Append `shape` to the current PDFBox path as one filled region -- a single nonzero-winding `fill`,
  so holes (the inside of an 'o', a counter, etc.) survive. `xform` maps the shape's coordinates into
  page space; the result is emitted with PDFBox's `moveTo`/`lineTo`/`curveTo`/`closePath`.

  Walks the shape with a `java.awt.geom.PathIterator`, whose segments are move/line/quadratic/cubic/
  close. PDF has no quadratic curves, so a quadratic is raised to the equivalent cubic. Two points are
  threaded through the walk:
   - `pen`   -- the current point. The quadratic->cubic lift needs the segment's *start* point, which
                the iterator never reports (it gives only the control and end points).
   - `start` -- the start of the current subpath, where a close returns the pen."
  [^PDPageContentStream cs ^java.awt.Shape shape ^AffineTransform xform]
  (let [iter   (.getPathIterator shape xform)
        ;; `currentSegment` writes the segment's coordinates here: 1 point for move/line, 2 for a
        ;; quadratic (control, end), 3 for a cubic (control1, control2, end). Reused each iteration.
        coords (double-array 6)]
    (loop [pen-x 0.0, pen-y 0.0, start-x 0.0, start-y 0.0]
      (if (.isDone iter)
        (.fill cs)
        (let [seg (.currentSegment iter coords)]
          (condp == seg
            PathIterator/SEG_MOVETO                        ; begin a new subpath
            (let [x (aget coords 0), y (aget coords 1)]
              (.moveTo cs (float x) (float y))
              (.next iter)
              (recur x y x y))                             ; pen and subpath-start both move here

            PathIterator/SEG_LINETO
            (let [x (aget coords 0), y (aget coords 1)]
              (.lineTo cs (float x) (float y))
              (.next iter)
              (recur x y start-x start-y))

            PathIterator/SEG_QUADTO                         ; quadratic -> equivalent cubic
            ;; a quadratic from `pen` through control `ctrl` to `end` is the cubic with control points
            ;; `pen + 2/3*(ctrl - pen)` and `end + 2/3*(ctrl - end)`.
            (let [ctrl-x (aget coords 0), ctrl-y (aget coords 1)
                  end-x  (aget coords 2), end-y  (aget coords 3)]
              (.curveTo cs
                        (float (+ pen-x (* two-thirds (- ctrl-x pen-x))))
                        (float (+ pen-y (* two-thirds (- ctrl-y pen-y))))
                        (float (+ end-x (* two-thirds (- ctrl-x end-x))))
                        (float (+ end-y (* two-thirds (- ctrl-y end-y))))
                        (float end-x) (float end-y))
              (.next iter)
              (recur end-x end-y start-x start-y))

            PathIterator/SEG_CUBICTO
            (let [ctrl1-x (aget coords 0), ctrl1-y (aget coords 1)
                  ctrl2-x (aget coords 2), ctrl2-y (aget coords 3)
                  end-x   (aget coords 4), end-y   (aget coords 5)]
              (.curveTo cs (float ctrl1-x) (float ctrl1-y) (float ctrl2-x) (float ctrl2-y)
                        (float end-x) (float end-y))
              (.next iter)
              (recur end-x end-y start-x start-y))

            PathIterator/SEG_CLOSE
            (do (.closePath cs)
                (.next iter)
                (recur start-x start-y start-x start-y))))))))   ; pen returns to the subpath start

(defn- draw-brand-logo!
  "Draw the logo+wordmark SVG with its top-left at (`x`, `top`), scaled to height `h` preserving aspect.

  Returns the drawn width."
  [^PDPageContentStream cs x top h]
  (let [{:keys [vw vh groups]} @brand-logo
        scale (double (/ h vh))
        ;; SVG user space (y-down) -> PDF (y-up): place SVG (0,0) at (x, top).
        xform (AffineTransform. scale 0.0 0.0 (- scale) (double x) (double top))]
    (doseq [{:keys [^Color color ds]} groups]
      (.setNonStrokingColor cs color)
      (doseq [d ds]
        (emit-shape! cs (AWTPathProducer/createShape (StringReader. d) PathIterator/WIND_NON_ZERO) xform)))
    (.setNonStrokingColor cs Color/BLACK)
    (* vw scale)))

(defn- draw-brand-badge!
  "Draw the 'Made with [logo] Metabase' badge, right-aligned to `right`, with the logo's top at
  `logo-top` (placed in the page's top common/margin band). The 'Made with' prefix is localized to the
  current user's locale ([[tru]]) and drawn in the regular body face -- Lato, with the usual
  per-glyph Noto/CJK fallback (see [[font/font-runs]]) -- so it renders across scripts; the logo +
  'Metabase' wordmark are locale-independent SVG vectors."
  [^PDPageContentStream cs right logo-top]
  (let [{:keys [vw vh]} @brand-logo
        text-face (font/face :regular)
        prefix    (str (tru "Made with"))
        logo-w    (* brand-logo-pt (/ vw vh))
        text-w    (font/text-width text-face brand-text-pt prefix)
        logo-x    (- right logo-w)
        text-x    (- logo-x brand-gap-pt text-w)
        ;; vertically center the text's cap (~0.7*pt tall) on the logo's middle
        baseline  (- logo-top (/ brand-logo-pt 2.0) (* brand-text-pt 0.35))]
    (.setNonStrokingColor cs brand-text-color)
    (draw-line! cs text-face brand-text-pt text-x baseline prefix)
    (.setNonStrokingColor cs Color/BLACK)
    (draw-brand-logo! cs logo-x logo-top brand-logo-pt)))

(defn- draw-header!
  [^PDPageContentStream cs page-height content-w {:keys [dashboard-title tab-title param-table]}]
  (let [bold (font/face :bold)
        top  (- page-height common/margin)
        ;; "Made with Metabase" badge, vector-drawn in the empty top common/margin band, right-aligned
        _    (draw-brand-badge! cs (+ common/margin content-w)
                                (common/v-center page-height common/margin brand-logo-pt))
        ;; order: dashboard title, then the dashboard-wide parameter table, then the tab title
        y1   (if dashboard-title
               (do (draw-line! cs bold common/dashboard-title-pt
                               (line-start-x bold common/dashboard-title-pt common/margin content-w dashboard-title)
                               (- top common/dashboard-title-pt) dashboard-title)
                   (- top (header-block-pt common/dashboard-title-pt)))
               top)
        y2   (if param-table
               (draw-param-table! cs param-table y1)
               y1)]
    (when tab-title
      (draw-line! cs bold common/tab-title-pt
                  (line-start-x bold common/tab-title-pt common/margin content-w tab-title)
                  (- y2 common/tab-title-pt) tab-title))))

(defn- add-link-annotations!
  "Add a clickable URI link annotation to `pg` for each collected rectangle. This is an invisible border, the link
  text is already coloured."
  [^PDPage pg rects]
  (when (seq rects)
    (let [annots (.getAnnotations pg)]
      (doseq [{:keys [x0 y0 x1 y1 href]} rects]
        (let [rect   (doto (PDRectangle.)
                       (.setLowerLeftX (float x0)) (.setLowerLeftY (float y0))
                       (.setUpperRightX (float x1)) (.setUpperRightY (float y1)))
              border (doto (PDBorderStyleDictionary.) (.setWidth (float 0)))
              link   (doto (PDAnnotationLink.)
                       (.setRectangle rect)
                       (.setBorderStyle border)
                       (.setAction (doto (PDActionURI.)
                                     (.setURI (str href)))))]
          (.add annots link)))
      ;; re-attach the list so the /Annots array is written when the page has none yet
      (.setAnnotations pg annots))))

(defn- with-cell-inline-params!
  "Draw a virtual cell's content via `draw-content!` (a fn of the available content height), reserving space at the
  bottom of the cell for its inline parameter chips and drawing them there afterward. Mirrors how email renders a
  heading/text card's filters below it."
  [^PDPageContentStream cs x top-y cell-w cell-h inline-params draw-content!]
  (let [ip-lines (inline-param-lines inline-params cell-w)
        iph      (inline-params-height ip-lines)]
    (draw-content! (- cell-h iph))
    (when (seq ip-lines)
      (draw-inline-params! cs ip-lines x cell-w (- top-y
                                                   (- cell-h iph))))))

(defn- render-page!
  [^PDDocument doc {:keys [^PDRectangle rect unit]} timezone page]
  (let [pg            (PDPage. rect)
        _             (.addPage doc pg)
        ph            (.getHeight rect)
        cs            (PDPageContentStream. doc pg)
        card-area-top (- ph common/margin (header-height page))]
    (binding [*link-rects* (atom [])]
      (try
        (draw-header! cs ph (* common/grid-cols unit) page)
        (doseq [cell (:cards page)]
          (let [rr     (- (:row cell) (:base page))
                half   (/ common/gutter-pt 2.0)
                ;; inset each card's grid rectangle by half a gutter so neighbours are separated
                ;; by a full gutter; heading/text cells keep their bottom half (so a one-row
                ;; section header still fits its text -- it gets a half gutter below instead).
                text?  (contains? #{:heading :text} (:kind cell))
                x      (+ common/margin (* (:col cell) unit) half)
                top-y  (- card-area-top (* rr unit) half)
                cell-w (- (* (:size_x cell) unit) common/gutter-pt)
                cell-h (min (- top-y common/margin)
                            (- (* (:size_y cell) unit)
                               (if text?
                                 half
                                 common/gutter-pt)))]
            (try
              ;; debug overlay: the full heading-card cell (blue), drawn behind its text
              (when (and *debug-boxes*
                         (= :heading (:kind cell)))
                (fill-rect! cs debug-heading-color x top-y cell-w cell-h))
              (case (:kind cell)
                :card    (render-card-cell! doc cs timezone (:part cell) x top-y cell-w cell-h)
                :heading (with-cell-inline-params! cs x top-y cell-w cell-h (:inline-params cell)
                           #(draw-text-block! cs (font/face :bold) common/heading-card-pt nil x top-y cell-w % (:text cell)))
                :text    (with-cell-inline-params! cs x top-y cell-w cell-h (:inline-params cell)
                           #(draw-markdown-in-cell! doc cs x top-y cell-w % (:text cell)))
                nil)
              (catch Throwable e
                (log/error e "Error rendering dashboard PDF cell; substituting placeholder")
                (draw-text-block! cs (font/face :regular) 10.0 nil x top-y cell-w cell-h
                                  "[Unable to render this card]")))))
        (finally
          (.close cs)))
      (add-link-annotations! pg @*link-rects*))))

;; --------------------------------------------------------------------------------------------
;; Public API
;; --------------------------------------------------------------------------------------------

(defn- resolve-parameters
  "Resolve the parameter values a subscription would use: start from the dashboard's own parameters, treating each
  parameter's `:default` as its `:value`, then apply any explicitly provided overrides by id. These feed both
  text-card `{{tag}}` substitution and dashcard query filtering, matching how email subscriptions interpolate
  parameters."
  [dashboard provided]
  (let [by-id (into {} (map (juxt :id identity)) provided)]
    (vec (for [{default-value :default :as p} (:parameters dashboard)]
           (cond-> (dissoc p :default)
             (some? default-value) (assoc :value default-value)
             (by-id (:id p))       (merge (by-id (:id p))))))))

(defn- non-default-parameters
  "The dashboard parameters worth showing in the header filter bar: those whose effective value differs from the
  parameter's own `:default` -- i.e. the ones the subscriber actually changed. Default-valued (and unset) parameters
  convey nothing the dashboard's defaults don't already imply, so they're left out (which also keeps the header from
  reserving space for them). Display-only: [[resolve-parameters]] still applies defaults for query filtering."
  [dashboard provided]
  (let [by-id (into {} (map (juxt :id identity)) provided)]
    (vec (for [{default-value :default :as p} (:parameters dashboard)
               :let  [value (if (contains? by-id (:id p))
                              (:value (by-id (:id p)))
                              default-value)]
               :when (and (some? value)
                          (not= value default-value))]
           (-> (dissoc p :default)
               (assoc :value value))))))

(defn render-dashboard-to-pdf
  "Render the dashboard with `dashboard-id` to PDF bytes, running queries as user `user-id`. `parameters` is a vector
  of dashboard parameter overrides; `[]` to use the dashboard's own parameter defaults.

  `paper-key` is `:a4` (default) or `:letter`. Lays cards out following the dashboard's explicit 24-column grid."
  (^bytes [dashboard-id user-id parameters]
   (render-dashboard-to-pdf dashboard-id user-id parameters :a4))
  (^bytes [dashboard-id user-id parameters paper-key]
   (request/with-current-user user-id
     (let [dims     (paper-dims paper-key)
           dash     (t2/select-one :model/Dashboard :id dashboard-id)
           tabs     (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]})
           dcs      (t2/hydrate (t2/select :model/DashboardCard :dashboard_id dashboard-id) :card)
           ;; only treat a dashboard as tabbed when there's more than one tab -- a lone tab isn't shown as a tab in
           ;; the UI, so the PDF shouldn't draw (or reserve space for) its title either
           tabbed?  (> (count tabs) 1)
           by-tab   (group-by :dashboard_tab_id dcs)
           resolved (resolve-parameters dash parameters)
           sections (if tabbed?
                      (mapv (fn [t]
                              {:tab-name (:name t)
                               :cells    (build-cells (get by-tab (:id t)) resolved)})
                            tabs)
                      [{:tab-name nil
                        :cells    (build-cells dcs resolved)}])
           timezone (some (fn [s]
                            (some #(when (= :card (:kind %))
                                     (-> % :part :card render.card/defaulted-timezone))
                                  (:cells s)))
                          sections)
           doc      (PDDocument.)]
       (try
         (binding [font/*fonts*       (font/load-fonts! doc)
                   font/*em-width*    (memo/memo font/raw-em-width-inner)]
           (let [content-w   (* common/grid-cols (:unit dims))
                 inline-ids  (into #{} (mapcat :inline_parameters) dcs)
                 param-table (layout-param-table (dashboard-param-entries (non-default-parameters dash parameters) inline-ids)
                                                 content-w common/margin)]
             (doseq [[idx section] (m/indexed sections)
                     page          (pages-for-section section idx dims tabbed? (:name dash) param-table)]
               (render-page! doc dims timezone page)))
           (when (zero? (.getNumberOfPages doc))
             (.addPage doc (PDPage. ^PDRectangle (:rect dims))))
           (with-open [os (ByteArrayOutputStream.)]
             (.save doc os)
             (.toByteArray os)))
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

(comment
  ;; main dashboard = 1, the i18n sample dashboard = 18
  (binding [*debug-boxes* true]
    (render-dashboard-to-pdf-file 1 1 [{:id "81cd957"
                                        :value "past1months"
                                        :type "date/all-options"}
                                       {:id "9d9cddd4"
                                        :value ["Doohickey", "Gizmo"]
                                        :type "string/="}
                                       {:id "1ebab259" #_vendor
                                        :value nil
                                        :type "string/="}
                                       {:id "b1a2d47f" #_max-discount-on-card
                                        :value [0]
                                        :type "number/<="}]
                                  "/tmp/dash-debug9.pdf")))
