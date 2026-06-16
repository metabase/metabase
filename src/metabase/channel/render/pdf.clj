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
   [metabase.channel.render.pdf.markdown :as md]
   [metabase.channel.render.util :as render.util]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.parameters.shared :as shared.params]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.memoize :as memo]
   [toucan2.core :as t2])
  (:import
   (com.ibm.icu.text ArabicShaping Bidi)
   (java.awt Color)
   (java.awt.geom AffineTransform PathIterator)
   (java.io ByteArrayOutputStream StringReader)
   (org.apache.batik.parser AWTPathProducer)
   (org.apache.fontbox.ttf CmapLookup TrueTypeFont TTFParser)
   (org.apache.pdfbox.io RandomAccessReadBuffer)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.font PDFont PDType0Font)
   (org.apache.pdfbox.pdmodel.graphics.image PDImageXObject)
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
  "Points of empty space between adjacent cards. Realized as a half-gutter inset on all sides of a card's grid
  rectangle, so two neighbours are separated by a full gutter while the outermost cards sit half a gutter inside
  the page margin (and the first row sits half a gutter below the header).

  Heading/text cells skip the *bottom* half of the inset (see [[render-page!]]) so a one-row section header --
  whose cell is barely taller than its text -- still has room to render."
  9.0)

(def ^:private dpi
  "Pixels per inch used to size rasterized charts. Higher = crisper but larger PDFs.

  A grid cell's pixel dimensions are derived from its printed point size and this DPI. NOTE: this also sets the
  chart's *logical* layout size, so raising it shrinks chart fonts/labels rather than just sharpening. Use
  [[chart-supersample]] for pure sharpness."
  150.0)

(def ^:private chart-supersample
  "Supersampling factor for isomorphic (ECharts/visx) chart rasters: the chart is laid out at its `dpi`-derived
  logical pixel size (so fonts/labels are unchanged) but the SVG is rasterized to this many times more pixels, then
  drawn into the same on-page box -- crisper at the same page size.

  1.0 = no supersampling; 2.0 makes a 150-DPI chart effectively 300 DPI (for print/zoom) at ~+12% PDF size.
  See [[metabase.channel.render.js.svg/*chart-size*]]."
  2.0)

(def ^:private body-color (Color. 0x6B 0x73 0x80))
(def ^:private link-color (Color. 0x1B 0x6F 0xC2))
(def ^:private code-color (Color. 0x3B 0x3B 0x3B))

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
;; Fonts -- embedded Noto Sans (TrueType, via PDType0Font) so we can render Unicode (Latin, Cyrillic, Greek, CJK, ...)
;; rather than the ASCII-only Standard-14 fonts. PDType0Fonts are tied to a specific PDDocument, so we load a
;; registry once per render and bind it to `*fonts*`.
;; --------------------------------------------------------------------------------------------

(def ^:private physical-font-resources
  "Physical font keyword -> classpath resource. The fonts are TrueType (glyf) format, so PDFBox can subset them and
  the output PDF only carries the glyphs actually used.

  Lato regular and bold are preferred, as that's the Metabase UI's main body text, as well as the font for our logo and
  other branding. Noto Sans has further coverage of Latin accents and special characters, plus Devanagari (Hindi et al),
  Cyrillic and Greek. Hebrew and Arabic are handled by specific font faces, and finally the per-region Noto Sans
  JP/KR/SC faces cover Japanese, Korean and Simplified Chinese.

  See [[visual-order]] for RTL reordering for Hebrew and Arabic, and for *shaping* of Arabic."
  {:noto-regular     "fonts/pdf/NotoSans-Regular.ttf"
   :noto-bold        "fonts/pdf/NotoSans-Bold.ttf"
   :noto-italic      "fonts/pdf/NotoSans-Italic.ttf"
   :noto-bold-italic "fonts/pdf/NotoSans-BoldItalic.ttf"
   :noto-mono        "fonts/pdf/NotoSansMono-Regular.ttf"

   ;; TODO: (bshepherdson 2026-06-11) We reuse the FE's bundled Lato asset directly rather than duplicating it into a
   ;; BE-owned path (it has full Latin/Cyrillic/Greek/Vietnamese coverage and is already shipped). This couples us to
   ;; the `frontend_client` asset layout. These files should be moved to a BE-owned part of `resources/` and the static
   ;; asset serving adjusted to preserve the FE URLs.
   :brand-regular    "frontend_client/app/fonts/Lato/Lato-Regular.ttf"
   :brand-bold       "frontend_client/app/fonts/Lato/lato-v16-latin-700.ttf"

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
  "Per-document map of `{face-keyword {:fallbacks [<phys> ...]} ...}`, where each `<phys>` is
  `{:font <PDType0Font> :cmap <CmapLookup>}`. Bound while a document is being rendered, because `PDType0Fonts` are
  tied to a specific `PDDocument`; see [[load-fonts!]].

  Latin keeps the Lato (or Noto Sans) look across all styles; the CJK regional faces are ordered fallbacks so mixed
  English/Japanese text renders per-glyph from the right font.

  CJK has no italic, so italic CJK falls back to the upright CJK face."
  nil)

(defn- load-phys
  "Reads a physical font from its `resource-path` within the classpath. Registers the font with the `PDDocument`."
  [^PDDocument doc resource-path]
  (let [bytes  (with-open [is (io/input-stream (io/resource resource-path))]
                 (.readAllBytes is))
        ^TrueTypeFont ttf (.parse (TTFParser.) (RandomAccessReadBuffer. ^bytes bytes))]
    {:font (PDType0Font/load doc ttf true)
     :cmap (.getUnicodeCmapLookup ttf)}))

;; TODO: (bshepherdson 2026-06-11) It's wasteful of CPU time and memory to read these up front, when most of the
;; physical fonts won't be used at all. Instead, load them on demand and cache them for the life of the PDDocument.
(defn- load-fonts!
  "Load the font registry into `doc`. Call once per document; PDFBox subsets the embedded fonts at
  save time, so only the glyphs actually used end up in the output PDF."
  [^PDDocument doc]
  (let [phys  (update-vals physical-font-resources #(load-phys doc %))
        ;; `:id` is a stable keyword identifying the face -- used as a cheap cache key (see
        ;; [[*em-width*]]) instead of the heavy `{:fallbacks ...}` map.
        face* (fn [id & fallbacks]
                {:id        id
                 :fallbacks (mapv phys (flatten fallbacks))})
        regulars [:hebrew-regular :arabic-regular :jp-regular :kr-regular :sc-regular]
        bolds    [:hebrew-bold    :arabic-bold    :jp-bold    :kr-bold    :sc-bold]]
    ;; The fallback order for each style is important: first ordering by preference in case they overlap; and then
    ;; where there's no overlap (especially CJK) to put the heaviest fonts last.
    {:regular     (face* :regular     :brand-regular :noto-regular regulars)
     :bold        (face* :bold        :brand-bold    :noto-bold    bolds)
     :italic      (face* :italic      :noto-italic                 regulars)
     :bold-italic (face* :bold-italic :noto-bold-italic            bolds)
     :mono        (face* :mono        :noto-mono                   regulars)}))

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

  Checks each of the `:fallbacks` in order. If none of the fonts has a glyph for this codepoint, returns nil."
  [{:keys [fallbacks] :as _face} cp]
  (m/find-first #(covers? % cp) fallbacks))

(defn- font-runs
  "Split `s` into maximal `[phys ^String chunk]` runs that all use the same physical font.

  For each codepoint, the physical font chosen is the first one in this order that has the glyph:

  - each of face's the `:fallbacks` in order
  - abandon this codepoint, and fall back to ASCII `?`, and repeat the search.

  Since every codepoint is resolved to some glyph, `showText` will never throw."
  ;; TODO: (bshepherdson, 2026-06-09) Consider using the "tofu" placeholder box ☐ instead.
  [face ^String s]
  (let [n    (.length s)
        emit (fn [out cur ^StringBuilder sb]
               (cond-> out
                 (some? cur) (conj! [cur (.toString sb)])))]
    (loop [i                 0
           cur               nil
           ^StringBuilder sb nil
           out               (transient [])]
      (b/cond
        (>= i n) (persistent! (emit out cur sb))

        :let [cp   (.codePointAt s i)
              phys (cp-font face cp)
              ;; If the codepoint doesn't have a matching glyph in any font, phys is nil. In that case, default `ch`
              ;; to `?` and search for `phys` again.
              ch   (if phys cp (int \?))
              phys (or phys (cp-font face ch))]
        ;; At this point, `phys` is a physical font and `ch` is the codepoint to use within that font.
        ;; `cp` itself holds the proper input codepoint, which we still need to gets its `charCount` and advance the
        ;; right distance through the input string.

        ;; No change of font, so keep appending to the current StringBuilder.
        (identical? phys cur) (do (.appendCodePoint sb ch)
                                  (recur (+ i (Character/charCount cp)) cur sb out))

        ;; Hit a seam between fonts, so append the current run to `out` and start a new one.
        :else (recur (+ i (Character/charCount cp))
                     phys
                     (doto (StringBuilder.) (.appendCodePoint ch))
                     (emit out cur sb))))))

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
(defn- ^{:clojure.core.memoize/args-fn (fn [face ^String s]
                                         [(:id face) s])}
  raw-em-width-inner
  "Don't call this; use the memoized version [[*raw-em-width*]].
  "
  ^double [face ^String s]
  (transduce (map (fn [[phys ^String chunk]]
                    (/ (.getStringWidth ^PDFont (:font phys) chunk) 1000.0)))
             + 0.0
             (font-runs face (visual-order (normalize-ws s)))))

(def ^{:dynamic true
       :arglists '([face ^String s])}
  *em-width*
  "Compute the width of `s` in `face` measured in *ems* (1.0 = the font size), so it can be multiplied by any font
  size to get points.

  Measures the *shaped* form (see [[visual-order]]) exactly as `draw-line!` draws it, so scripts (e.g. Arabic) where
  isolated letters are wider than their joined-up presentation forms are measured on the presentation form that will
  actually be rendered. A naive sum over isolated letter widths would overstate the space needed, leaving big gaps
  after each word in such scripts.

  Memoized within the context of each render, keyed on `[(:id face) s]`. Since ems are independent of font size, this
  can be reused for whatever font size. We compute the size of each string repeatedly, so this saves a bunch of
  recomputation. Bound in [[render-dashboard-to-pdf]] to the memoized version; defaults when unbound to the uncached
  inner function."
  raw-em-width-inner)

(defn- text-width
  "Width in points of `s` drawn with `face` at `font-pt`. The per-glyph measurement lives in (cached) [[*em-width*]];
  this just scales it by the font size."
  ^double [face font-pt ^String s]
  (* (double font-pt) (*em-width* face s)))

(defn- cjk-char?
  "Codepoints from scripts that don't use spaces between words. Line breaks are allowed between adjacent characters from
  these scripts. (CJK ideographs, kana, hangul, and CJK punctuation/fullwidth forms)."
  [cp]
  (or
   ;; 2E80-2FFF CJK radicals, Kangxi
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

;; --------------------------------------------------------------------------------------------
;; Greedy streaming grouping (`segment`)
;;
;; A stateful transducer for greedily "packing" input items into grouped output items; a
;; generalized `partition-by`. Think packing words on a line of text, dashcards into pages, etc.
;;
;; User code (*policy*) is controlled by two (three) functions: opening a new group, including or
;; rejecting a new item in that group, and optionally finalizing each group before it is emitted
;; downstream.
;; --------------------------------------------------------------------------------------------

(defn- segment
  "A stateful transducer that greedily groups a stream of items. `collect` is the *policy*, given as two arities,
  and this transducer is the *mechanism* that drives them:

  - `(collect item)` is **open**: start a new group seeded with `item`. Must always succeed, so a group always holds
    at least one item. This guarantees progress - if the item passed to **open** is too big even for a fresh group
    (e.g. a word too long for a line all by itself) then **open** should forcibly split it.
  - `(collect acc item)` is **add**: fold `item` into the open group `acc`. Returns one of three things:
    - An updated `acc`: accepts the new item
    - `::reject`: the new `item` cannot fit! The current group is closed, and `item` is passed to **open** to become
      the first item in a new group.
    - `::break`: `item` represents the end of a group (e.g. a hard line break) and therefore the current group should
      be closed (if any) and `item` *dropped*. The next input item (if any) is used to **open** the next group.

  `close` (default `identity`) realizes a finished accumulator into the emitted value -- e.g. trim and RTL-reorder
  a packed line, or `str` a `StringBuilder`.

  Honors downstream `reduced?` (early termination) and flushes any open group in the transducer's completion step.

  See the tests for reimplementations of [[partition-all]] and [[partition-by]] using `segment`."
  ([collect] (segment collect identity))
  ([collect close]
   (fn [rf]
     (let [state (volatile! ::empty)]
       (fn
         ([] (rf))
         ([result]
          (let [acc @state]
            (vreset! state ::empty)
            (rf (if (= acc ::empty)
                  result
                  (unreduced (rf result (close acc)))))))
         ([result item]
          (let [acc @state]
            (if (= acc ::empty)
              (do (vreset! state (collect item))
                  result)
              (let [r (collect acc item)]
                (case r
                  ::reject (let [result (rf result (close acc))]
                             ;; closed; reopen with `item` -- unless downstream is done, then stop cleanly
                             (vreset! state (if (reduced? result)
                                              ::empty
                                              (collect item)))
                             result)
                  ::break  (do (vreset! state ::empty)
                               (rf result (close acc)))
                  (do (vreset! state r)
                      result)))))))))))

(defn- no-break-before?
  "True if `cp` is a CJK character that must not start a line (closing punctuation, small kana), so
  it sticks to the previous break-unit. A simplified kinsoku rule (see [[no-break-before-chars]])."
  [cp]
  (and (<= (int cp) 0xFFFF)
       (contains? no-break-before-chars (char cp))))

(defn- text->codepoint-items
  "`text` as a seq of `{:cp <codepoint>}` items, one per codepoint (surrogate pairs kept intact) --
  the input stream to the [[runs->words]] pipeline. `.toArray` materialises the codepoint
  `IntStream` into an `int[]` (a `java.util.stream.IntStream` isn't directly reducible)."
  [^String text]
  (into [] (map (fn [cp] {:cp cp}))
        (.toArray (.codePoints text))))

(defn- run-style
  "The style map carried on each piece of a run -- everything but the structural keys, plus `:link?`
  when the run is a hyperlink (so [[run-color]] can colour it)."
  [r]
  (cond-> (dissoc r :text :base :reading :ruby? :space? :break?)
    (:href r) (assoc :link? true)))

(defn- run->items
  "Expand one run into the [[runs->words]] input stream: a `:break?`/`:ruby?` run becomes a single atomic item;
  a text run becomes one `{:cp _ :style _}` item per codepoint, each tagged with the run's style so a
  [[collect-word]] word can carry pieces from more than one run."
  [r]
  (cond
    (:break? r) [{:break? true}]
    (:ruby? r)  [{:ruby? true :base (:base r) :reading (:reading r) :style (run-style r)}]
    :else       (let [style (run-style r)]
                  (map #(assoc % :style style) (text->codepoint-items (str (:text r "")))))))

(defn- mark-space-before
  "Stateful transducer over run items: drops whitespace codepoint items and stamps every surviving item with
  `:space-before?` -- true iff whitespace immediately preceded it.

  Accepts an initial `:space-before?` value, since some contexts start with leading space.

  A `:break?` clears `:space-before?` - it represents a hard line break or similar, and the next unit is therefore
  flush with the start."
  [init-space-before?]
  (fn [rf]
    (let [space-before? (volatile! (boolean init-space-before?))]
      (fn
        ([] (rf))
        ([result] (rf result))
        ([result item]
         (cond
           (and (:cp item) (Character/isWhitespace (int (:cp item))))
           (do (vreset! space-before? true) result)

           (:break? item)
           (do (vreset! space-before? false) (rf result item))

           :else
           (let [sb @space-before?]
             (vreset! space-before? false)
             (rf result (assoc item :space-before? sb)))))))))

(defn- collect-word
  "[[segment]] policy for grouping the run-item stream into break-units (words) that can't break across a line. This
  decides *word* boundaries only: the boundaries are whitespace and CJK char boundaries, NOT style changes, so
  `\"**bo**ld\"` stays one indivisible word. Each CJK character is its own word, except for a few no-break-before
  characters ([[no-break-before?]]) which stick onto the end of the open word (kinsoku). `:break?`/`:ruby?` items are
  atomic words. The accumulator just collects the word's raw codepoint items in `:cps` -- splitting them into styled
  `:pieces` is [[close-word]]'s job. `:cjk-unit?` means the word can no longer take an ordinary character."
  ([item]
   (if-let [cp (:cp item)]
     {:space-before? (boolean (:space-before? item))
      :cps           [item]
      :cjk-unit?     (cjk-char? (int cp))}
     {:atomic item}))
  ([acc item]
   (cond
     (:atomic acc)    ::reject
     (not (:cp item)) ::reject                          ; a ruby/break can't join a word
     :else
     (let [cp (int (:cp item))]
       (cond
         ;; a no-break-before char glues onto the open word even across a space (kinsoku wins)
         (no-break-before? cp) (-> acc (assoc :cjk-unit? true) (update :cps conj item))
         (:space-before? item) ::reject               ; whitespace preceded -> new word
         (cjk-char? cp)        ::reject               ; each CJK char is its own word
         (:cjk-unit? acc)      ::reject
         :else                 (update acc :cps conj item))))))

(defn- codepoints->string
  ^String [items]
  (let [sb (StringBuilder.)]
    (doseq [{:keys [cp]} items] (.appendCodePoint sb (int cp)))
    (.toString sb)))

(defn- close-word
  "Realise a [[collect-word]] accumulator into a word token: an atomic `:break?`/`:ruby?` item passes
  through; a char word splits its codepoints into same-style `:pieces` (`partition-by :style` -- the
  one place piece boundaries are decided), each `{:style _ :text _}`."
  [acc]
  (if-let [item (:atomic acc)]
    item
    {:space-before? (:space-before? acc)
     :pieces        (mapv (fn [grp] {:style (:style (first grp)) :text (codepoints->string grp)})
                          (partition-by :style (:cps acc)))}))

(defn- item-codepoint-count
  "Number of codepoints across all of a measured word item's `:pieces`."
  ^long [item]
  (transduce (map (fn [p] (let [^String t (:text p)] (.codePointCount t 0 (.length t)))))
             + 0 (:pieces item)))

(defn- split-into-chars
  "Split an over-wide measured word into one measured item per codepoint (each a single-piece word
  carrying its source piece's font/colour), so the wrapper can break inside it. The first keeps the
  word's `:space-before?`. Used to hard-break a token wider than the whole line."
  [{:keys [pieces sp space-before?] :as _item}]
  (->> (for [{:keys [font pt] :as piece} pieces
             cp                          (seq (.codePoints ^String (:text piece)))
             :let [text (String. (Character/toChars (int cp)))]]
         (merge (select-keys piece [:font :pt :color :href])
                {:text text
                 :ww   (text-width font pt text)}))
       (map-indexed (fn [i p]
                      {:space-before? (and space-before? (zero? i))
                       :sp            sp
                       :pieces        [p]
                       :ww            (:ww p)}))))

(defn- split-word-into-chars
  "The `split-fn` for [[pack-units->lines]]: break a too-wide word into per-codepoint pieces, leaving ruby groups
  and single-codepoint words atomic."
  [item]
  (if (or (:ruby? item)
          (<= (item-codepoint-count item) 1))
    [item]
    (split-into-chars item)))

(defn- pack-units->lines
  "Greedily pack pre-measured `units` into lines no wider than `max-w`. This is the shared word-wrap algorithm behind
  [[words->lines]], through which all text (Markdown cards, plain titles, headings, parameters) is wrapped.

  Each unit is a map carrying `:ww` (its drawn width), `:sp` (the width of one leading space), and `:space-before?`
  (whether the source had whitespace before it). A unit may instead be a `{:break? true}` marker, which forces a line
  break. A unit that alone exceeds `max-w` is broken via `split-fn` (a unit -> a seq of narrower pre-measured units;
  it returns the unit unchanged when it can't be split further, e.g. a single glyph).

  Returns a seq of lines, where each line is a seq of the same opaque input units, with each unit's `:space-before?`
  updated to whether *this line* draws a space before it. It's always false at the start of a line, so callers don't
  have to special-case the first unit.

  Note that while this resembles the shape that [[segment]] is for, there are two problems. First, [[segment]] is
  about grouping an input stream into *runs* with some property (e.g. text style) all the same; this function is
  about greedy bin-packing. Critically, atoms in this function are not *quite* indivisible! A single atom that is too
  big for a line by itself must be *divided* by [[split-word-into-chars]] to force a line break. There's no way to
  include that in the policy for [[segment]] without making it so intricate as to remove its value. An alternative
  HOF or transducer for bin-packing could be written, but this would be the only caller."
  [units max-w split-fn]
  (loop [[{:keys [break? sp space-before? ww] :as u} :as units] units
         line                                                   []
         line-w                                                 0.0
         lines                                                  (transient [])]
    (b/cond
      (empty? units)  (cond-> lines
                        (seq line) (conj! line)
                        :always    persistent!)

      ;; a hard break flushes the current line (which may be empty -> a blank line)
      break?          (recur (rest units) [] 0.0 (conj! lines line))

      :let [add-space? (and (seq line) space-before?)
            advance    (+ ww (if add-space? sp 0.0))
            ;; a unit alone on its line and wider than the whole line is a split candidate
            parts      (when (and (empty? line)
                                  (> ww max-w))
                         (split-fn u))]

      ;; the candidate actually split into more than one piece: retry with those in front
      (next parts)                       (recur (concat parts (rest units))
                                                line line-w lines)

      ;; the line is nonempty and the next unit won't fit: break here and retry the unit
      (and (seq line)
           (> (+ line-w advance) max-w)) (recur units [] 0.0 (conj! lines line))

      :else                              (recur (rest units)
                                                (conj line (assoc u :space-before? (boolean add-space?)))
                                                (+ line-w advance)
                                                lines))))

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

;; All text -- Markdown cards and plain titles/headings alike -- funnels through `runs->words` ->
;; `->measured-item` -> `pack-units->lines` -> `draw-item-lines!`. Plain text (see `draw-text-block!`)
;; is just the degenerate case of a single styled run.
(defn- runs->words
  "Turn a run stream (style + text chunks, possibly spanning whole paragraphs) into a flat vector of
  word tokens that can't break across a line: a multi-piece word `{:space-before? _ :pieces
  [{:style _ :text _}…]}`, a `{:ruby? …}` furigana group, or a `{:break? true}` hard break.

  One composed transducer over all runs at once: flatten to a codepoint/atomic stream
  ([[run->items]]), drop whitespace + stamp `:space-before?` ([[mark-space-before]]), then greedily
  group into words ([[segment]] + [[collect-word]]). Because words split on *whitespace* rather than
  run boundaries, a word naturally spans runs (so `\"**bo**ld\"` is one indivisible word with two
  styled pieces), which also makes inter-run spacing and CJK kinsoku fall out with no bookkeeping."
  [runs]
  (into [] (comp (mapcat run->items)
                 (mark-space-before false)
                 (segment collect-word close-word))
        runs))

(defn- run-color [style]
  (or (:color style)                     ; an explicit colour overrides (e.g. gray parameter values)
      (cond (:link? style) link-color
            (:code? style) code-color
            :else          Color/BLACK)))

(defmulti ^:private ->measured-item
  "Turn one Markdown word token into a drawable, pre-measured item (resolving its font and colour),
  ready for [[pack-units->lines]]. A furigana group becomes an atomic item whose width is the wider
  of its base and reading; a `{:break? true}` marker passes through unchanged. `:space-before?` is
  left as the source-level flag here -- `pack-units->lines` finalises it per line."
  {:arglists '([word-token base-pt heading?])}
  (fn [w _base-pt _heading?]
    (cond
      (:break? w) :break
      (:ruby?  w) :ruby
      :else       :default)))

(defmethod ->measured-item :break [w _base-pt _heading?]
  w)

(defmethod ->measured-item :ruby [{:keys [base reading style] :as w} base-pt heading?]
  ;; furigana group: base text with a smaller reading centered above; the item is atomic
  ;; (the reading must never wrap away from its base), and as wide as the wider of the two.
  (let [font    (run-font (cond-> style heading? (assoc :bold? true)))
        ruby-pt (* base-pt ruby-scale)
        bw      (text-width font base-pt base)
        rw      (text-width font ruby-pt reading)]
    (merge (select-keys w [:base :reading :space-before?])
           {:ruby?      true
            :font       font
            :pt         base-pt
            :ruby-pt    ruby-pt
            :base-ww    bw
            :reading-ww rw
            :color      (run-color style)
            :href       (:href style)
            :ww         (max bw rw)
            :sp         (text-width font base-pt " ")})))

(defmethod ->measured-item :default [{:keys [pieces space-before?]} base-pt heading?]
  ;; a word is a sequence of same-style pieces; each piece resolves its own font/colour and the word's
  ;; width is their sum. The line packer treats the word atomically; the draw path lays the pieces out
  ;; contiguously (no inter-piece space).
  (let [measured (mapv (fn [{:keys [style text]}]
                         (let [font (run-font (cond-> style heading? (assoc :bold? true)))]
                           {:font font :pt base-pt :color (run-color style) :href (:href style)
                            :text text :ww (text-width font base-pt text)}))
                       pieces)]
    {:space-before? space-before?
     :pieces        measured
     :ww            (transduce (map :ww) + 0.0 measured)
     ;; one leading space, drawn in the first piece's font when this word follows another on a line
     :sp            (let [{:keys [font]} (first measured)] (text-width font base-pt " "))}))

(defn- words->lines
  "Greedily wrap `words` to `max-w`, resolving each word's font/colour. Returns a vector of lines,
  each a vector of drawable items `{:pieces :ww :sp :space-before? ...}` (or atomic ruby/break items)."
  [words base-pt heading? max-w]
  (pack-units->lines (map #(->measured-item % base-pt heading?) words) max-w split-word-into-chars))

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

(defmulti ^:private block-height
  "Vertical points a block consumes when laid out at `scale` (mirrors `draw-block!`)."
  (fn [block _cell-w _scale]
    (:kind block)))

(defmethod block-height :hr [_block _cell-w scale]
  (* scale 10.0))

(defmethod block-height :image [_block _cell-w _scale]
  ;; Images don't participate in the font fit-scale: shrinking the text wouldn't shrink an image,
  ;; so an image must never force the surrounding text smaller. They contribute no height here and
  ;; are instead scaled (aspect-preserved) to fit whatever space is left after the text -- see
  ;; `draw-image-block!`.
  0.0)

(defmethod block-height :code-block [{:keys [text]} _cell-w scale]
  (-> (str text)
      str/split-lines
      count
      (* 9.0 scale line-height-factor)
      (+ 2.0)))

(defmethod block-height :default
  [{:keys [indent kind level marker runs]} cell-w scale]
  (let [heading?  (= :heading kind)
        base-pt   (* (if heading?
                       (heading-pt level)
                       text-card-pt)
                     scale)
        marker-w  (if marker
                    (text-width (face :regular) base-pt marker)
                    0.0)
        content-w (- cell-w
                     (* 14.0 (long (or indent 0)))
                     marker-w)]
    (-> (runs->words runs)
        (words->lines base-pt heading? content-w)
        (lines-height base-pt))))

(defn- markdown-total-height [blocks cell-w scale]
  (transduce (map #(+ (block-height % cell-w scale) (* 4.0 scale)))
             + 0.0
             blocks))

(defn- fit-scale
  "Largest font scale (<= 1.0, down to a readability floor) at which the markdown fits `cell-h`.
  Shrinks the text only when the content would otherwise overflow (and clip) the cell."
  [blocks cell-w cell-h]
  (or (first (filter #(<= (markdown-total-height blocks cell-w %)
                          cell-h)
                     (range 1.0 0.44 -0.05)))
      0.45))

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
    (swap! *link-rects* conj {:x0   (double x)
                              :y0   (- (double baseline) (* 0.2 pt))
                              :x1   (+ (double x) width)
                              :y1   (+ (double baseline) (* 0.85 pt))
                              :href href})))

(defn- item-text [{:keys [base text pieces] :as _item}]
  (cond
    text   (str text)
    base   (str base)
    pieces (transduce (map :text) str pieces)   ; a multi-piece word's full text
    :else  ""))

(defn- any-rtl? [items]
  (boolean (some #(contains-rtl? (item-text %))
                 items)))

(defn- reorder-bidi-items
  "Reorder a wrapped markdown line's word items from logical to visual order, so a right-to-left paragraph reads
  right-to-left at the word level. Each item's own glyphs are shaped/reversed separately by `draw-line!`
  (via `visual-order`); this handles the *order of the words*.

  We resolve bidi levels with ICU over the line's logical text (one representative offset per item), apply rule L2
  via `Bidi/reorderVisual`, then recompute each item's `:space-before?` for its new neighbour so inter-word spacing
  follows the visual order. Lines with no RTL text (the common case) are returned untouched."
  [items]
  (if (or (empty? items)
          (not (any-rtl? items)))
    items
    (let [sb     (StringBuilder.)
          starts (mapv (fn [it]
                         (when (and (:space-before? it)
                                    (pos? (.length sb)))
                           (.append sb \space))
                         (let [start (.length sb)]
                           (.append sb (item-text it))
                           start))
                       items)
          bidi   (Bidi. (.toString sb) (int Bidi/LEVEL_DEFAULT_LTR))
          levels (byte-array (map (fn [start] (.getLevelAt bidi (int start)))
                                  starts))
          order  (Bidi/reorderVisual levels)]
      (into [] (map-indexed
                (fn [vp lp]
                  ;; visually adjacent items are logically adjacent; the gap between two words is
                  ;; recorded on the one with the higher logical index, so reuse that flag.
                  (let [sep? (and (pos? vp)
                                  (->> (max (aget order (dec vp))
                                            (int lp))
                                       (nth items)
                                       :space-before?
                                       boolean))]
                    (assoc (nth items lp) :space-before? sep?)))
                order)))))

(defn- md-line-width
  "Drawn width of a (reordered) markdown line: each item's advance plus the space before it."
  ^double [items]
  (transduce (map (fn ^double [{:keys [sp space-before? ww]}]
                    (+ (if space-before?
                         (double sp)
                         0.0)
                       (double ww))))
             + 0.0 items))

(defn- draw-md-ruby-item!
  "Draw a Markdown item with a single part of main text and a *ruby* reading written smaller above it.

  Returns the `x` coordinate after this item."
  [^PDPageContentStream cs x baseline {:keys [base base-ww color font pt reading reading-ww ruby-pt ww] :as item}]
  ;; Either the base or the reading might be longer! `ww` is the greater of the two widths, and we center both
  ;; reading and base text inside a box of width `ww`.
  (let [base-x (+ x (/ (- ww base-ww) 2.0))
        read-x (+ x (/ (- ww reading-ww) 2.0))]
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
  left-to-right *visual* order on the page via [[reorder-bidi-items]]."
  [^PDPageContentStream cs x content-w rtl? baseline items]
  (reduce #(draw-md-item! cs %1 baseline %2)
          ;; Starting `x` depends on `rtl?`: flush left for LTR, or inset from left to make the line flush right.
          (if rtl?
            (+ (double x)
               (max 0.0 (- (double content-w)
                           (md-line-width items))))
            (double x))
          (reorder-bidi-items items)))

(defn- draw-item-lines!
  "Draw already-wrapped `lines` (each a vector of measured items) top-down from `top-y`, laying each out within
  `[content-x, content-x+content-w]` and stopping before `bottom`. `rtl?` right-aligns. On the first line, `marker`
  (if non-nil) is drawn at `marker-x` in `marker-font`.

  Note that `y` decreases downwards in PDFs; reversed from the convention on the web.

  Returns the y just below the last line actually drawn. Shared by [[draw-block!]] and [[draw-text-block!]]."
  [^PDPageContentStream cs lines content-x content-w top-y bottom base-pt rtl? marker marker-x marker-font]
  (let [lh (* base-pt line-height-factor)]
    (when marker
      (draw-line! cs marker-font base-pt marker-x (- top-y base-pt) marker))
    (reduce (fn [y line]
              ;; lines with furigana need extra space above the base for the reading; lower the baseline
              ;; into that band and grow the line advance to match.
              (let [extra    (line-extra line base-pt)
                    baseline (- y extra base-pt)
                    adv      (+ lh extra)
                    y'       (- y adv)]
                (when (>= y' bottom)
                  (draw-md-line! cs content-x content-w rtl? baseline line))
                y'))
            (double top-y)
            lines)))

(def ^:private face-id->style
  "Inverse of [[run-font]]: the run style that selects each face. Lets plain text drawn with an explicit face be
  expressed as a single styled run and fed through the shared item pipeline."
  {:regular     {}
   :bold        {:bold? true}
   :italic      {:italic? true}
   :bold-italic {:bold? true, :italic? true}
   :mono        {:code? true}})

(defn- draw-text-block!
  "Draw wrapped plain `text` top-aligned within `[x, top-y]`, bounded by `max-w`/`max-h`. Right-to-left
  text (Arabic/Hebrew) is flush-right within `max-w`; everything else is flush-left. When `color` is
  given, every run is forced to it (otherwise the face's natural colour is used).

  Returns the vertical points consumed.

  This expresses the text as a single styled run and reuses the shared Markdown layout/draw pipeline
  ([[words->lines]] + [[draw-item-lines!]]) so there is one wrapping/measuring/drawing path for all text."
  [^PDPageContentStream cs face font-pt ^Color color x top-y max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [runs  [(merge {:text (str text)}
                        (get face-id->style (:id face)))]
          lines (into [] (if-not color
                           identity
                           (map (fn [line]
                                  (mapv #(assoc % :color color) line))))
                      (words->lines (runs->words runs) font-pt false max-w))
          y     (draw-item-lines! cs lines x max-w top-y (- (double top-y) max-h)
                                  font-pt (base-rtl? text) nil x nil)]
      (- (double top-y) y))))

(defn- draw-code-block!
  "Draws a monospaced code block.

  Returns the `y` below the block. Restores the font and color."
  [^PDPageContentStream cs block x top-y _cell-w _bottom scale]
  (.setNonStrokingColor cs ^Color code-color)
  (let [font (face :mono)
        pt   (* 9.0 scale)
        lh   (* pt line-height-factor)
        y    (reduce (fn [y line]
                       (draw-line! cs font pt (+ x 4.0) (- y pt) line)
                       (- y lh))
                     (double top-y)
                     (str/split-lines (str (:text block))))]
    (.setNonStrokingColor cs Color/BLACK)
    (- y 2.0)))

(defn- inner-draw-image!
  "Inner function to draw an image from a Markdown doc into the PDF. Call [[draw-image-block!]] instead.

  Returns the y below the block."
  [^PDImageXObject img ^PDPageContentStream cs x top-y cell-w bottom]
  (let [iw              (double (.getWidth img))
        ih              (double (.getHeight img))
        avail-h         (- (double top-y) bottom)
        draw-w          cell-w
        draw-h          (* draw-w (/ ih iw))
        [draw-w draw-h] (if (> draw-h avail-h)
                          [(* avail-h (/ iw ih)) avail-h]
                          [draw-w draw-h])
        y               (- (double top-y) draw-h)]
    (.drawImage cs img (float x) (float y) (float draw-w) (float draw-h))
    (- y 4.0)))

(defn- inner-draw-image-fallback!
  "Inner function to draw the fallback when a Markdown image failed to fetch. Call [[draw-image-block!]] instead.

  Returns the y below the block."
  [^PDPageContentStream cs {:keys [alt src] :as _block} x top-y cell-w bottom scale]
  (let [pt   (* text-card-pt scale)
        txt  (if (str/blank? alt) src alt)
        used (draw-text-block! cs (face :regular) pt link-color x top-y cell-w
                               (- (double top-y) bottom) txt)]
    (when (and *link-rects* (clickable-href? src))
      (swap! *link-rects* conj {:x0   (double x)
                                :y0   (- (double top-y) used)
                                :x1   (+ (double x) cell-w)
                                :y1   (double top-y)
                                :href src}))
    (- (double top-y) used 4.0)))

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
  (let [y (- (double top-y)
             (* 5.0 scale))]
    (doto cs
      (.setStrokingColor ^Color body-color)
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
                               (heading-pt level)
                               text-card-pt))
        indent-x    (+ (double x)
                       (* 14.0 (long (or indent 0))))
        ;; markers ("- ", "1. ") are ASCII; keep their trailing space (sanitize would trim it)
        marker-font (face :regular)
        marker-w    (if marker
                      (text-width marker-font base-pt marker)
                      0.0)
        content-x   (+ indent-x marker-w)
        content-w   (- (+ (double x) cell-w) content-x)
        ;; right-align RTL paragraphs and headings; list items (those with a marker) stay
        ;; left-aligned for now -- proper RTL lists (marker on the right) are a separate change.
        rtl?        (and (nil? marker)
                         (base-rtl? (apply str (map item-text runs))))
        lines       (words->lines (runs->words runs) base-pt heading? content-w)]
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

  Shrinks the font (down to a floor, see [[fit-scale]]) so the content fits the cell height instead of clipping.
  If it doesn't fit even at the limit of scaling down, we do clip the output."
  [^PDDocument doc ^PDPageContentStream cs x top-y cell-w cell-h text]
  (let [blocks (md/parse-markdown-blocks text)
        scale  (fit-scale blocks cell-w cell-h)
        bottom (- (double top-y) cell-h)]
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
  "Stateful transducer for greedily packing input *cells* (sorted, row-normalized dashboard contents) into pages of
  `total-rows` usable rows.

  The first page of the section reserves `first-header-rows` for the dashboard/tab heading; continuation pages
  reserve none. A card that won't fit in the current page's remaining rows starts a new page; we never split a card
  across pages. Each page records its `:base` row so cells can be positioned relative to the top of the page's card
  area."
  [total-rows first-header-rows]
  (let [first? (volatile! true)]
    (segment
     (fn
       ([c]                                     ; open a page
        (let [hr (if @first? first-header-rows 0)]
          (vreset! first? false)
          {:base        (:row c)
           :cards       [c]
           :header-rows hr}))
       ([{:keys [base header-rows] :as page} c] ; add this cell, or start a new page
        (let [cbot (+ (:row c) (:size_y c))]
          (if (<= (- cbot base)
                  (- total-rows header-rows))
            (update page :cards conj c)
            ::reject)))))))

(defn- pages-for-section
  "Produce positioned pages for one section (a tab, or the whole untabbed dashboard). `idx` is the section's index;
  only the very first section's first page carries the dashboard title, and (when tabbed) every section's first page
  carries the tab title."
  [section idx {:keys [unit rows]} tabbed? dash-name param-table param-rows]
  (let [dash-rows (rows-for-pt (header-block-pt dashboard-title-pt) unit)
        tab-rows  (rows-for-pt (header-block-pt tab-title-pt)       unit)
        ;; the parameter table shows once, on the dashboard's very first page (section 0)
        first-hdr (cond-> 0
                    (zero? idx) (+ dash-rows param-rows)
                    tabbed?     (+ tab-rows))]
    (into [] (comp (paginate rows first-hdr)
                   (map-indexed
                    (fn [pi page]
                      (merge page
                             (when (and (zero? idx)
                                        (zero? pi))
                               {:dashboard-title dash-name
                                :param-table     param-table})
                             (when (and tabbed? (zero? pi))
                               {:tab-name section})))))
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
  (let [iw    (double (.getWidth img))
        ih    (double (.getHeight img))
        scale (min (/ cell-w iw) (/ cell-h ih))
        dw    (* iw scale)
        dh    (* ih scale)
        dx    (+ x (/ (- cell-w dw)
                      2.0))]
    (.drawImage cs img (float dx) (float (- top-y dh)) (float dw) (float dh))))

(defn- pt->px [pt]
  (-> pt double (* dpi) (/ 72.0) Math/round long))

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
  (so it fills it the way the frontend does), rasterized at [[chart-supersample]] times that pixel size for crispness.

  Used for rectangular charts and for square/wide pies (which then place their legend to the side).

  Returns nil if the chart doesn't produce an SVG."
  ^bytes [card dashcard data w-px h-px]
  (binding [js.svg/*chart-size* {:width  w-px
                                 :height h-px
                                 :scale  chart-supersample}]
    (let [viz                    (or (:visualization_settings dashcard)
                                     (:visualization_settings card))
          {:keys [content type]} (js.svg/*javascript-visualization* (cards-with-data card dashcard data) viz)]
      (when (= :svg type)
        (js.svg/svg-string->bytes content)))))

(defn- text-block-height
  "Vertical points a wrapped text block would consume (without drawing), bounded by `max-h`.

  Uses the same single-styled-run item pipeline as [[draw-text-block!]]."
  [face font-pt max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [lh    (* font-pt line-height-factor)
          runs  [(merge {:text (str text)}
                        (get face-id->style (:id face)))]
          lines (words->lines (runs->words runs) font-pt false max-w)
          fit   (-> (/ max-h lh) double Math/floor long (max 0))]
      (min (lines-height lines font-pt)
           (* fit lh)))))

;; --------------------------------------------------------------------------------------------
;; Parameters. The dashboard's active filter values are shown once at the very top, as a two-column
;; (name | value) table (like the email filter bar). A card's *inline* parameters render on the card
;; itself, flowing inline as `Name: value`. Both reuse the common text layout/draw pipeline; the only
;; bespoke piece is sizing the table's name column (see [[min-column-width]]).
;; --------------------------------------------------------------------------------------------

(defn- min-column-width
  "The narrowest width (<= `max-w`) at which `units` still pack into the *fewest* lines they would take at `max-w`.

  This is the *bottleneck* variant of word-wrap: given that at least N lines are required, minimise the max width
  for that fixed line count. We solve it by binary search using the greedy [[pack-units->lines]] as a monotonic
  feasibility oracle. (Monotonic because a wider column never needs more lines.)

  The search bottoms out at the widest single unit (= word).

  Inexpensive -- a handful of greedy line wrap calls, with each unit's measurements cached (see [[*em-width*]])."
  [units max-w split-fn]
  (if (empty? units)
    0.0
    (let [lines-at (fn [w] (count (pack-units->lines units w split-fn)))
          target   (lines-at max-w)
          lo0      (transduce (map :ww) max 0.0 units)]
      (loop [lo lo0
             hi (double max-w)]
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
           {:name  (str (:name p))
            :value v}))))

(defn- dashboard-param-entries
  "Entries for the dashboard-wide filter table: only top-level (non-inline) parameters. Inline
  parameters render on their own card instead."
  [params inline-ids]
  (param-entries (remove #(contains? inline-ids (:id %)) params)))

(defn- styled-run-lines
  "Wrap a single styled run (`text` with `style`, e.g. {:bold? true} or {:color ...}) to `max-w` at `param-pt`,
  returning drawable item-lines via the shared pipeline."
  [text style max-w]
  (-> [(merge {:text (str text)}
              style)]
      runs->words
      (words->lines param-pt false max-w)))

(defn- measured-name-units
  "Pre-measured word items for a parameter name (bold, `param-pt`) -- input to [[min-column-width]].
  Runs through the same words pipeline as everything else, as a single run of bold text."
  [name]
  (mapv #(->measured-item % param-pt false)
        (runs->words [{:text  (normalize-ws name)
                       :bold? true}])))

(defn- layout-param-table
  "Lay out filter `entries` as a two-column (name | value) table within `avail-w` starting at `x`.

  The names column is sized by [[min-column-width]] (capped at 40% of `avail-w`); the rest goes to values.
  The columns swap (values left, names right) when the first parameter's name reads right-to-left.

  Returns nil when there are no valued parameters, else a layout map with the column geometry, the wrapped lines
  per row, and the total `:height`."
  [entries avail-w x]
  (when (seq entries)
    (let [rtl?     (base-rtl? (:name (first entries)))
          max-nw   (* 0.4 avail-w)
          name-w   (min max-nw (transduce (map #(min-column-width (measured-name-units (:name %))
                                                                  max-nw split-word-into-chars))
                                          max 0.0 entries))
          value-w  (- avail-w name-w param-chip-gap)
          name-x   (cond-> (double x)
                     rtl? (+ value-w param-chip-gap))
          value-x  (cond-> (double x)
                     (not rtl?) (+ name-w param-chip-gap))
          rows     (mapv (fn [{:keys [name value]}]
                           (let [nl (styled-run-lines name  {:bold? true}       name-w)
                                 vl (styled-run-lines value {:color body-color} value-w)]
                             {:name-lines  nl
                              :value-lines vl
                              :height      (max (lines-height nl param-pt)
                                                (lines-height vl param-pt))}))
                         entries)]
      {:name-x  name-x  :name-w  name-w
       :value-x value-x :value-w value-w
       :rows    rows
       :height  (transduce (map :height) + 0.0 rows)})))

(defn- param-table-rows
  "Whole grid rows the parameter table consumes (0 when there is none)."
  [table unit]
  (if table
    (rows-for-pt (+ (:height table)
                    header-pad-pt)
                 unit)
    0))

(defn- lines-rtl?
  "Given a seq of lines, check if the first line starts with RTL characters."
  [lines]
  (-> lines ffirst :text (or "") base-rtl?))

(defn- draw-param-table!
  "Draw the parameter `table` from `top-y` (the columns already hold absolute x positions).

  Returns the y below it."
  [^PDPageContentStream cs table top-y]
  (let [{:keys [name-x name-w value-x value-w rows]} table]
    (- (reduce (fn [y {:keys [name-lines value-lines height] :as _row}]
                 (let [bottom (- y height 1.0)]
                   (draw-item-lines! cs name-lines name-x name-w y bottom param-pt
                                     (lines-rtl? name-lines) nil name-x nil)
                   (draw-item-lines! cs value-lines value-x value-w y bottom param-pt
                                     (lines-rtl? value-lines) nil value-x nil)
                   (- y height)))
               (double top-y)
               rows)
       4.0)))

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
                                               {:text (:value e) :color body-color}])))
                       cat)
              entries)
        runs->words
        (words->lines param-pt false cell-w))))

(defn- inline-params-height
  "Vertical points a card's inline parameter lines consume (0 when there are none)."
  [lines]
  (if (empty? lines)
    0.0
    (+ 4.0 (lines-height lines param-pt))))

(defn- draw-inline-params!
  "Draw inline-parameter `lines` from `top-y` within `[x, x+content-w]`."
  [^PDPageContentStream cs lines x content-w top-y]
  (when (seq lines)
    (draw-item-lines! cs lines x content-w top-y (- (double top-y)
                                                    (lines-height lines param-pt)
                                                    1.0)
                      param-pt (lines-rtl? lines) nil x nil)))

(defn- fill-rect!
  "Fill the box whose top-left is `[x, top-y]` (and is `w` x `h`) with `color`, then reset to black.
  Used for the [[*debug-boxes*]] overlays drawn behind content."
  [^PDPageContentStream cs ^Color color x top-y w h]
  (.setNonStrokingColor cs color)
  (.addRect cs (float x) (float (- top-y h)) (float w) (float h))
  (.fill cs)
  (.setNonStrokingColor cs Color/BLACK))

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
        title-h    (text-block-height (face :bold) chart-title-pt cell-w (* 0.5 cell-h) title)
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
                            (>= cell-w body-h)))]
    ;; Debug overlays (drawn first, so content sits on top): the full title box (blue) and the full
    ;; chart-body box (red) -- the *allocated* space, regardless of how much the content fills.
    (when *debug-boxes*
      (when (pos? title-h)  (fill-rect! cs debug-heading-color x top-y cell-w title-h))
      (when (> body-h 12.0) (fill-rect! cs debug-chart-color x body-top cell-w body-h)))
    ;; Native title for every card type.
    (draw-text-block! cs (face :bold) chart-title-pt nil x top-y cell-w (* 0.5 cell-h) title)
    ;; Inline parameters.
    (when (seq ip-lines)
      (draw-inline-params! cs ip-lines x cell-w (- top-y title-h)))
    (when (> body-h 12.0)
      ;; in debug mode render charts transparently, so the red box behind them shows through the
      ;; whitespace ECharts/visx leave inside the image.
      (binding [js.svg/*svg-background-color* (when-not *debug-boxes*
                                                js.svg/*svg-background-color*)]
        (if-let [png (when fill?
                       (sized-chart-png card dashcard data (pt->px cell-w) (pt->px body-h)))]
          ;; Rendered at exactly cell-w x body-h px -> draw to fill the body area exactly.
          (.drawImage cs (PDImageXObject/createFromByteArray doc png "chart")
                      (float x) (float (- body-top body-h))
                      (float cell-w) (float body-h))
          ;; Fallback: title-less body PNG, fit preserving aspect into the body area
          (when-let [body (card-body-png timezone part (-> cell-w pt->px (min 2200) (max 240) long))]
            (draw-image-in-cell! cs (PDImageXObject/createFromByteArray doc body "card")
                                 x body-top cell-w body-h)))))))

(defn- line-start-x
  "Start x for drawing a single line of `text` (measured with `face`/`font-pt`) within the box
  `[x, x+box-w]`: flush-right when the text's base direction is RTL, flush-left otherwise."
  [face font-pt x box-w ^String text]
  (cond-> (double x)
    (base-rtl? text) (+ (max 0.0 (- box-w (text-width face font-pt text))))))

;; --------------------------------------------------------------------------------------------
;; "Made with Metabase" branding badge -- drawn top-right of every page. The logo + "Metabase"
;; wordmark come from an SVG whose glyphs are already `<path>` outlines, streamed into the content
;; stream as moveTo/lineTo/curveTo/fill so they stay crisp at any zoom. The "Made with" prefix is
;; ordinary text in the regular body face (Lato, with the usual per-glyph Noto/CJK fallback -- see
;; [[load-fonts!]] and [[font-runs]]). The badge sits in the empty top margin band, so it never
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
        scale (/ (double h) vh)
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
  `logo-top` (placed in the page's top margin band). The 'Made with' prefix is localized to the
  current user's locale ([[tru]]) and drawn in the regular body face -- Lato, with the usual
  per-glyph Noto/CJK fallback (see [[font-runs]]) -- so it renders across scripts; the logo +
  'Metabase' wordmark are locale-independent SVG vectors."
  [^PDPageContentStream cs right logo-top]
  (let [{:keys [vw vh]} @brand-logo
        text-face (face :regular)
        prefix    (str (tru "Made with"))
        logo-w    (* brand-logo-pt (/ (double vw) (double vh)))
        text-w    (text-width text-face brand-text-pt prefix)
        logo-x    (- (double right) logo-w)
        text-x    (- logo-x brand-gap-pt text-w)
        ;; vertically center the text's cap (~0.7*pt tall) on the logo's middle
        baseline  (- (double logo-top) (/ brand-logo-pt 2.0) (* brand-text-pt 0.35))]
    (.setNonStrokingColor cs brand-text-color)
    (draw-line! cs text-face brand-text-pt text-x baseline prefix)
    (.setNonStrokingColor cs Color/BLACK)
    (draw-brand-logo! cs logo-x logo-top brand-logo-pt)))

(defn- draw-header!
  [^PDPageContentStream cs page-height content-w {:keys [dashboard-title tab-title param-table]}]
  (let [bold (face :bold)
        top  (- (double page-height) margin)
        ;; "Made with Metabase" badge, vector-drawn in the empty top margin band, right-aligned
        _    (draw-brand-badge! cs (+ margin content-w)
                                (- (double page-height)
                                   (/ (- margin brand-logo-pt)
                                      2.0)))
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
    (draw-content! (- (double cell-h) iph))
    (when (seq ip-lines)
      (draw-inline-params! cs ip-lines x cell-w (- (double top-y)
                                                   (- (double cell-h) iph))))))

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
                cell-h (min (- top-y margin)
                            (- (* (:size_y cell) unit)
                               (if text?
                                 half
                                 gutter-pt)))]
            (try
              ;; debug overlay: the full heading-card cell (blue), drawn behind its text
              (when (and *debug-boxes*
                         (= :heading (:kind cell)))
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
           tabbed?  (boolean (seq tabs))
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
         (binding [*fonts*       (load-fonts! doc)
                   *em-width*    (memo/memo raw-em-width-inner)]
           (let [content-w   (* grid-cols (:unit dims))
                 inline-ids  (into #{} (mapcat :inline_parameters) dcs)
                 param-table (layout-param-table (dashboard-param-entries resolved inline-ids) content-w margin)
                 param-rows  (param-table-rows param-table (:unit dims))]
             (doseq [[idx section] (m/indexed sections)
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
  (binding [*debug-boxes* true]
    (render-dashboard-to-pdf-file 1 1 {} "/tmp/dash-debug2.pdf")))
