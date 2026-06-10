(ns metabase.channel.render.pdf
  "Rendering dashboards into PDFs, for sending to emails or Slack, or returning from the API. Powered by Apache PDFBox.

  Metabase dashboards are a 24-column grid; every dashcard (chart, text, heading, ...) has an explicit position
  (`row`/`col`) and size (`size_x`/`size_y`) in grid cells. This layout is reproduced in the PDF: the printable page
  width is divided into 24 square units, and each dashcard is drawn into its grid rectangle at the corresponding
  scale. We follow the layout literally -- no reflow, repacking, or moving cards around -- and simply insert page
  breaks when the next card won't fit in the remaining vertical space. That leaves the bottom of the page blank
  rather than splitting a card across pages.

  Paper is selectable between A4 (treated as 24x35 units) and Letter (24x32); units are square, so A4 leaves a little
  unused space at the bottom of each page. The first page spends some vertical cells on the dashboard title, and each
  tab's first page spends cells on the tab heading; the number of cells consumed is derived from the header font sizes
  (see `header-block-pt` / `rows-for-pt`).

  Chart/query card bodies are rendered via the same static-viz pipeline the subscription emails use -- rectangular
  charts to exactly fill their grid rectangle, other types fit preserving aspect -- with the card title drawn natively
  above. Text and heading cards are drawn as native PDF text within their cell.

  Native text (titles, text/heading cards, parameters) is drawn with embedded Noto Sans fonts (via `PDType0Font`), with
  per-glyph font fallback (see `font-runs`), so it renders Unicode. We support the Latin, Cyrillic, Greek, Arabic,
  Hebrew alphabets (with accents and unique characters like Polish ł and German ß), Devanagari, (Simplified) Chinese,
  Japanese and Korean. Bold face is supported for all languages; CJK has no italic and fall back to upright.
  Mixed-script text picks the right font per character.

  Right-to-left text (Hebrew, Arabic) is shaped and reordered per line, via ICU4J (see [[visual-order]]). This is a
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
   [medley.core :as m]
   [metabase.channel.render.card :as render.card]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.util :as render.util]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.parameters.shared :as shared.params]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.http :as u.http]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.ibm.icu.text ArabicShaping Bidi)
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading Image IndentedCodeBlock Link MailLink OrderedList
                             Paragraph SoftLineBreak StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.ext.autolink AutolinkExtension)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Node)
   (com.vladsch.flexmark.util.data MutableDataSet)
   (java.awt Color)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (javax.imageio ImageIO ImageReader)
   (org.apache.fontbox.ttf CmapLookup TrueTypeFont TTFParser)
   (org.apache.pdfbox.io RandomAccessReadBuffer)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.font PDFont PDType0Font)
   (org.apache.pdfbox.pdmodel.graphics.image LosslessFactory PDImageXObject)
   (org.apache.pdfbox.pdmodel.interactive.action PDActionURI)
   (org.apache.pdfbox.pdmodel.interactive.annotation PDAnnotationLink PDBorderStyleDictionary)))

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
(def ^:private param-pt 9.5)
(def ^:private param-chip-gap 16.0)
(def ^:private line-height-factor 1.3)
(def ^:private ruby-scale
  "Furigana (ruby) reading font size as a fraction of the base text size; the reading is drawn
  centered above the base, e.g. {kanji|reading}."
  0.55)
(def ^:private header-pad-pt 6.0)

(def ^:private gutter-pt
  "Points of empty space between adjacent cards. Realized as a half-gutter inset on each card's
  grid rectangle, so two neighbours are separated by a full gutter while the outermost cards sit
  half a gutter inside the page margin (and the first row sits half a gutter below the header).
  Heading/text cells skip the *bottom* half of the inset (see `render-page!`) so a one-row section
  header -- whose cell is barely taller than its text -- still has room to render."
  9.0)

(def ^:private dpi
  "Pixels per inch used to size rasterized charts. Higher = crisper but larger PDFs. A grid
  cell's pixel dimensions are derived from its printed point size and this DPI. NOTE: this also
  sets the chart's *logical* layout size, so raising it shrinks chart fonts/labels rather than
  just sharpening -- use [[chart-supersample]] for pure sharpness."
  150.0)

(def ^:private chart-supersample
  "Supersampling factor for isomorphic (ECharts/visx) chart rasters: the chart is laid out at its
  `dpi`-derived logical pixel size (so fonts/labels are unchanged) but the SVG is rasterized to
  this many times more pixels, then drawn into the same on-page box -- crisper at the same page size.

  1.0 = no supersampling; 2.0 makes a 150-DPI chart effectively 300 DPI (for print/zoom) at ~+12% PDF size.
  See [[metabase.channel.render.js.svg/*chart-size*]]."
  2.0)

(def ^:private body-color (Color. 0x6B 0x73 0x80))
(def ^:private link-color (Color. 0x1B 0x6F 0xC2))
(def ^:private code-color (Color. 0x3B 0x3B 0x3B))

(def ^:dynamic *debug-boxes*
  "When true, fill the *allocated* box (the full space available, not the content's actual extent)
  behind each chart (red) and each card title / heading card (light blue), so one can see how much
  of its cell the content -- especially a static-viz chart -- really fills. Off in normal output."
  false)
(def ^:private debug-chart-color (Color. 0xFF 0xBB 0xBB))
(def ^:private debug-heading-color (Color. 0xCC 0xCC 0xFF))

(def ^:private rectangular-displays
  "Display types whose static-viz (ECharts/visx) renderer honors an explicit width AND height, so we can render them
  to exactly fit their grid cell (like the frontend).

  Other types (pie, gauge, funnel, progress, scalar, table, ...) have a fixed size when rendered, and resized to fit
  their grid cell, preserving aspect ratio."
  #{:line :area :bar :combo :scatter :boxplot :waterfall :sankey :row})

;; --------------------------------------------------------------------------------------------
;; Fonts -- embedded Noto Sans (TrueType, via PDType0Font) so we can render Unicode (Latin, Cyrillic, Greek, CJK, ...)
;; rather than the ASCII-only Standard-14 fonts. PDType0Fonts are tied to a specific PDDocument, so we load a
;; registry once per render and bind it to `*fonts*`.
;; --------------------------------------------------------------------------------------------

(def ^:private physical-font-resources
  "Physical font keyword -> classpath resource. The fonts are TrueType (glyf) format, so PDFBox can subset them and
  the output PDF only carries the glyphs actually used.

  Noto Sans covers Latin/Cyrillic/Greek; the per-region Noto Sans JP/KR/SC faces cover Japanese, Korean and Simplified
  Chinese; Noto Sans Arabic/Hebrew cover those scripts (see [[visual-order]] for RTL shaping/reordering)."
  {:noto-regular     "fonts/pdf/NotoSans-Regular.ttf"
   :noto-bold        "fonts/pdf/NotoSans-Bold.ttf"
   :noto-italic      "fonts/pdf/NotoSans-Italic.ttf"
   :noto-bold-italic "fonts/pdf/NotoSans-BoldItalic.ttf"
   :noto-mono        "fonts/pdf/NotoSansMono-Regular.ttf"
   :arabic-regular   "fonts/pdf/NotoSansArabic-Regular.ttf"
   :arabic-bold      "fonts/pdf/NotoSansArabic-Bold.ttf"
   :hebrew-regular   "fonts/pdf/NotoSansHebrew-Regular.ttf"
   :hebrew-bold      "fonts/pdf/NotoSansHebrew-Bold.ttf"
   :jp-regular       "fonts/pdf/NotoSansJP-Regular.ttf"
   :jp-bold          "fonts/pdf/NotoSansJP-Bold.ttf"
   :kr-regular       "fonts/pdf/NotoSansKR-Regular.ttf"
   :kr-bold          "fonts/pdf/NotoSansKR-Bold.ttf"
   :sc-regular       "fonts/pdf/NotoSansSC-Regular.ttf"
   :sc-bold          "fonts/pdf/NotoSansSC-Bold.ttf"})

(def ^:dynamic *fonts*
  "Per-document map of `{face-keyword {:primary <phys> :fallbacks [<phys> ...]} ...}`, where each `<phys>` is
  `{:font <PDType0Font> :cmap <CmapLookup>}`. Bound while a document is being rendered, because `PDType0Fonts` are tied
  to a specific `PDDocument`; see [[load-fonts!]]. Latin keeps the Noto Sans look across all styles; the CJK regional
  faces are ordered fallbacks so mixed English/Japanese text renders per-glyph from the right font.

  CJK has no italic, so italic CJK falls back to the upright CJK face."
  nil)

(def ^:dynamic *width-cache*
  "Per-render atom of `{[face-id ^String s] <em-width>}` memoizing [[raw-em-width]]. A string's width
  in a given face is independent of font size, yet we measure the same strings many times -- once
  per word while wrapping, again to total block heights, again for *each* trial scale in
  [[fit-scale]] (up to a dozen), and again while drawing -- so we compute the shaping + per-glyph
  advances once and reuse. Bound in [[render-dashboard-to-pdf]]; unbound (nil) elsewhere, in which
  case widths are computed directly."
  nil)

(defn- load-phys
  "Reads a physical font from its `resource-path` within the classpath. Registers the font with the `PDDocument`."
  [^PDDocument doc resource-path]
  (let [bytes  (with-open [is (io/input-stream (io/resource resource-path))]
                 (.readAllBytes is))
        ^TrueTypeFont ttf (.parse (TTFParser.) (RandomAccessReadBuffer. ^bytes bytes))]
    {:font (PDType0Font/load doc ttf true)
     :cmap (.getUnicodeCmapLookup ttf)}))

(defn- load-fonts!
  "Load the font registry into `doc`. Call once per document; PDFBox subsets the embedded fonts at
  save time, so only the glyphs actually used end up in the output PDF."
  [^PDDocument doc]
  (let [phys  (update-vals physical-font-resources #(load-phys doc %))
        ;; `:id` is a stable keyword identifying the face -- used as a cheap cache key (see
        ;; [[*width-cache*]]) instead of the heavy `{:primary ... :fallbacks ...}` map.
        face* (fn [id primary & fallbacks]
                {:id        id
                 :primary   (phys primary)
                 :fallbacks (mapv phys fallbacks)})]
    {:regular     (face* :regular     :noto-regular     :hebrew-regular :arabic-regular :jp-regular :kr-regular :sc-regular)
     :bold        (face* :bold        :noto-bold        :hebrew-bold    :arabic-bold    :jp-bold    :kr-bold    :sc-bold)
     :italic      (face* :italic      :noto-italic      :hebrew-regular :arabic-regular :jp-regular :kr-regular :sc-regular)
     :bold-italic (face* :bold-italic :noto-bold-italic :hebrew-bold    :arabic-bold    :jp-bold    :kr-bold    :sc-bold)
     :mono        (face* :mono        :noto-mono        :hebrew-regular :arabic-regular :jp-regular :kr-regular :sc-regular)}))

(defn- face [k]
  (get *fonts* k))

(defn- covers?
  "Checks if a physical font can render a given codepoint `cp`."
  [phys cp]
  (pos? (.getGlyphId ^CmapLookup (:cmap phys) (int cp))))

(defn- normalize-ws
  "Turn tabs, newlines and other control chars into spaces. PDFBox `showText` doesn't handle them."
  ^String [s]
  (let [s  (str s)
        n  (.length s)
        sb (StringBuilder. n)]
    (loop [i 0]
      (when (< i n)
        (let [cp (.codePointAt s i)]
          (.appendCodePoint sb (if (< cp 32) (int \space) cp))
          (recur (+ i (Character/charCount cp))))))
    (.toString sb)))

(defn- contains-rtl?
  "True if `s` contains any character the bidi algorithm treats as right-to-left (e.g. Arabic, Hebrew).

  This allows the LTR-only common case skip all shaping/reordering work."
  [^String s]
  (let [chars (.toCharArray s)]
    (Bidi/requiresBidi chars 0 (alength chars))))

(defn- base-rtl?
  "True if the bidi base direction of `s` is right-to-left -- i.e. its first strong directional character is RTL
  (Arabic/Hebrew). This is the per-paragraph direction used to right-align RTL titles, headings, and paragraphs.
  A block has a single base direction shared by all its lines."
  [^String s]
  (let [s (str s)]
    (and (contains-rtl? s)
         (not (.baseIsLeftToRight (Bidi. s (int Bidi/LEVEL_DEFAULT_LTR)))))))

(def ^:private arabic-tashkeel
  "Arabic combining marks: harakat/tanwin (fatha, kasra, damma, sukun, shadda, ...), the superscript alef, and
  Quranic annotation signs.

  These are zero-width marks that the font expects to anchor above/below their consonant via GPOS mark-to-base
  positioning -- which PDFBox's `showText` doesn't perform.

  Worse, ICU's shaper rewrites them into spacing presentation forms (U+FE70-block, with real advance widths) that then
  render *after* the letter over empty space. We drop them before shaping, yielding clean unvocalised Arabic -- the
  normal written form -- rather than mispositioned marks. Correctly stacking vowel marks would require a GPOS-aware
  shaper such as HarfBuzz, which drags us into native library hell.

  Apologies for the Unicode escapes here - these characters are mostly zero-width and are unreadable in code editors."
  #"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]")

(defn- visual-order
  "The heart of RTL support: if `s` contains right-to-left text (Arabic or Hebrew), return it shaped and reordered
  for a left-to-right renderer; otherwise return it unchanged.

  PDFBox's `showText` lays glyphs out left-to-right in the order given and does no OpenType shaping, so RTL text drawn
  naively comes out reversed and (for Arabic) as disconnected isolated letters. We approximate proper rendering with
  ICU4J, no native HarfBuzz needed:
   - Arabic vowel marks (tashkeel) are stripped (see [[arabic-tashkeel]]) -- positioning them needs GPOS, which we can't
     do; unvocalised Arabic is the normal written form anyway.
   - `ArabicShaping` rewrites plain Arabic letters to their positional presentation forms -- initial, medial, final, and
     isolated, plus the lam-alef ligature. The Noto Sans Arabic cmap covers that Presentation-Forms-B block, and the
     result is properly joined Arabic.
   - `Bidi` reorders the (shaped) logical string into visual order and mirrors brackets.

  This runs per drawn line, not per paragraph, so it is a deliberate approximation rather than full bidi: a pure
  Arabic/Hebrew line reads correctly, and mixed LTR/RTL is close enough for the short strings used for dashboard titles,
  headings, etc."
  ^String [^String s]
  (if-not (contains-rtl? s)
    s
    (let [s      (str/replace s arabic-tashkeel "")
          shaped (try (.shape (ArabicShaping. (int ArabicShaping/LETTERS_SHAPE)) s)
                      (catch Exception _ s))]
      (.writeReordered (Bidi. ^String shaped (int Bidi/LEVEL_DEFAULT_LTR))
                       (int (bit-or Bidi/DO_MIRRORING Bidi/KEEP_BASE_COMBINING))))))

(defn- cp-font
  "Given a face and a codepoint, returns the physical font with the best matching glyph for the given codepoint.

  The `:primary` font is preferred, then the `:fallbacks` in order. If none of the fonts has a glyph for this codepoint,
  returns nil."
  [{:keys [primary fallbacks] :as _face} cp]
  (or (when (covers? primary cp) primary)
      (m/find-first #(covers? % cp) fallbacks)))

;; FIXME: I think it's dumb to distinguish `:primary` and `:fallbacks` - if they're always checked in this order, then
;; the `:primary` distinction is pointless.

(defn- font-runs
  "Split `s` into maximal `[phys ^String chunk]` runs that all use the same physical font.

  For each codepoint, the physical font chosen is the first one in this order that has the glyph:

  - the face's `:primary` font
  - each of the `:fallbacks` in order
  - abandon this codepoint, and fall back to `?` from the `:primary` font as a placeholder.

  Since every codepoint is resolved to some glyph, `showText` will never throw."
  ;; TODO: (bshepherdson, 2026-06-09) Consider using the "tofu" placeholder box ☐ or Unicode REPLACEMENT CHARACTER �
  [{:keys [primary] :as face} ^String s]
  (let [n    (.length s)
        emit (fn [out cur ^StringBuilder sb]
               (cond-> out
                 (some? cur) (conj! [cur (.toString sb)])))]
    (loop [i                 0
           cur               nil
           ^StringBuilder sb nil
           out               (transient [])]
      (if (>= i n)
        (persistent! (emit out cur sb))
        (let [cp   (.codePointAt s i)
              phys (cp-font face cp)
              ;; If the codepoint doesn't have a matching glyph in any font, phys is nil. In that case, default `ch`
              ;; to `?` and `phys` to the `:primary` font.
              ch   (if phys cp (int \?))
              phys (or phys primary)]
          ;; At this point, `phys` is a physical font and `ch` is the codepoint to use within that font.
          ;; `cp` itself holds the proper input codepoint, which we still need to gets its `charCount` and advance the
          ;; right distance through the input string.
          (if (identical? phys cur)
            ;; No change of font, so keep appending to the current StringBuilder.
            (do (.appendCodePoint sb ch)
                (recur (+ i (Character/charCount cp)) cur sb out))
            ;; Hit a seam between fonts, so append the current run to `out` and start a new one.
            (recur (+ i (Character/charCount cp))
                   phys
                   (doto (StringBuilder.) (.appendCodePoint ch))
                   (emit out cur sb))))))))

(defn- header-block-pt
  "Vertical points a header line of `font-pt` occupies (line height + a little padding)."
  [font-pt]
  (+ (* font-pt line-height-factor) header-pad-pt))

(defn- rows-for-pt
  "How many *whole* grid rows are needed to hold `pt` points of vertical space."
  [pt unit]
  (long (Math/ceil (/ (double pt) (double unit)))))

(defn- paper-dims
  [paper-key]
  (let [{:keys [^PDRectangle rect rows]} (paper paper-key)]
    {:rect rect
     :rows rows
     :unit (/ (- (.getWidth rect) (* 2 margin))
              grid-cols)}))

;; --------------------------------------------------------------------------------------------
;; Text helpers
;; --------------------------------------------------------------------------------------------

(defn- raw-em-width
  "Width of `s` in `face` measured in *ems* (1.0 = the font size), so it can be multiplied by any
  font size to get points -- this is what makes the measurement font-size-independent and thus
  cacheable (see [[*width-cache*]]).

  Measures the *shaped* form (see [[visual-order]]) exactly as `draw-line!` draws it, so scripts
  (e.g. Arabic) where isolated letters are wider than their joined-up presentation forms are
  measured on the presentation form that will actually be rendered. A naive sum over isolated letter
  widths would overstate the space needed, leaving big gaps after each word in such scripts."
  ^double [face ^String s]
  (let [compute (fn []
                  (transduce (map (fn [[phys ^String chunk]]
                                    (/ (.getStringWidth ^PDFont (:font phys) chunk) 1000.0)))
                             + 0.0
                             (font-runs face (visual-order (normalize-ws s)))))]
    (if-let [cache *width-cache*]
      (let [k [(:id face) s]]
        (or (get @cache k)
            (let [v (compute)]
              (swap! cache assoc k v)
              v)))
      (compute))))
;; FIXME: If [[font-runs]] is only called in a transducing context, it could be rewritten into a reducible for better
;; memory use and allocation performance. (Note `draw-line!` also calls it once per drawn line; only the *measurement*
;; side is cached above, since that is what gets repeated.)

(defn- text-width
  "Width in points of `s` drawn with `face` at `font-pt`. The per-glyph measurement lives in
  (cached) [[raw-em-width]]; this just scales it by the font size."
  ^double [face font-pt ^String s]
  (* (double font-pt) (raw-em-width face s)))

(defn- cjk-char?
  "Codepoints from scripts that don't use spaces between words. Line breaks are allowed between adjacent characters from
  these scripts. (CJK ideographs, kana, hangul, and CJK punctuation/fullwidth forms)."
  [cp]
  (or ;; 2E80-2FFF CJK radicals, Kangxi
   ;; 3000-303F CJK symbols and punctuation
   ;; 3040-30FF hiragana + katakana
   (<= 0x2E80 cp 0x30FF)
   (<= 0x3400 cp 0x4DBF)   ; CJK ext A
   (<= 0x4E00 cp 0x9FFF)   ; CJK unified ideographs
   (<= 0xAC00 cp 0xD7A3)   ; hangul syllables
   (<= 0xF900 cp 0xFAFF)   ; CJK compat ideographs
   (<= 0xFF00 cp 0xFFEF))) ; halfwidth & fullwidth forms

(def ^:private no-break-before-chars
  "CJK characters that must not start a line (closing punctuation, small kana); they attach to the previous break unit.
  This is a simplified kinsoku rule."
  (set "、。，．・：；！？）］｝」』】〕〉》〜ー…ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ"))

;; FIXME: This is a confusing mess, and I suspect it can be tightened up, but it might need a refactor of the
;; calling code as well.
(defn- tokenize-units
  "Split `text` into indivisible *units* which cannot break across lines.

  These are words separated by whitespace and punctuation in most scripts. CJK characters are each individual units,
  generally speaking. Most punctuation marks are attached to the preceding character, see [[no-break-before-chars]].

  Append break-unit tokens for `text` to `out`: each unit is `(assoc base :text … :space-before? …)`.

  Returns `[out' pending']`."
  [^String text base pending out]
  (let [n (.length text)]
    (loop [i                  0
           pending            pending
           ^StringBuilder buf (StringBuilder.)
           ;; boxed Boolean (not a primitive local) so the `:else` branch can `recur` it -- it can
           ;; be the boxed `pending` there. FIXME: Rename this to space-before? I think.
           buf-sb             pending
           out                out]
      (letfn [(flush [out]
                (cond-> out
                  ;; If there's anything in the buffer, append it to the output.
                  (pos? (.length buf)) (conj (assoc base
                                                    :text          (.toString buf)
                                                    :space-before? buf-sb))))]
        (if (>= i n)
          [(flush out) pending]
          (let [cp    (.codePointAt text i)
                width (Character/charCount cp)]
            (cond
              (Character/isWhitespace cp)
              (recur (+ i width) true (StringBuilder.) true (flush out))

              (cjk-char? cp)
              (let [out  (flush out)
                    cs   (String. (Character/toChars cp))
                    prev (peek out)]
                (if (and (contains? no-break-before-chars (char cp))
                         (some? prev)
                         (:text prev))
                  ;; This is a character that should stick to the previous, so append it to the previous unit.
                  (recur (+ i width) false (StringBuilder.) false
                         (conj (pop out) (update prev :text str cs)))
                  ;; Regular CJK characters are each a freestanding unit.
                  (recur (+ i width) false (StringBuilder.) false
                         (conj out (assoc base :text cs :space-before? (boolean pending))))))

              :else
              (let [buf-sb (if (zero? (.length buf)) pending buf-sb)]
                (.appendCodePoint buf cp)
                (recur (+ i width) false buf buf-sb out)))))))))

(defn- split-into-chars
  "Split a unit's text into one unit per codepoint. The first codepoint inherits `:space-before?`; others are false.

  Used to hard-break a single token that is itself wider than the whole line."
  [unit]
  (let [space-before? (boolean (:space-before? unit))]
    (stream-into! [] (map-indexed (fn [i cp]
                                    (assoc unit
                                           :text          (String. (Character/toChars (int cp)))
                                           :space-before? (and (zero? i) space-before?))))
                  (.codePoints ^String (:text unit)))))

(defn- pack-units->lines
  "Greedily pack pre-measured `units` into lines no wider than `max-w`. This is the shared word-wrap
  algorithm behind [[words->lines]], through which all text -- Markdown cards and plain titles /
  headings / parameters alike -- is wrapped.

  Each unit is a map carrying `:ww` (its drawn width), `:sp` (the width of one leading space), and
  `:space-before?` (whether the source had whitespace before it). A unit may instead be a
  `{:break? true}` marker, which forces a line break. A unit that alone exceeds `max-w` is broken
  via `split-fn` (a unit -> a seq of narrower pre-measured units; it returns the unit unchanged when
  it can't be split further, e.g. a single glyph).

  Returns a vector of lines, each a vector of (the same, opaque) units, with each unit's
  `:space-before?` updated to whether *this line* draws a space before it -- false at the start of a
  line, so callers don't have to special-case the first unit."
  [units max-w split-fn]
  (loop [units units, line [], line-w 0.0, lines (transient [])]
    (b/cond
      (empty? units)
      (-> lines (cond-> (seq line) (conj! line)) persistent!)

      :let [u (first units)]

      ;; a hard break flushes the current line (which may be empty -> a blank line)
      (:break? u)
      (recur (rest units) [] 0.0 (conj! lines line))

      :let [add-space? (boolean (and (seq line) (:space-before? u)))
            advance    (+ (if add-space? (:sp u) 0.0) (double (:ww u)))
            ;; a unit alone on its line and wider than the whole line is a split candidate
            parts      (when (and (empty? line) (> (double (:ww u)) max-w))
                         (split-fn u))]

      ;; the candidate actually split into more than one piece: retry with those in front
      (next parts)
      (recur (concat parts (rest units)) line line-w lines)

      ;; the line is nonempty and the next unit won't fit: break here and retry the unit
      (and (seq line) (> (+ line-w advance) max-w))
      (recur units [] 0.0 (conj! lines line))

      :else
      (recur (rest units) (conj line (assoc u :space-before? add-space?)) (+ line-w advance) lines))))

(defn- draw-line!
  "Draw a single line of text with `face` at a baseline, switching physical fonts as needed so mixed-script text
  (e.g. English + Japanese) renders the right glyphs."
  [^PDPageContentStream cs face font-pt x baseline-y ^String text]
  (.beginText cs)
  (.newLineAtOffset cs (float x) (float baseline-y))
  (doseq [[phys ^String chunk] (font-runs face (visual-order (normalize-ws text)))]
    (.setFont cs ^PDFont (:font phys) (float font-pt))
    (.showText cs chunk))
  (.endText cs))

;; --------------------------------------------------------------------------------------------
;; Markdown image fetching. Markdown text cards can reference remote images, which means fetching
;; user-provided URLs server-side -- the classic SSRF risk. The SSRF-hardened fetch itself lives in
;; [[metabase.util.http/fetch-bytes]]; here we only add the image-specific decoding: restrict to
;; raster content-types and reject over-large images (decompression-bomb guard) before decoding.
;; Any failure returns nil and the caller renders a Markdown link instead.
;; --------------------------------------------------------------------------------------------

(def ^:private image-max-megapixels 24)
(def ^:private allowed-image-content-types #{"image/png" "image/jpeg" "image/gif"})

(defn- decode-image
  "Decode `bytes` into a `PDImageXObject` embedded in `doc`, rejecting images over the megapixel cap
  (decompression-bomb guard) by reading dimensions before the full decode. Returns nil on failure."
  [^PDDocument doc ^bytes bytes]
  (try
    (with-open [iis (ImageIO/createImageInputStream (ByteArrayInputStream. bytes))]
      (let [readers (ImageIO/getImageReaders iis)]
        (when (.hasNext readers)
          (let [^ImageReader rdr (.next readers)]
            (try
              (.setInput rdr iis)
              (let [w (.getWidth rdr 0), h (.getHeight rdr 0)]
                (when (and (pos? w) (pos? h)
                           (<= (* (long w) (long h)) (* image-max-megapixels 1000000)))
                  (let [^BufferedImage bi (.read rdr 0)]
                    (LosslessFactory/createFromImage doc bi))))
              (finally (.dispose rdr)))))))
    (catch Throwable _ nil)))

(defn- fetch-image!
  "SSRF-safely fetch + decode a remote image URL into a `PDImageXObject`, or nil if anything fails."
  [^PDDocument doc url]
  (when-let [bytes (:bytes (u.http/fetch-bytes url {:allowed-content-types allowed-image-content-types}))]
    (decode-image doc bytes)))

;; --------------------------------------------------------------------------------------------
;; Markdown -> styled runs (text cards). We parse with flexmark (the same library the email
;; pipeline uses) but walk the AST ourselves, emitting block + inline-run structure that maps to
;; PDFBox fonts/colors -- since PDFBox has no HTML engine, the email's HTML output is no use here.
;; --------------------------------------------------------------------------------------------

(def ^:private md-parser
  (delay (-> (MutableDataSet.)
             (.set Parser/EXTENSIONS [(AutolinkExtension/create)])
             (Parser/builder)
             (.build))))

(defn- node-children [^Node node]
  ;; getChildren returns an Iterable, which `seq` supports out of the box.
  (seq (.getChildren node)))

(defn- md-unescape
  "Resolve CommonMark backslash escapes (`\\,` -> `,`) the way flexmark's HtmlRenderer does -- `.getChars` on a Text
  node returns the raw source, escapes included. Parameter substitution escapes interpolated values, so e.g. a
  multi-value filter arrives as `A\\, B\\, and C`."
  [s]
  (str/replace (str s) #"\\(\p{Punct})" "$1"))

(declare ^:private inline-runs)

(defn- parse-ruby
  "Split plain text into runs, turning `{base|reading}` furigana shorthand into ruby runs
  (`{:ruby? true :base … :reading …}`) and leaving the rest as ordinary text runs."
  [text style href]
  (let [s (str text)
        m (re-matcher #"\{([^{}|]+)\|([^{}|]+)\}" s)]
    (loop [last 0
           out  []]
      (if (.find m)
        (recur (.end m)
               (cond-> out
                 (< last (.start m)) (conj (assoc style :text (subs s last (.start m)) :href href))
                 true                (conj (assoc style :ruby? true :base (.group m 1)
                                                  :reading (.group m 2) :href href))))
        (cond-> out
          (< last (count s)) (conj (assoc style :text (subs s last) :href href)))))))

(defn- inline-node->runs
  "Convert a single inline node into styled runs. Images nested in inline content degrade to their alt text; top-level
  paragraph images are pulled out as `:image` blocks (see `paragraph->blocks`)."
  [^Node c style href]
  (condp instance? c
    Text           (-> (.getChars c) md-unescape (parse-ruby style href))
    StrongEmphasis (inline-runs c (assoc style :bold?   true) href)
    Emphasis       (inline-runs c (assoc style :italic? true) href)
    Link           (inline-runs c style                       (str (.getUrl ^Link c)))
    Code           [(assoc style
                           :code? true
                           :text  (str (.getText ^Code c))
                           :href  href)]
    AutoLink       (let [u (str (.getText ^AutoLink c))]
                     [(assoc style :text u :href u)])
    MailLink       (let [u (str (.getText ^MailLink c))]
                     [(assoc style :text u :href (str "mailto:" u))])
    Image          (let [alt (str (.getText ^Image c))]
                     [(assoc style
                             :text (if (str/blank? alt) "[image]" alt)
                             :href (str (.getUrl ^Image c)))])
    SoftLineBreak  [{:text " " :space? true}]
    HardLineBreak  [{:break? true}]
    (if (.getFirstChild c)
      (inline-runs c style href)
      (-> (.getChars c) md-unescape (parse-ruby style href)))))

(defn- inline-runs
  "Flatten a block node's inline children into styled runs: each is `{:text :bold? :italic? :code? :href}`, plus
  `{:break? true}` for a hard line break."
  ([^Node node] (inline-runs node {} nil))
  ([^Node node style href]
   (into [] (mapcat #(inline-node->runs % style href))
         (node-children node))))

;; FIXME: There are so many `loop`s in all this code. Either we should suck it up and use mapcat and flatten and other
;; Clojure niceties without worrying about performance, *or* these should be written as reducibles that stream their
;; results into a sink, rather than all this conditional `conj` onto `out` etc.
(defn- paragraph->blocks
  "A paragraph normally becomes one `:paragraph` block, but top-level images are pulled out as standalone `:image`
  blocks, interleaved with the surrounding text."
  [^Node node]
  (loop [children (node-children node)
         runs     []
         out      []]
    (if (empty? children)
      (cond-> out (seq runs) (conj {:kind :paragraph :runs runs}))
      (let [^Node c (first children)]
        (if (instance? Image c)
          (recur (rest children) []
                 (cond-> out
                   (seq runs) (conj {:kind :paragraph :runs runs})
                   true       (conj {:kind :image
                                     :src  (str (.getUrl ^Image c))
                                     :alt  (str (.getText ^Image c))})))
          (recur (rest children) (into runs (inline-node->runs c {} nil)) out))))))

(declare ^:private block->blocks)

;; FIXME: Use this for a few of the other "first one only" things like this. There's at least two others IIRC.
(defn- on-first
  "Returns a stateful transducer that applies `(f x)` only to the first element in the sequence. Passes through all
  subsequent elements unchanged."
  [f]
  (fn [xf]
    (let [seen? (volatile! false)]
      (fn
        ([] (xf))
        ([res] (xf res))
        ([res x]
         (xf res (if @seen?
                   x
                   (do (vreset! seen? true)
                       (f x)))))))))

(defn- list->blocks [^Node list-node depth ordered?]
  (into [] (comp (map-indexed
                  (fn [idx ^Node item]
                    (into [] (comp (mapcat #(block->blocks % (inc depth)))
                                   (on-first #(cond-> %
                                                (= :paragraph (:kind %)) (assoc :kind   :list-item
                                                                                :indent depth
                                                                                :marker (if ordered?
                                                                                          (str (inc idx) ". ")
                                                                                          "- ")))))
                          (node-children item))))
                 cat)
        (node-children list-node)))

(defn- block->blocks
  "Convert a flexmark block node into a flat vector of layout blocks `{:kind :runs ...}`."
  [^Node node depth]
  (condp instance? node
    Heading           [{:kind :heading :level (.getLevel ^Heading node) :runs (inline-runs node)}]
    Paragraph         (paragraph->blocks node)
    BulletList        (list->blocks node depth false)
    OrderedList       (list->blocks node depth true)
    FencedCodeBlock   [{:kind :code-block :text (str (.getContentChars ^FencedCodeBlock node))}]
    IndentedCodeBlock [{:kind :code-block :text (str (.getContentChars ^IndentedCodeBlock node))}]
    BlockQuote        (into [] (comp (mapcat #(block->blocks % depth))
                                     (map #(update % :indent (fnil inc 0))))
                            (node-children node))
    ThematicBreak     [{:kind :hr}]
    (if (.getFirstChild node)
      (into [] (mapcat #(block->blocks % depth))
            (node-children node))
      [])))

(defn- parse-markdown-blocks [text]
  (->> (.parse ^Parser @md-parser (str text))
       node-children
       (into [] (mapcat #(block->blocks % 0)))))

(defn- run-font [{:keys [bold? italic? code?]}]
  (face (cond
          code?               :mono
          (and bold? italic?) :bold-italic
          bold?               :bold
          italic?             :italic
          :else               :regular)))

(defn- heading-pt [level]
  (case (long level)
    1 15.0
    2 13.5
    3 12.0
    11.5))

;; FIXME: Big picture, all the Markdown code is repeatedly pouring nested stuff into a top-level, flattened list.
;; It seems like it would be much more efficient, and probably easier to read too, if the whole thing were written
;; as a reducible pipeline, streaming the results into a final sink.

;; All text -- Markdown cards and plain titles/headings alike -- funnels through `runs->words` ->
;; `->measured-item` -> `pack-units->lines` -> `draw-item-lines!`. Plain text (see `draw-text-block!`)
;; is just the degenerate case of a single styled run.
(defn- runs->words
  "Split runs into a flat seq of word tokens, each `{:text :style :space-before?}` (or `{:break? true}`),
  so that adjacent runs with no whitespace between them don't get a space."
  [runs]
  (loop [runs    runs
         pending false
         out     []]
    (if (empty? runs)
      out
      (let [r     (first runs)
            ;; keep :href so links can be made clickable; :link? drives the link colour
            style (cond-> (dissoc r :text :base :reading :ruby? :space? :break?)
                    (:href r) (assoc :link? true))]
        (cond
          (:break? r)
          (recur (rest runs) false (conj out {:break? true}))

          ;; a furigana group is one atomic break-unit (never split between base and reading)
          (:ruby? r)
          (recur (rest runs) false
                 (conj out {:ruby? true :base (:base r) :reading (:reading r)
                            :style style :space-before? pending}))

          :else
          (let [[out2 pend2] (tokenize-units (str (:text r "")) {:style style} pending out)]
            (recur (rest runs) pend2 out2)))))))

(defn- run-color [style]
  (or (:color style)                     ; an explicit colour overrides (e.g. gray parameter values)
      (cond (:link? style) link-color
            (:code? style) code-color
            :else          Color/BLACK)))

(defn- ->measured-item
  "Turn one Markdown word token into a drawable, pre-measured item (resolving its font and colour),
  ready for [[pack-units->lines]]. A furigana group becomes an atomic item whose width is the wider
  of its base and reading; a `{:break? true}` marker passes through unchanged. `:space-before?` is
  left as the source-level flag here -- `pack-units->lines` finalises it per line."
  [base-pt heading? w]
  (let [style (:style w)
        font  (run-font (cond-> style heading? (assoc :bold? true)))]
    (cond
      (:break? w) w

      ;; furigana group: base text with a smaller reading centered above; the item is atomic (the
      ;; reading must never wrap away from its base), and as wide as the wider of the two.
      (:ruby? w)
      (let [ruby-pt (* base-pt ruby-scale)
            bw      (text-width font base-pt (:base w))
            rw      (text-width font ruby-pt (:reading w))]
        {:ruby? true :base (:base w) :reading (:reading w) :font font :pt base-pt :ruby-pt ruby-pt
         :base-ww bw :reading-ww rw :color (run-color style) :href (:href style)
         :ww (max bw rw) :sp (text-width font base-pt " ") :space-before? (:space-before? w)})

      :else
      {:text (:text w) :font font :pt base-pt :color (run-color style) :href (:href style)
       :ww (text-width font base-pt (:text w)) :sp (text-width font base-pt " ")
       :space-before? (:space-before? w)})))

(defn- words->lines
  "Greedily wrap `words` to `max-w`, resolving each word's font/colour. Returns a vector of lines,
  each a vector of drawable items `{:text :font :pt :color :ww :sp :space-before? ...}`."
  [words base-pt heading? max-w]
  (let [split-fn (fn [item]
                   ;; only plain multi-glyph text is force-splittable; ruby groups stay atomic
                   (if (or (:ruby? item) (<= (count (str (:text item))) 1))
                     [item]
                     (map #(assoc % :ww (text-width (:font %) (:pt %) (:text %)))
                          (split-into-chars item))))]
    (pack-units->lines (map #(->measured-item base-pt heading? %) words) max-w split-fn)))

(defn- line-extra
  "Extra vertical space a line needs above its base text -- the furigana band, if it has any ruby."
  [line base-pt]
  (if (some :ruby? line) (* base-pt ruby-scale 1.2) 0.0))

(defn- lines-height
  "Total vertical points a sequence of wrapped item-lines consumes at `base-pt`, including any
  furigana bands (see [[line-extra]])."
  [lines base-pt]
  (let [lh (* base-pt line-height-factor)]
    (reduce (fn [acc line] (+ acc lh (line-extra line base-pt))) 0.0 lines)))

(defn- block-height
  "Vertical points a block consumes when laid out at `scale` (mirrors `draw-block!`)."
  [block cell-w scale]
  (case (:kind block)
    :hr (* 10.0 scale)
    ;; Images don't participate in the font fit-scale: shrinking the text wouldn't shrink an image,
    ;; so an image must never force the surrounding text smaller. They contribute no height here and
    ;; are instead scaled (aspect-preserved) to fit whatever space is left after the text -- see
    ;; `draw-image-block!`.
    :image 0.0
    :code-block (let [pt (* 9.0 scale)
                      lh (* pt line-height-factor)]
                  (+ (* (count (str/split-lines (str (:text block)))) lh) 2.0))
    (let [heading? (= :heading (:kind block))
          base-pt  (* (if heading? (heading-pt (:level block)) text-card-pt) scale)
          marker   (:marker block)
          marker-w (if marker (text-width (face :regular) base-pt marker) 0.0)
          content-w (- cell-w (* (long (or (:indent block) 0)) 14.0) marker-w)
          lines    (words->lines (runs->words (:runs block)) base-pt heading? content-w)]
      (lines-height lines base-pt))))

(defn- markdown-total-height [blocks cell-w scale]
  (reduce (fn [acc b] (+ acc (block-height b cell-w scale) (* 4.0 scale))) 0.0 blocks))

(defn- fit-scale
  "Largest font scale (<= 1.0, down to a readability floor) at which the markdown fits `cell-h`.
  Shrinks the text only when the content would otherwise overflow (and clip) the cell."
  [blocks cell-w cell-h]
  (or (some (fn [s] (when (<= (markdown-total-height blocks cell-w s) cell-h) s))
            (map #(/ (double %) 100.0) (range 100 44 -5)))
      0.45))

;; --------------------------------------------------------------------------------------------
;; Clickable links. PDF link annotations attach to the page, not the content stream, so while a
;; page draws we collect link rectangles into `*link-rects*` and add the annotations afterward.
;; --------------------------------------------------------------------------------------------

(def ^:dynamic *link-rects*
  "While a page renders, an atom of `{:x0 :y0 :x1 :y1 :href}` rectangles for the clickable link
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
    (swap! *link-rects* conj {:x0 (double x)
                              :y0 (- (double baseline) (* 0.2 pt))
                              :x1 (+ (double x) width)
                              :y1 (+ (double baseline) (* 0.85 pt))
                              :href href})))

(defn- reorder-bidi-items
  "Reorder a wrapped markdown line's word items from logical to visual order, so a right-to-left
  paragraph reads right-to-left at the word level. Each item's own glyphs are shaped/reversed
  separately by `draw-line!` (via `visual-order`); this handles the *order of the words*.

  We resolve bidi levels with ICU over the line's logical text (one representative offset per
  item), apply rule L2 via `Bidi/reorderVisual`, then recompute each item's `:space-before?` for
  its new neighbour so inter-word spacing follows the visual order. Lines with no RTL text (the
  common case) are returned untouched."
  [items]
  (let [item-text (fn [it] (str (or (:text it) (:base it) "")))]
    (if (or (<= (count items) 1)
            (not (some #(contains-rtl? (item-text %)) items)))
      items
      (let [sb     (StringBuilder.)
            starts (mapv (fn [it]
                           (when (and (pos? (.length sb)) (:space-before? it)) (.append sb \space))
                           (let [start (.length sb)] (.append sb (item-text it)) start))
                         items)
            bidi   (Bidi. (.toString sb) (int Bidi/LEVEL_DEFAULT_LTR))
            levels (byte-array (map (fn [start] (.getLevelAt bidi (int start))) starts))
            order  (Bidi/reorderVisual levels)]
        (vec (map-indexed
              (fn [vp lp]
                ;; visually adjacent items are logically adjacent; the gap between two words is
                ;; recorded on the one with the higher logical index, so reuse that flag.
                (let [sep? (and (pos? vp)
                                (boolean (:space-before? (nth items (max (aget order (dec vp)) (int lp))))))]
                  (assoc (nth items lp) :space-before? sep?)))
              order))))))

(defn- md-line-width
  "Drawn width of a (reordered) markdown line: each item's advance plus the space before it."
  ^double [items]
  (reduce (fn [^double w it] (+ w (if (:space-before? it) (double (:sp it)) 0.0) (double (:ww it))))
          0.0 items))

(defn- draw-md-line!
  "Draw one wrapped markdown line within the box `[x, x+content-w]`. When `rtl?`, the line is laid
  out flush-right within that box (word order is already visual via `reorder-bidi-items`)."
  [^PDPageContentStream cs x content-w rtl? baseline items]
  (let [items (reorder-bidi-items items)
        x0    (if rtl?
                (+ (double x) (max 0.0 (- (double content-w) (md-line-width items))))
                (double x))]
    (loop [items items, cx x0]
      (when (seq items)
        (let [it  (first items)
              cx2 (+ cx (if (:space-before? it) (:sp it) 0.0))]
          (.setNonStrokingColor cs ^Color (:color it))
          (if (:ruby? it)
            ;; base centered in the unit at the baseline; reading centered just above it
            (let [ww     (:ww it)
                  base-x (+ cx2 (/ (- ww (:base-ww it)) 2.0))
                  read-x (+ cx2 (/ (- ww (:reading-ww it)) 2.0))]
              (draw-line! cs (:font it) (:pt it) base-x baseline (:base it))
              (draw-line! cs (:font it) (:ruby-pt it) read-x (+ baseline (:pt it) 1.0) (:reading it)))
            (draw-line! cs (:font it) (:pt it) cx2 baseline (:text it)))
          (when (:href it)
            (record-link! cx2 baseline (:ww it) (:pt it) (:href it)))
          (recur (rest items) (+ cx2 (:ww it))))))
    (.setNonStrokingColor cs Color/BLACK)))

(defn- draw-item-lines!
  "Draw already-wrapped `lines` (each a vector of measured items) top-down from `top-y`, laying each
  out within `[content-x, content-x+content-w]` and stopping before `bottom`. `rtl?` right-aligns. On
  the first line, `marker` (if non-nil) is drawn at `marker-x` in `marker-font`. Returns the y just
  below the last line actually drawn. Shared by [[draw-block!]] and [[draw-text-block!]]."
  [^PDPageContentStream cs lines content-x content-w top-y bottom base-pt rtl? marker marker-x marker-font]
  (let [lh (* base-pt line-height-factor)]
    (loop [lines lines, y (double top-y), first? true]
      (if (empty? lines)
        y
        ;; lines with furigana need extra space above the base for the reading; lower the baseline
        ;; into that band and grow the line advance to match.
        (let [extra    (line-extra (first lines) base-pt)
              baseline (- y extra base-pt)
              adv      (+ lh extra)]
          (if (< (- y adv) bottom)
            y
            (do
              (when (and first? marker)
                (draw-line! cs marker-font base-pt marker-x baseline marker))
              (draw-md-line! cs content-x content-w rtl? baseline (first lines))
              (recur (rest lines) (- y adv) false))))))))

(def ^:private face-id->style
  "Inverse of [[run-font]]: the run style that selects each face. Lets plain text drawn with an
  explicit face be expressed as a single styled run and fed through the shared item pipeline."
  {:regular {} :bold {:bold? true} :italic {:italic? true}
   :bold-italic {:bold? true :italic? true} :mono {:code? true}})

(defn- draw-text-block!
  "Draw wrapped plain `text` top-aligned within `[x, top-y]`, bounded by `max-w`/`max-h`. Right-to-left
  text (Arabic/Hebrew) is flush-right within `max-w`; everything else is flush-left. When `color` is
  given, every run is forced to it (otherwise the face's natural colour is used). Returns the vertical
  points consumed.

  This expresses the text as a single styled run and reuses the shared Markdown layout/draw pipeline
  ([[words->lines]] + [[draw-item-lines!]]) so there is one wrapping/measuring/drawing path for all text."
  [^PDPageContentStream cs face font-pt ^Color color x top-y max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [runs  [(merge {:text (str text)} (get face-id->style (:id face) {}))]
          lines (cond->> (words->lines (runs->words runs) font-pt false max-w)
                  color (mapv (fn [line] (mapv #(assoc % :color color) line))))
          y     (draw-item-lines! cs lines x max-w top-y (- (double top-y) max-h) font-pt
                                  (base-rtl? text) nil x nil)]
      (- (double top-y) y))))

(defn- draw-code-block!
  [^PDPageContentStream cs block x top-y _cell-w bottom scale]
  (let [font (face :mono)
        pt   (* 9.0 scale)
        lh   (* pt line-height-factor)]
    (.setNonStrokingColor cs ^Color code-color)
    (let [y (loop [ls (str/split-lines (str (:text block))), y (double top-y)]
              (if (or (empty? ls) (< (- y lh) bottom))
                y
                (do (draw-line! cs font pt (+ x 4.0) (- y pt) (first ls))
                    (recur (rest ls) (- y lh)))))]
      (.setNonStrokingColor cs Color/BLACK)
      (- y 2.0))))

(defn- draw-image-block!
  "Draw a Markdown image: securely fetch + embed it scaled to the cell width (clamped to the
  remaining height). If the fetch fails for any reason, fall back to a Markdown link (the alt text
  or URL, in link color). Returns the y below the block."
  [^PDDocument doc ^PDPageContentStream cs block x top-y cell-w bottom scale]
  (if-let [^PDImageXObject img (fetch-image! doc (:src block))]
    (let [iw      (double (.getWidth img))
          ih      (double (.getHeight img))
          avail-h (- (double top-y) bottom)
          draw-w  cell-w
          draw-h  (* draw-w (/ ih iw))
          [draw-w draw-h] (if (> draw-h avail-h)
                            [(* avail-h (/ iw ih)) avail-h]
                            [draw-w draw-h])
          y       (- (double top-y) draw-h)]
      (.drawImage cs img (float x) (float y) (float draw-w) (float draw-h))
      (- y 4.0))
    (let [pt   (* text-card-pt scale)
          txt  (let [alt (:alt block)] (if (str/blank? alt) (:src block) alt))
          used (draw-text-block! cs (face :regular) pt link-color x top-y cell-w
                                 (- (double top-y) bottom) txt)]
      (when (and *link-rects* (clickable-href? (:src block)))
        (swap! *link-rects* conj {:x0 (double x) :y0 (- (double top-y) used)
                                  :x1 (+ (double x) cell-w) :y1 (double top-y) :href (:src block)}))
      (- (double top-y) used 4.0))))

(defn- draw-block!
  "Draw one markdown block within `[x, top-y]` of `cell-w`, clipping at `bottom`. Returns the y
  below the block (top of the next)."
  [^PDDocument doc ^PDPageContentStream cs block x top-y cell-w bottom scale]
  (case (:kind block)
    :hr (let [y (- (double top-y) (* 5.0 scale))]
          (.setStrokingColor cs ^Color body-color)
          (.moveTo cs (float x) (float y))
          (.lineTo cs (float (+ x cell-w)) (float y))
          (.stroke cs)
          (.setStrokingColor cs Color/BLACK)
          (- y (* 5.0 scale)))
    :image (draw-image-block! doc cs block x top-y cell-w bottom scale)
    :code-block (draw-code-block! cs block x top-y cell-w bottom scale)
    ;; heading / paragraph / list-item
    (let [heading?    (= :heading (:kind block))
          base-pt     (* (if heading? (heading-pt (:level block)) text-card-pt) scale)
          indent-x    (+ (double x) (* (long (or (:indent block) 0)) 14.0))
          ;; markers ("- ", "1. ") are ASCII; keep their trailing space (sanitize would trim it)
          marker      (:marker block)
          marker-font (face :regular)
          marker-w    (if marker (text-width marker-font base-pt marker) 0.0)
          content-x   (+ indent-x marker-w)
          content-w   (- (+ (double x) cell-w) content-x)
          block-text  (apply str (map #(or (:text %) (:base %) "") (:runs block)))
          ;; right-align RTL paragraphs and headings; list items (those with a marker) stay
          ;; left-aligned for now -- proper RTL lists (marker on the right) are a separate change.
          rtl?        (and (nil? marker) (base-rtl? block-text))
          lines       (words->lines (runs->words (:runs block)) base-pt heading? content-w)]
      (draw-item-lines! cs lines content-x content-w top-y bottom base-pt rtl? marker indent-x marker-font))))

(defn- draw-markdown-in-cell!
  "Render markdown `text` top-down within a cell rectangle. Shrinks the font (down to a floor)
  so the content fits the cell height instead of clipping; clips only if even the floor overflows."
  [^PDDocument doc ^PDPageContentStream cs x top-y cell-w cell-h text]
  (let [blocks (parse-markdown-blocks text)
        scale  (fit-scale blocks cell-w cell-h)
        bottom (- (double top-y) cell-h)]
    (loop [blocks blocks, y (double top-y)]
      (when (and (seq blocks) (> y (+ bottom 2.0)))
        (recur (rest blocks)
               (- (draw-block! doc cs (first blocks) x y cell-w bottom scale) (* 4.0 scale)))))))

;; --------------------------------------------------------------------------------------------
;; Cell building -- turn dashcards into renderable cells, preserving grid geometry
;; --------------------------------------------------------------------------------------------

(defn- iframe-url
  "Extract the target URL from an iframe card's `:iframe` setting, which is either a bare URL or an
  `<iframe src=\"...\">` embed snippet (mirrors the frontend's handling). Adds an `https://` scheme
  if missing. Returns nil if no URL can be found."
  [iframe-setting]
  (when-let [s (some-> iframe-setting str str/trim not-empty)]
    (when-let [raw (if (str/starts-with? s "<iframe")
                     (second (re-find #"(?i)\bsrc\s*=\s*[\"']([^\"']+)[\"']" s))
                     s)]
      (let [raw (str/trim raw)]
        (when (not-empty raw)
          (if (re-find #"(?i)^[a-z][a-z0-9+.-]*://" raw)
            raw
            (str "https://" (str/replace raw #"^//" ""))))))))

(defn- resolve-inline-params
  "The full parameter definitions (carrying values) for a dashcard's inline parameters, matching
  how email subscriptions resolve them. Returns only those with a value, in `parameters` order."
  [dc parameters]
  (let [ids (set (:inline_parameters dc))]
    (when (seq ids)
      (not-empty (filterv #(and (ids (:id %)) (some? (:value %))) parameters)))))

(defn- dashcard->cell
  "Build a renderable cell from a dashcard, preserving its grid geometry. Returns nil for
  dashcard kinds we don't render (placeholder/action) or cards that fail/are empty."
  [dc parameters]
  (let [inline (resolve-inline-params dc parameters)
        geom   (cond-> (select-keys dc [:row :col :size_x :size_y])
                 (seq inline) (assoc :inline-params inline))]
    (cond
      (:card_id dc)
      (when-let [part (notification.payload/execute-dashboard-subscription-card dc parameters)]
        (assoc geom :kind :card :part (cond-> part (seq inline) (assoc :inline-params inline))))

      (notification.payload/virtual-card-of-type? dc "heading")
      (assoc geom :kind :heading
             :text (get-in (notification.payload/process-virtual-dashcard dc parameters)
                           [:visualization_settings :text]))

      (notification.payload/virtual-card-of-type? dc "text")
      (assoc geom :kind :text
             :text (get-in (notification.payload/process-virtual-dashcard dc parameters)
                           [:visualization_settings :text]))

      ;; link cards render as a markdown `### [name](url)` text cell (clickable like any md link);
      ;; reuse the email conversion so they match, and so entity links are permission-checked.
      (notification.payload/virtual-card-of-type? dc "link")
      (when-let [part (notification.payload/dashcard-link-card->part dc)]
        (assoc geom :kind :text :text (:text part)))

      ;; iframe cards (embedded video/web players) can't render in a PDF -- show the target as a
      ;; clickable link instead (autolinked bare URL).
      (notification.payload/virtual-card-of-type? dc "iframe")
      (when-let [url (iframe-url (get-in dc [:visualization_settings :iframe]))]
        (assoc geom :kind :text :text url))

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
  [section idx {:keys [unit rows]} tabbed? dash-name param-table param-rows]
  (let [dash-rows (rows-for-pt (header-block-pt dashboard-title-pt) unit)
        tab-rows  (rows-for-pt (header-block-pt tab-title-pt) unit)
        ;; the parameter table shows once, on the dashboard's very first page (section 0)
        first-hdr (+ (if (zero? idx) (+ dash-rows param-rows) 0)
                     (if tabbed? tab-rows 0))]
    (map-indexed
     (fn [pi pg]
       (assoc pg
              :dashboard-title (when (and (zero? idx) (zero? pi)) dash-name)
              :tab-title       (when (and tabbed? (zero? pi)) (:tab-name section))
              :param-table     (when (and (zero? idx) (zero? pi)) param-table)))
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

(defn- effective-display
  "The display type the card actually renders as. A visualizer dashcard overrides the underlying
  card's `:display` (e.g. a smartscalar card shown as a `bar`), so prefer the visualizer display
  when present -- matching `render.card/visualizer-display-type`."
  [card dashcard]
  (or (when (render.util/is-visualizer-dashcard? dashcard)
        (some-> (get-in dashcard [:visualization_settings :visualization :display]) keyword))
      (keyword (:display card))))

(defn- cards-with-data
  "Replicate the multi-series data shape `body/render :javascript_visualization` feeds to
  static-viz (sans timeline events, which static-viz never officially used)."
  [card dashcard data]
  (->> (:series-results dashcard)
       (map (fn [m] (-> m (assoc :data (get-in m [:result :data])) (dissoc :result))))
       (cons {:card card :data data})
       (m/distinct-by #(get-in % [:card :id]))))

(defn- sized-chart-png
  "Render an isomorphic chart to a PNG, telling static-viz to lay the chart out into a `w-px` x
  `h-px` logical box (so it fills it the way the frontend does), rasterized at
  [[chart-supersample]] times that pixel size for crispness. Used for rectangular charts and for
  square/wide pies (which then place their legend to the side). Returns nil if the chart doesn't
  produce an SVG."
  ^bytes [card dashcard data w-px h-px]
  (binding [js.svg/*chart-size* {:width w-px :height h-px :scale chart-supersample}]
    (let [viz (or (:visualization_settings dashcard) (:visualization_settings card))
          {t :type c :content} (js.svg/*javascript-visualization* (cards-with-data card dashcard data) viz)]
      (when (= :svg t)
        (js.svg/svg-string->bytes c)))))

(defn- text-block-height
  "Vertical points a wrapped text block would consume (without drawing), bounded by `max-h`. Uses the
  same single-styled-run item pipeline as [[draw-text-block!]]."
  [face font-pt max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [lh    (* font-pt line-height-factor)
          runs  [(merge {:text (str text)} (get face-id->style (:id face) {}))]
          lines (words->lines (runs->words runs) font-pt false max-w)
          fit   (long (Math/floor (/ (double max-h) lh)))]
      (min (lines-height lines font-pt) (* (max 0 fit) lh)))))

;; --------------------------------------------------------------------------------------------
;; Parameters. The dashboard's active filter values are shown once at the very top, as a two-column
;; (name | value) table (like the email filter bar). A card's *inline* parameters render on the card
;; itself, flowing inline as `Name: value`. Both reuse the common text layout/draw pipeline; the only
;; bespoke piece is sizing the table's name column (see [[min-column-width]]).
;; --------------------------------------------------------------------------------------------

(defn- min-column-width
  "The narrowest width (<= `max-w`) at which `units` still pack into the *fewest* lines they would take
  at `max-w`. This is the bottleneck variant of word-wrap (minimise the max line width for a fixed
  line count); we solve it by binary search using the greedy [[pack-units->lines]] as a monotonic
  feasibility oracle (a wider column never needs more lines), bottoming out at the widest single unit.
  Cheap -- a handful of greedy wraps, each measurement cached (see [[*width-cache*]])."
  [units max-w split-fn]
  (if (empty? units)
    0.0
    (let [lines-at (fn [w] (count (pack-units->lines units w split-fn)))
          target   (lines-at max-w)
          lo0      (reduce max 0.0 (map :ww units))]
      (loop [lo lo0, hi (double max-w)]
        (if (< (- hi lo) 0.5)
          hi
          (let [mid (/ (+ lo hi) 2.0)]
            (if (<= (lines-at mid) target)
              (recur lo mid)
              (recur mid hi))))))))

(defn- param-entries
  "Name/value strings for each parameter carrying a non-blank formatted value (via `value-string`,
  like the email filter bar)."
  [params]
  (let [locale (system/site-locale)]
    (vec (for [p     params
               :when (some? (:value p))
               :let  [v (some-> (shared.params/value-string p locale) str str/trim)]
               :when (not (str/blank? v))]
           {:name (str (:name p)) :value v}))))

(defn- dashboard-param-entries
  "Entries for the dashboard-wide filter table: only top-level (non-inline) parameters. Inline
  parameters render on their own card instead."
  [params inline-ids]
  (param-entries (remove #(contains? inline-ids (:id %)) params)))

(defn- styled-run-lines
  "Wrap a single styled run (`text` with `style`, e.g. {:bold? true} or {:color ...}) to `max-w` at
  `param-pt`, returning drawable item-lines via the shared pipeline."
  [text style max-w]
  (words->lines (runs->words [(merge {:text (str text)} style)]) param-pt false max-w))

(defn- measured-name-units
  "Pre-measured units for a parameter name (bold, `param-pt`) -- input to [[min-column-width]]."
  [name]
  (let [[units _] (tokenize-units (normalize-ws name) {} false [])
        sp        (text-width (face :bold) param-pt " ")]
    (mapv (fn [u] (assoc u :ww (text-width (face :bold) param-pt (:text u)) :sp sp)) units)))

(defn- layout-param-table
  "Lay out filter `entries` as a two-column (name | value) table within `avail-w` starting at `x`. The
  names column is sized by [[min-column-width]] (capped at 40% of `avail-w`); the rest goes to values.
  The columns swap (values left, names right) when the first parameter's name reads right-to-left.
  Returns nil when there are no valued parameters, else a layout map with the column geometry, the
  wrapped lines per row, and the total `:height`."
  [entries avail-w x]
  (when (seq entries)
    (let [rtl?     (base-rtl? (:name (first entries)))
          max-nw   (* 0.4 avail-w)
          split-fn (fn [u] (if (<= (count (str (:text u))) 1)
                             [u]
                             (map #(assoc % :ww (text-width (face :bold) param-pt (:text %)) :sp (:sp u))
                                  (split-into-chars u))))
          name-w   (min max-nw (reduce max 0.0 (map #(min-column-width (measured-name-units (:name %)) max-nw split-fn)
                                                    entries)))
          value-w  (- avail-w name-w param-chip-gap)
          name-x   (if rtl? (+ (double x) value-w param-chip-gap) (double x))
          value-x  (if rtl? (double x) (+ (double x) name-w param-chip-gap))
          rows     (mapv (fn [e]
                           (let [nl (styled-run-lines (:name e) {:bold? true} name-w)
                                 vl (styled-run-lines (:value e) {:color body-color} value-w)]
                             {:name-lines nl :value-lines vl
                              :height (max (lines-height nl param-pt) (lines-height vl param-pt))}))
                         entries)]
      {:name-x name-x :name-w name-w :value-x value-x :value-w value-w
       :rows rows :height (reduce + 0.0 (map :height rows))})))

(defn- param-table-rows
  "Whole grid rows the parameter table consumes (0 when there is none)."
  [table unit]
  (if table (rows-for-pt (+ (:height table) header-pad-pt) unit) 0))

(defn- draw-param-table!
  "Draw the parameter `table` from `top-y` (the columns already hold absolute x positions). Returns
  the y below it."
  [^PDPageContentStream cs table top-y]
  (let [{:keys [name-x name-w value-x value-w rows]} table]
    (loop [rows rows, y (double top-y)]
      (if (empty? rows)
        (- y 4.0)
        (let [{:keys [name-lines value-lines height]} (first rows)
              bottom (- y height 1.0)]
          (draw-item-lines! cs name-lines name-x name-w y bottom param-pt
                            (base-rtl? (or (:text (ffirst name-lines)) "")) nil name-x nil)
          (draw-item-lines! cs value-lines value-x value-w y bottom param-pt
                            (base-rtl? (or (:text (ffirst value-lines)) "")) nil value-x nil)
          (recur (rest rows) (- y height)))))))

(defn- inline-param-lines
  "Wrapped item-lines for a card's inline parameters, flowing inline as `Name: value`, `Name2: value2`,
  ... (bold names, gray values), greedily wrapped to `cell-w` (preserving the previous flow behaviour).
  Returns nil when there are none."
  [inline-params cell-w]
  (let [entries (param-entries inline-params)]
    (when (seq entries)
      (let [runs (vec (mapcat (fn [i e]
                                (concat (when (pos? i) [{:text "  "}]) ; gap before each param after the first
                                        [{:text (:name e) :bold? true}
                                         {:text ": "}
                                         {:text (:value e) :color body-color}]))
                              (range) entries))]
        (words->lines (runs->words runs) param-pt false cell-w)))))

(defn- inline-params-height
  "Vertical points a card's inline parameter lines consume (0 when there are none)."
  [lines]
  (if (seq lines)
    (+ (lines-height lines param-pt) 4.0)
    0.0))

(defn- draw-inline-params!
  "Draw inline-parameter `lines` from `top-y` within `[x, x+content-w]`."
  [^PDPageContentStream cs lines x content-w top-y]
  (when (seq lines)
    (draw-item-lines! cs lines x content-w top-y (- (double top-y) (lines-height lines param-pt) 1.0)
                      param-pt (base-rtl? (or (:text (ffirst lines)) "")) nil x nil)))

(defn- fill-rect!
  "Fill the box whose top-left is `[x, top-y]` (and is `w` x `h`) with `color`, then reset to black.
  Used for the [[*debug-boxes*]] overlays drawn behind content."
  [^PDPageContentStream cs ^Color color x top-y w h]
  (.setNonStrokingColor cs color)
  (.addRect cs (float x) (float (- (double top-y) (double h))) (float w) (float h))
  (.fill cs)
  (.setNonStrokingColor cs Color/BLACK))

(defn- render-card-cell!
  "Render a chart/query card into its cell rectangle. The title is drawn natively at the PDF level
  (crisp text) and the space it consumes is reserved before the body is rendered. (Card
  descriptions are intentionally omitted -- they vary from the frontend dashboard and add little
  in a static export.) Rectangular (ECharts/visx) charts are then rendered to exactly fill the
  remaining body area (matching the frontend); other types render their body title-less and fit
  preserving aspect into the body area."
  [^PDDocument doc ^PDPageContentStream cs timezone
   {:keys [card dashcard inline-params] :as part} x top-y cell-w cell-h]
  (let [data       (get-in part [:result :data])
        title      (card-title card dashcard)
        th         (text-block-height (face :bold) chart-title-pt cell-w (* 0.5 cell-h) title)
        ;; Inline parameters (filters attached to this card) render between the title and the
        ;; chart body, like the email subscription does.
        ip-lines   (inline-param-lines inline-params cell-w)
        iph        (inline-params-height ip-lines)
        header     (+ th iph (if (or (pos? th) (pos? iph)) 4.0 0.0))
        body-top   (- (double top-y) header)
        body-h     (- cell-h header)
        display    (effective-display card dashcard)
        ;; Rectangular charts always fill their box; pies fill (and move their legend to the
        ;; side) only when the body area is square-or-wider, otherwise they keep a bottom legend.
        fill?      (or (contains? rectangular-displays display)
                       (and (= :pie display) (>= cell-w body-h)))]
    ;; Debug overlays (drawn first, so content sits on top): the full title box (blue) and the full
    ;; chart-body box (red) -- the *allocated* space, regardless of how much the content fills.
    (when *debug-boxes*
      (when (pos? th) (fill-rect! cs debug-heading-color x top-y cell-w th))
      (when (> body-h 12.0) (fill-rect! cs debug-chart-color x body-top cell-w body-h)))
    ;; Native title for every card type.
    (draw-text-block! cs (face :bold) chart-title-pt nil x top-y cell-w (* 0.5 cell-h) title)
    (when (seq ip-lines)
      (draw-inline-params! cs ip-lines x cell-w (- (double top-y) th)))
    (when (> body-h 12.0)
      ;; in debug mode render charts transparently, so the red box behind them shows through the
      ;; whitespace ECharts/visx leave inside the image.
      (binding [js.svg/*svg-background-color* (if *debug-boxes* nil js.svg/*svg-background-color*)]
        (if-let [png (when fill?
                       (sized-chart-png card dashcard data (pt->px cell-w) (pt->px body-h)))]
          ;; rendered at exactly cell-w x body-h px -> draw to fill the body area exactly
          (.drawImage cs (PDImageXObject/createFromByteArray doc png "chart")
                      (float x) (float (- body-top body-h)) (float cell-w) (float body-h))
          ;; fallback: title-less body PNG, fit preserving aspect into the body area
          (when-let [body (card-body-png timezone part (long (max 240 (min 2200 (pt->px cell-w)))))]
            (draw-image-in-cell! cs (PDImageXObject/createFromByteArray doc body "card") x body-top cell-w body-h)))))))

(defn- line-start-x
  "Start x for drawing a single line of `text` (measured with `face`/`font-pt`) within the box
  `[x, x+box-w]`: flush-right when the text's base direction is RTL, flush-left otherwise."
  [face font-pt x box-w ^String text]
  (if (base-rtl? text)
    (+ (double x) (max 0.0 (- (double box-w) (text-width face font-pt text))))
    (double x)))

(defn- draw-header!
  [^PDPageContentStream cs page-height content-w {:keys [dashboard-title tab-title param-table]}]
  (let [bold (face :bold)
        top  (- (double page-height) margin)
        ;; order: dashboard title, then the dashboard-wide parameter table, then the tab title
        y1   (if dashboard-title
               (do (draw-line! cs bold dashboard-title-pt
                               (line-start-x bold dashboard-title-pt margin content-w dashboard-title)
                               (- top dashboard-title-pt) dashboard-title)
                   (- top (header-block-pt dashboard-title-pt)))
               top)
        y2   (if param-table
               (draw-param-table! cs param-table y1)
               y1)]
    (when tab-title
      (draw-line! cs bold tab-title-pt
                  (line-start-x bold tab-title-pt margin content-w tab-title)
                  (- y2 tab-title-pt) tab-title))))

(defn- add-link-annotations!
  "Add a clickable URI link annotation to `pg` for each collected rectangle (invisible border --
  the link text is already coloured)."
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
                       (.setAction (doto (PDActionURI.) (.setURI (str href)))))]
          (.add annots link)))
      ;; re-attach the list so the /Annots array is written when the page has none yet
      (.setAnnotations pg annots))))

(defn- with-cell-inline-params!
  "Draw a virtual cell's content via `draw-content!` (a fn of the available content height),
  reserving space at the bottom of the cell for its inline parameter chips and drawing them
  there afterward -- mirroring how email renders a heading/text card's filters below it."
  [^PDPageContentStream cs x top-y cell-w cell-h inline-params draw-content!]
  (let [ip-lines (inline-param-lines inline-params cell-w)
        iph      (inline-params-height ip-lines)]
    (draw-content! (- (double cell-h) iph))
    (when (seq ip-lines)
      (draw-inline-params! cs ip-lines x cell-w (- (double top-y) (- (double cell-h) iph))))))

(defn- render-page!
  [^PDDocument doc {:keys [^PDRectangle rect unit]} timezone page]
  (let [pg            (PDPage. rect)
        _             (.addPage doc pg)
        ph            (.getHeight rect)
        cs            (PDPageContentStream. doc pg)
        card-area-top (- ph margin (* (:header-rows page) unit))]
    (binding [*link-rects* (atom [])]
      (try
        (draw-header! cs ph (* grid-cols unit) page)
        (doseq [cell (:cards page)]
          (let [rr     (- (:row cell) (:base page))
                half   (/ gutter-pt 2.0)
                ;; inset each card's grid rectangle by half a gutter so neighbours are separated
                ;; by a full gutter; heading/text cells keep their bottom half (so a one-row
                ;; section header still fits its text -- it gets a half gutter below instead).
                text?  (contains? #{:heading :text} (:kind cell))
                x      (+ margin (* (:col cell) unit) half)
                top-y  (- card-area-top (* rr unit) half)
                cell-w (- (* (:size_x cell) unit) gutter-pt)
                cell-h (min (- (* (:size_y cell) unit) (if text? half gutter-pt))
                            (- top-y margin))]
            (try
              ;; debug overlay: the full heading-card cell (blue), drawn behind its text
              (when (and *debug-boxes* (= :heading (:kind cell)))
                (fill-rect! cs debug-heading-color x top-y cell-w cell-h))
              (case (:kind cell)
                :card    (render-card-cell! doc cs timezone (:part cell) x top-y cell-w cell-h)
                :heading (with-cell-inline-params! cs x top-y cell-w cell-h (:inline-params cell)
                           #(draw-text-block! cs (face :bold) heading-card-pt nil x top-y cell-w % (:text cell)))
                :text    (with-cell-inline-params! cs x top-y cell-w cell-h (:inline-params cell)
                           #(draw-markdown-in-cell! doc cs x top-y cell-w % (:text cell)))
                nil)
              (catch Throwable e
                (log/error e "Error rendering dashboard PDF cell; substituting placeholder")
                (draw-text-block! cs (face :regular) 10.0 nil x top-y cell-w cell-h
                                  "[Unable to render this card]")))))
        (finally
          (.close cs)))
      (add-link-annotations! pg @*link-rects*))))

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
         (binding [*fonts*       (load-fonts! doc)
                   *width-cache* (atom {})]
           (let [content-w   (* grid-cols (:unit dims))
                 inline-ids  (into #{} (mapcat :inline_parameters) dcs)
                 param-table (layout-param-table (dashboard-param-entries resolved inline-ids) content-w margin)
                 param-rows  (param-table-rows param-table (:unit dims))]
             (doseq [[idx section] (map-indexed vector sections)
                     page          (pages-for-section section idx dims tabbed? (:name dash) param-table param-rows)]
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
  (render-dashboard-to-pdf-file 1 1 {} "/tmp/dash.pdf"))
