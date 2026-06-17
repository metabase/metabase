(ns metabase.channel.render.pdf.font
  "Low-level font handling for the backend dashboard->PDF renderer: the embedded-font registry, per-glyph
  font resolution across scripts, string measurement, and the script utilities (RTL shaping/reordering,
  CJK line-breaking).

  Fonts are embedded TrueType (via `PDType0Font`) so we can render Unicode (Latin, Cyrillic, Greek, CJK,
  Arabic, Hebrew, ...) rather than the ASCII-only Standard-14 fonts. `PDType0Font`s are tied to a specific
  `PDDocument`, so [[load-fonts!]] loads a registry once per render and it is bound to [[*fonts*]]."
  (:require
   [better-cond.core :as b]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m])
  (:import
   (com.ibm.icu.text ArabicShaping Bidi)
   (org.apache.fontbox.ttf CmapLookup TrueTypeFont TTFParser)
   (org.apache.pdfbox.io RandomAccessReadBuffer)
   (org.apache.pdfbox.pdmodel PDDocument)
   (org.apache.pdfbox.pdmodel.font PDFont PDType0Font)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; Registry
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
(defn load-fonts!
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

(defn face
  "The face map for face-keyword `k` (`:regular`, `:bold`, `:italic`, `:bold-italic`, `:mono`) in the
  current document's [[*fonts*]] registry."
  [k]
  (get *fonts* k))

(defn- covers?
  "Checks if a physical font can render a given codepoint `cp`."
  [phys cp]
  (pos? (.getGlyphId ^CmapLookup (:cmap phys) (int cp))))

;; --------------------------------------------------------------------------------------------
;; Script utilities -- RTL shaping/reordering and whitespace normalisation
;; --------------------------------------------------------------------------------------------

(defn normalize-ws
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

(defn contains-rtl?
  "True if `s` contains any character the bidi algorithm treats as right-to-left (e.g. Arabic, Hebrew).

  This allows the LTR-only common case skip all shaping/reordering work."
  [^String s]
  (let [chars (.toCharArray s)]
    (Bidi/requiresBidi chars 0 (alength chars))))

(defn base-rtl?
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

(defn visual-order
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

;; --------------------------------------------------------------------------------------------
;; Per-glyph font resolution
;; --------------------------------------------------------------------------------------------

(defn- cp-font
  "Given a face and a codepoint, returns the physical font with the best matching glyph for the given codepoint.

  Checks each of the `:fallbacks` in order. If none of the fonts has a glyph for this codepoint, returns nil."
  [{:keys [fallbacks] :as _face} cp]
  (m/find-first #(covers? % cp) fallbacks))

(defn font-runs
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

;; --------------------------------------------------------------------------------------------
;; Measurement
;; --------------------------------------------------------------------------------------------

(defn ^{:clojure.core.memoize/args-fn (fn [face ^String s]
                                        [(:id face) s])}
  raw-em-width-inner
  "Don't call this; use the memoized version [[*em-width*]]."
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
  recomputation. Bound in `render-dashboard-to-pdf` to the memoized version; defaults when unbound to the uncached
  inner function."
  raw-em-width-inner)

(defn text-width
  "Width in points of `s` drawn with `face` at `font-pt`. The per-glyph measurement lives in (cached) [[*em-width*]];
  this just scales it by the font size."
  ^double [face font-pt ^String s]
  (* (double font-pt) (*em-width* face s)))

;; --------------------------------------------------------------------------------------------
;; CJK line-breaking (kinsoku)
;; --------------------------------------------------------------------------------------------

(defn cjk-char?
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
  This is a simplified kinsoku rule.

  Spelled out as `\\uXXXX` escapes rather than literal glyphs so the source stays ASCII -- several of these
  forms trip the whitespace linter. Each line names the characters it encodes."
  (set (str ; punctuation: ideographic & fullwidth comma/full-stop, katakana middle dot
        "\u3001\u3002\uFF0C\uFF0E\u30FB"
            ; fullwidth colon, semicolon, exclamation, question mark
        "\uFF1A\uFF1B\uFF01\uFF1F"
            ; fullwidth right paren, square & curly brackets
        "\uFF09\uFF3D\uFF5D"
            ; right brackets: corner, white-corner, lenticular, tortoise-shell, angle, double-angle
        "\u300D\u300F\u3011\u3015\u3009\u300B"
            ; wave dash, prolonged sound mark, horizontal ellipsis
        "\u301C\u30FC\u2026"
            ; small hiragana: a i u e o tu ya yu yo wa
        "\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E"
            ; small katakana: a i u e o tu ya yu yo wa
        "\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE")))

(defn no-break-before?
  "True if `cp` is a CJK character that must not start a line (closing punctuation, small kana), so
  it sticks to the previous break-unit. A simplified kinsoku rule (see [[no-break-before-chars]])."
  [cp]
  (and (<= (int cp) 0xFFFF)
       (contains? no-break-before-chars (char cp))))
