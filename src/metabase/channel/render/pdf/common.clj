(ns metabase.channel.render.pdf.common
  "Shared constants for the backend dashboard->PDF renderer: page geometry, typography sizes, and
  colours. Pulled into their own namespace so the font/typesetting/drawing namespaces can share them
  without depending on the top-level renderer."
  (:import
   (java.awt Color)
   (org.apache.pdfbox.pdmodel.common PDRectangle)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; Page geometry
;; --------------------------------------------------------------------------------------------

(def margin "Page margin, in points." 36.0)
(def grid-cols "Columns in the dashboard layout grid." 24)

(def paper
  "Paper specs. `:rows` is the number of square grid cells we lay down vertically -- A4's
  printable height is ~35.31 units so we use 35 and accept the slack; Letter is exactly 32."
  {:a4     {:rect PDRectangle/A4     :rows 35}
   :letter {:rect PDRectangle/LETTER :rows 32}})

(def gutter-pt
  "Points of empty space between adjacent cards. Realized as a half-gutter inset on all sides of a card's grid
  rectangle, so two neighbours are separated by a full gutter while the outermost cards sit half a gutter inside
  the page margin (and the first row sits half a gutter below the header).

  Heading/text cells skip the *bottom* half of the inset so a one-row section header -- whose cell is barely
  taller than its text -- still has room to render."
  9.0)

(defn- centered
  [container-size content-size]
  (max 0.0 (/ (- container-size content-size)
              2.0)))

(defn h-center
  "Centers content horizontally in a container, returning the `x` coordinate for the content.

  If the content overflows the container, returns the `x` of the container. In other words, this overflows the
  right edge of the container rather than overflowing both sides.

  Works with any unit, provided all values are in the same unit."
  [base-x container-w content-w]
  (+ base-x (centered container-w content-w)))

(defn v-center
  "Centers content vertically in a container, returning the `y` coordinate for the content.

  This is distinct from [[h-center]] because in PDFs y=0 is at the bottom of the page, increasing upwards.

  If the content overflows the container, returns the `y` of the container. In other words, this overflows the
  bottom edge of the container rather than overflowing both sides.

  Works with any unit, provided all values are in the same unit."
  [base-y container-h content-h]
  (- base-y (centered container-h content-h)))

;; --------------------------------------------------------------------------------------------
;; Typography sizes
;; --------------------------------------------------------------------------------------------

(def dashboard-title-pt "Font size of the dashboard title." 20.0)
(def tab-title-pt "Font size of a tab title." 15.0)
(def heading-card-pt "Font size of a heading (section) card." 13.0)
(def text-card-pt "Base font size of a Markdown text card." 10.5)
(def chart-title-pt "Font size of a card's title above its chart." 11.0)
(def param-pt "Font size of parameter (filter) names and values." 9.5)
(def param-chip-gap "Horizontal gap between the name and value columns of the parameter table." 16.0)
(def line-height-factor "Line height as a multiple of the font size." 1.3)
(def header-pad-pt "Extra vertical padding added to a header line's height." 6.0)

(def ruby-scale
  "Furigana (ruby) reading font size as a fraction of the base text size; the reading is drawn
  centered above the base, e.g. {kanji|reading}."
  0.55)

;; --------------------------------------------------------------------------------------------
;; Chart rasterization
;; --------------------------------------------------------------------------------------------

(def dpi
  "Pixels per inch used to size rasterized charts. Higher = crisper but larger PDFs.

  A grid cell's pixel dimensions are derived from its printed point size and this DPI. NOTE: this also sets the
  chart's *logical* layout size, so raising it shrinks chart fonts/labels rather than just sharpening. Use
  [[chart-supersample]] for pure sharpness."
  150.0)

(def chart-supersample
  "Supersampling factor for isomorphic (ECharts/visx) chart rasters: the chart is laid out at its `dpi`-derived
  logical pixel size (so fonts/labels are unchanged) but the SVG is rasterized to this many times more pixels, then
  drawn into the same on-page box -- crisper at the same page size.

  1.0 = no supersampling; 2.0 makes a 150-DPI chart effectively 300 DPI (for print/zoom) at ~+12% PDF size.
  See [[metabase.channel.render.js.svg/*chart-size*]]."
  2.0)

;; --------------------------------------------------------------------------------------------
;; Colours
;; --------------------------------------------------------------------------------------------

(def ^Color body-color "Default body text colour (grey)." (Color. 0x6B 0x73 0x80))
(def ^Color link-color "Colour of hyperlink text (blue)." (Color. 0x1B 0x6F 0xC2))
(def ^Color code-color "Colour of inline code / code blocks (near-black)." (Color. 0x3B 0x3B 0x3B))
