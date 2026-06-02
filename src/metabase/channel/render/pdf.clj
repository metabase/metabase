(ns metabase.channel.render.pdf
  "Prototype: render a whole dashboard to a PDF on the backend.

  Reuses the static-viz rendering pipeline that powers dashboard subscription emails:
  `execute-dashboard` turns a dashboard into ordered \"parts\" (cards, headings, text,
  tab titles), and `render-pulse-card-to-png` rasterizes each whole card (title +
  description + chart/table) into PNG bytes via the same GraalVM/Batik/CSSBox path the
  emails use. This namespace only replaces the \"assemble into HTML email\" half: instead
  of building HTML, it lays the per-card PNGs and heading/text runs onto PDF pages with
  Apache PDFBox.

  Prototype limitations (intentional):
   - `:text` parts are rendered as plain text; markdown is not interpreted.
   - Card content is raster (the chart/table image), so text inside a card is not selectable.
   - Non-ASCII characters in headings/text are replaced with `?` to avoid Standard-14 font
     encoding errors.
   - No filters banner, page headers/footers, branding, permissions, or API endpoint."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.channel.render.card :as render.card]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayOutputStream)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.font PDType1Font Standard14Fonts$FontName)
   (org.apache.pdfbox.pdmodel.graphics.image PDImageXObject)))

(set! *warn-on-reflection* true)

(def ^:private ^PDRectangle page-size PDRectangle/A4)
(def ^:private margin 36.0)
(def ^:private content-width (- (.getWidth page-size) (* 2 margin)))
;; Pixel width of the card PNG before it is scaled to fit `content-width`. A value larger
;; than the page width keeps charts reasonably crisp after down-scaling.
(def ^:private render-width 1000)

(defn- bold-font ^PDType1Font [] (PDType1Font. Standard14Fonts$FontName/HELVETICA_BOLD))
(defn- regular-font ^PDType1Font [] (PDType1Font. Standard14Fonts$FontName/HELVETICA))

;; The layout is an imperative top-down cursor. `state` is an atom holding the document,
;; the current page's content stream, and the `y` cursor measured from the page bottom
;; (PDF's origin is bottom-left).

(defn- start-page!
  "Close any open content stream, add a fresh page, and reset the cursor to the top."
  [state]
  (let [{:keys [^PDDocument doc ^PDPageContentStream cs]} @state]
    (when cs (.close cs))
    (let [page (PDPage. page-size)
          _    (.addPage doc page)
          cs   (PDPageContentStream. doc page)]
      (swap! state assoc :cs cs :y (- (.getHeight page-size) margin)))))

(defn- ensure-space!
  "Start a new page if `needed` points of vertical space won't fit on the current page."
  [state needed]
  (when (< (- (double (:y @state)) needed) margin)
    (start-page! state)))

(defn- sanitize
  "Standard-14 PDF fonts can't encode arbitrary characters; restrict to printable ASCII so
  `showText` never throws. Collapse whitespace/newlines (showText can't contain newlines)."
  ^String [s]
  (-> (str s)
      (str/replace #"\s+" " ")
      (str/replace #"[^\x20-\x7E]" "?")
      str/trim))

(defn- wrap-text
  "Greedy word-wrap `text` to fit `max-width` points at `font-size`. Returns a vector of lines."
  [^PDType1Font font font-size text max-width]
  (let [width-of (fn [^String s] (* font-size (/ (.getStringWidth font s) 1000.0)))]
    (reduce
     (fn [lines word]
       (let [last-line (peek lines)
             candidate (if (str/blank? last-line) word (str last-line " " word))]
         (if (and (seq last-line) (> (width-of candidate) max-width))
           (conj lines word)
           (conj (if (empty? lines) [] (pop lines)) candidate))))
     []
     (str/split (sanitize text) #" "))))

(defn- draw-text!
  "Draw a wrapped text block at the cursor, advancing the cursor below it."
  [state ^PDType1Font font font-size text]
  (let [line-height (* font-size 1.3)]
    (doseq [line (wrap-text font font-size text content-width)]
      (ensure-space! state line-height)
      (let [^PDPageContentStream cs (:cs @state)
            baseline (- (double (:y @state)) font-size)]
        (.beginText cs)
        (.setFont cs font (float font-size))
        (.newLineAtOffset cs (float margin) (float baseline))
        (.showText cs line)
        (.endText cs))
      (swap! state update :y - line-height))))

(defn- draw-image!
  "Embed `png-bytes` scaled to the content width (or page height if it's very tall),
  advancing the cursor below it."
  [state ^bytes png-bytes]
  (let [^PDDocument doc (:doc @state)
        img    (PDImageXObject/createFromByteArray doc png-bytes "card")
        iw     (double (.getWidth img))
        ih     (double (.getHeight img))
        max-h  (- (.getHeight page-size) (* 2 margin))
        draw-w content-width
        draw-h (* draw-w (/ ih iw))
        ;; Clamp to a single page height so it always fits after a fresh page.
        [draw-w draw-h] (if (> draw-h max-h)
                          [(* max-h (/ iw ih)) max-h]
                          [draw-w draw-h])]
    (ensure-space! state draw-h)
    (let [^PDPageContentStream cs (:cs @state)
          y (- (double (:y @state)) draw-h)]
      (.drawImage cs img (float margin) (float y) (float draw-w) (float draw-h))
      (swap! state update :y - (+ draw-h 12.0)))))

(defn- card-part->png
  "Rasterize a `:card` part to a single PNG that includes the card title, description, and
  chart/table -- the same elements the subscription email shows for a card. Uses the `:inline`
  render type so the chart embeds as a data URI that CSSBox can rasterize (the `:attachment`
  type emits `cid:` refs CSSBox can't resolve), and passes the dashcard so per-dashcard
  title/description overrides are respected."
  ^bytes [timezone {:keys [card dashcard result]}]
  (-> (render.card/render-pulse-card :inline timezone card dashcard result
                                     {:channel.render/include-title?       true
                                      :channel.render/include-description? true})
      (render.card/png-from-render-info render-width)))

(defn render-dashboard-to-pdf
  "Render the dashboard with `dashboard-id` to PDF bytes, as user `user-id`, applying
  `parameters` (a vector of dashboard parameter maps; `[]` for none)."
  ^bytes [dashboard-id user-id parameters]
  (let [parts     (notification.execute/execute-dashboard dashboard-id user-id parameters)
        timezone  (some->> parts (some :card) render.card/defaulted-timezone)
        dashboard (t2/select-one :model/Dashboard :id dashboard-id)
        doc       (PDDocument.)
        state     (atom {:doc doc})]
    (try
      (start-page! state)
      (draw-text! state (bold-font) 20.0 (:name dashboard))
      (swap! state update :y - 8.0)
      (doseq [part parts]
        (try
          (case (:type part)
            ;; Whole-card PNG includes the card title, description, and chart/table.
            :card (draw-image! state (card-part->png timezone part))
            (:heading :tab-title) (draw-text! state (bold-font) 16.0 (:text part))
            :text (draw-text! state (regular-font) 11.0 (:text part))
            nil)
          (catch Throwable e
            (log/error e "Error rendering dashboard part for PDF; substituting placeholder")
            (draw-text! state (regular-font) 11.0 "[Unable to render this card]"))))
      (let [{:keys [^PDPageContentStream cs]} @state]
        (when cs (.close cs)))
      (with-open [os (ByteArrayOutputStream.)]
        (.save doc os)
        (.toByteArray os))
      (finally
        (.close doc)))))

(defn render-dashboard-to-pdf-file
  "Convenience wrapper for the REPL: render the dashboard to PDF and write it to `path`."
  [dashboard-id user-id parameters path]
  (let [bytes (render-dashboard-to-pdf dashboard-id user-id parameters)]
    (with-open [os (io/output-stream path)]
      (.write os ^bytes bytes))
    path))
