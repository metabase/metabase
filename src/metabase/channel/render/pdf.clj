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

  Native text (titles, text cards, descriptions) is drawn with embedded Noto Sans fonts (via
  `PDType0Font`), with per-glyph font fallback (see `font-runs`), so it renders Unicode: Latin,
  Cyrillic, Greek, and CJK (Japanese/Korean/Chinese, via Noto Sans CJK). Mixed-script text picks
  the right font per character; CJK has no italic, so italic CJK falls back to upright. Shaping
  scripts (Arabic, Indic, Thai) are not yet supported and their characters render as `?`.

  Note on size: all faces are TrueType (glyf), which PDFBox subsets at save -- so PDFs only carry
  the glyphs actually used and stay small even when CJK text is present.

  Prototype limitations: link/iframe/placeholder virtual cards are skipped; a card taller than a
  full page is scaled down to fit."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.channel.render.card :as render.card]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.parameters.shared :as shared.params]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.google.common.net InetAddresses)
   (com.vladsch.flexmark.ast AutoLink BlockQuote BulletList Code Emphasis FencedCodeBlock
                             HardLineBreak Heading Image IndentedCodeBlock Link MailLink OrderedList
                             Paragraph SoftLineBreak StrongEmphasis Text ThematicBreak)
   (com.vladsch.flexmark.ext.autolink AutolinkExtension)
   (com.vladsch.flexmark.parser Parser)
   (com.vladsch.flexmark.util.ast Node)
   (com.vladsch.flexmark.util.data MutableDataSet)
   (java.awt Color)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream InputStream)
   (java.net Inet6Address InetAddress URL)
   (javax.imageio ImageIO ImageReader)
   (org.apache.fontbox.ttf CmapLookup TrueTypeFont TTFParser)
   (org.apache.http.conn DnsResolver)
   (org.apache.http.impl.conn SystemDefaultDnsResolver)
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
(def ^:private chart-desc-pt 9.0)
(def ^:private param-pt 9.5)
(def ^:private param-chip-gap 16.0)
(def ^:private line-height-factor 1.3)
(def ^:private ruby-scale
  "Furigana (ruby) reading font size as a fraction of the base text size; the reading is drawn
  centered above the base, e.g. {kanji|reading}."
  0.55)
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

;; --------------------------------------------------------------------------------------------
;; Fonts -- embedded Noto Sans (TrueType, via PDType0Font) so we can render Unicode (Latin,
;; Cyrillic, Greek, ...) rather than the ASCII-only Standard-14 fonts. PDType0Fonts are tied to a
;; specific PDDocument, so we load a registry once per render and bind it to `*fonts*`.
;; --------------------------------------------------------------------------------------------

(def ^:private physical-font-resources
  "Physical font keyword -> classpath resource. All TrueType (glyf), so PDFBox can subset them and
  the output PDF only carries the glyphs actually used. Noto Sans covers Latin/Cyrillic/Greek; the
  per-region Noto Sans JP/KR/SC faces (static instances of the variable Google Fonts) cover
  Japanese/Korean/Simplified-Chinese."
  {:noto-regular     "fonts/pdf/NotoSans-Regular.ttf"
   :noto-bold        "fonts/pdf/NotoSans-Bold.ttf"
   :noto-italic      "fonts/pdf/NotoSans-Italic.ttf"
   :noto-bold-italic "fonts/pdf/NotoSans-BoldItalic.ttf"
   :noto-mono        "fonts/pdf/NotoSansMono-Regular.ttf"
   :jp-regular       "fonts/pdf/NotoSansJP-Regular.ttf"
   :jp-bold          "fonts/pdf/NotoSansJP-Bold.ttf"
   :kr-regular       "fonts/pdf/NotoSansKR-Regular.ttf"
   :kr-bold          "fonts/pdf/NotoSansKR-Bold.ttf"
   :sc-regular       "fonts/pdf/NotoSansSC-Regular.ttf"
   :sc-bold          "fonts/pdf/NotoSansSC-Bold.ttf"})

(def ^:dynamic *fonts*
  "Per-document map of face-keyword -> `{:primary <phys> :fallbacks [<phys> ...]}`, where each
  `<phys>` is `{:font <PDType0Font> :cmap <CmapLookup>}`. Bound while a document is being rendered
  (PDType0Fonts are tied to a specific PDDocument; see [[load-fonts!]]). Latin keeps the Noto Sans
  look across all styles; the CJK regional faces are ordered fallbacks so mixed English/Japanese
  text renders per-glyph from the right font (CJK has no italic, so italic CJK falls back to the
  upright CJK face)."
  nil)

(defn- load-phys
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
  (let [phys  (into {} (map (fn [[k path]] [k (load-phys doc path)])) physical-font-resources)
        face* (fn [primary & fallbacks] {:primary (phys primary) :fallbacks (mapv phys fallbacks)})]
    {:regular     (face* :noto-regular     :jp-regular :kr-regular :sc-regular)
     :bold        (face* :noto-bold        :jp-bold    :kr-bold    :sc-bold)
     :italic      (face* :noto-italic      :jp-regular :kr-regular :sc-regular)
     :bold-italic (face* :noto-bold-italic :jp-bold    :kr-bold    :sc-bold)
     :mono        (face* :noto-mono        :jp-regular :kr-regular :sc-regular)}))

(defn- face [k] (get *fonts* k))
(defn- bold-font [] (face :bold))
(defn- regular-font [] (face :regular))

(defn- covers? [phys cp] (pos? (.getGlyphId ^CmapLookup (:cmap phys) (int cp))))

(defn- normalize-ws
  "Turn tabs/newlines/other control chars into spaces (PDFBox `showText` can't take them)."
  ^String [s]
  (let [s (str s), n (.length s), sb (StringBuilder. n)]
    (loop [i 0]
      (when (< i n)
        (let [cp (.codePointAt s i)]
          (.appendCodePoint sb (if (< cp 32) (int \space) cp))
          (recur (+ i (Character/charCount cp))))))
    (.toString sb)))

(defn- font-runs
  "Split `s` into maximal `[phys ^String chunk]` runs, choosing for each codepoint the face's
  primary font if it has the glyph, else the first fallback that does, else the primary with the
  codepoint replaced by `?` (so `showText` never throws)."
  [face ^String s]
  (let [primary  (:primary face)
        fallbacks (:fallbacks face)
        pick     (fn [cp] (or (when (covers? primary cp) primary)
                              (some #(when (covers? % cp) %) fallbacks)))
        n        (.length s)]
    (loop [i 0, cur nil, ^StringBuilder sb nil, out (transient [])]
      (if (>= i n)
        (persistent! (cond-> out (some? cur) (conj! [cur (.toString sb)])))
        (let [cp   (.codePointAt s i)
              phys (or (pick cp) primary)
              ch   (if (pick cp) cp (int \?))]
          (if (identical? phys cur)
            (do (.appendCodePoint sb ch)
                (recur (+ i (Character/charCount cp)) cur sb out))
            (let [out (cond-> out (some? cur) (conj! [cur (.toString sb)]))
                  sb2 (doto (StringBuilder.) (.appendCodePoint ch))]
              (recur (+ i (Character/charCount cp)) phys sb2 out))))))))

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

(defn- text-width
  "Width in points of `s` drawn with `face` at `font-pt`, summed across per-glyph font runs."
  [face font-pt ^String s]
  (transduce (map (fn [[phys ^String chunk]]
                    (* font-pt (/ (.getStringWidth ^PDFont (:font phys) chunk) 1000.0))))
             + 0.0
             (font-runs face (normalize-ws s))))

(defn- cjk-char?
  "Codepoints from scripts that don't use spaces between words (CJK ideographs, kana, hangul, and
  CJK punctuation/fullwidth forms). Line breaks are allowed between adjacent such characters."
  [cp]
  (or (<= 0x2E80 cp 0x2FFF)   ; CJK radicals, Kangxi
      (<= 0x3000 cp 0x303F)   ; CJK symbols & punctuation
      (<= 0x3040 cp 0x30FF)   ; hiragana + katakana
      (<= 0x3400 cp 0x4DBF)   ; CJK ext A
      (<= 0x4E00 cp 0x9FFF)   ; CJK unified ideographs
      (<= 0xAC00 cp 0xD7A3)   ; hangul syllables
      (<= 0xF900 cp 0xFAFF)   ; CJK compat ideographs
      (<= 0xFF00 cp 0xFFEF))) ; halfwidth & fullwidth forms

(def ^:private no-break-before-chars
  "CJK characters that must not start a line (closing punctuation, small kana); they attach to the
  previous break unit (a simplified kinsoku rule)."
  (set "、。，．・：；！？）］｝」』】〕〉》〜ー…ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ"))

(defn- tokenize-units
  "Append break-unit tokens for `text` to `out`: each unit is `(assoc base :text … :space-before? …)`.
  Whitespace collapses into break/space opportunities; CJK characters become individual units (a
  line may break between any two), while runs of non-CJK characters stay together as words.
  No-break-before punctuation attaches to the previous unit. Returns `[out' pending']`."
  [^String text base pending out]
  (let [n (.length text)]
    (loop [i 0, pending pending, ^StringBuilder buf (StringBuilder.), buf-sb pending, out out]
      (let [flush (fn [out] (if (pos? (.length buf))
                              (conj out (assoc base :text (.toString buf) :space-before? buf-sb))
                              out))]
        (if (>= i n)
          [(flush out) pending]
          (let [cp (.codePointAt text i)
                w  (Character/charCount cp)]
            (cond
              (Character/isWhitespace cp)
              (recur (+ i w) true (StringBuilder.) true (flush out))

              (cjk-char? cp)
              (let [out  (flush out)
                    cs   (String. (Character/toChars cp))
                    prev (peek out)]
                (if (and (contains? no-break-before-chars (char cp)) (some? prev) (:text prev))
                  (recur (+ i w) false (StringBuilder.) false
                         (conj (pop out) (update prev :text str cs)))
                  (recur (+ i w) false (StringBuilder.) false
                         (conj out (assoc base :text cs :space-before? pending)))))

              :else
              (let [buf-sb (if (zero? (.length buf)) pending buf-sb)]
                (.appendCodePoint buf cp)
                (recur (+ i w) false buf buf-sb out)))))))))

(defn- split-into-chars
  "Split a unit's text into one unit per codepoint (only the first keeps `:space-before?`). Used to
  hard-break a single token that is itself wider than the whole line."
  [unit]
  (let [cps (vec (.toArray (.codePoints ^String (:text unit))))]
    (map-indexed (fn [i cp] (assoc unit
                                   :text (String. (Character/toChars (int cp)))
                                   :space-before? (and (zero? i) (boolean (:space-before? unit)))))
                 cps)))

(defn- wrap-text
  "Greedy word-wrap `text` to fit `max-width` points at `font-pt` with `face`, breaking between
  words, between CJK characters, and -- for a single token wider than the line -- between any
  characters. Returns a vector of line strings."
  [face font-pt text max-width]
  (let [units (first (tokenize-units (normalize-ws text) {} false []))]
    (loop [us units, cur "", cur-w 0.0, lines []]
      (if (empty? us)
        (if (str/blank? cur) lines (conj lines cur))
        (let [u     (first us)
              sb?   (and (seq cur) (:space-before? u))
              piece (if sb? (str " " (:text u)) (:text u))
              w     (text-width face font-pt piece)]
          (cond
            (and (str/blank? cur)
                 (> (text-width face font-pt (:text u)) max-width)
                 (> (count (:text u)) 1))
            (recur (concat (split-into-chars u) (rest us)) cur cur-w lines)

            (and (seq cur) (> (+ cur-w w) max-width))
            (recur us "" 0.0 (conj lines cur))

            :else
            (recur (rest us) (str cur piece) (+ cur-w w) lines)))))))

(defn- wrap-clamped
  "Wrap text to at most `max-lines` lines. If it would need more, truncate the last kept line
  and append an ellipsis (trimming characters until `line...` fits `max-w`)."
  [face font-pt text max-w max-lines]
  (let [lines (wrap-text face font-pt text max-w)]
    (cond
      (<= max-lines 0)          []
      (<= (count lines) max-lines) lines
      :else
      (let [kept     (vec (take max-lines lines))
            ellipsis "..."
            fitted   (loop [s (peek kept)]
                       (cond
                         (str/blank? s)                                      ellipsis
                         (<= (text-width face font-pt (str s ellipsis)) max-w) (str s ellipsis)
                         :else                                               (recur (subs s 0 (dec (count s))))))]
        (conj (pop kept) fitted)))))

(defn- draw-line!
  "Draw a single line of text with `face` at a baseline, switching physical font per glyph run so
  mixed-script text (e.g. English + Japanese) renders from the right font."
  [^PDPageContentStream cs face font-pt x baseline-y ^String text]
  (.beginText cs)
  (.newLineAtOffset cs (float x) (float baseline-y))
  (doseq [[phys ^String chunk] (font-runs face (normalize-ws text))]
    (.setFont cs ^PDFont (:font phys) (float font-pt))
    (.showText cs chunk))
  (.endText cs))

(defn- draw-lines!
  "Draw a seq of already-wrapped lines top-down from `top-y`, optionally in `color`."
  [^PDPageContentStream cs face font-pt ^Color color x top-y lines]
  (when color (.setNonStrokingColor cs color))
  (loop [ls lines, y (- (double top-y) font-pt)]
    (when (seq ls)
      (draw-line! cs face font-pt x y (first ls))
      (recur (rest ls) (- y (* font-pt line-height-factor)))))
  (when color (.setNonStrokingColor cs Color/BLACK)))

(defn- draw-text-block!
  "Draw wrapped text top-aligned within `[x, top-y]` bounded by `max-w`/`max-h`, optionally in
  `color` (reset to black afterward). Returns the vertical points consumed."
  [^PDPageContentStream cs face font-pt ^Color color x top-y max-w max-h text]
  (let [lh (* font-pt line-height-factor)]
    (when color (.setNonStrokingColor cs color))
    (let [used (loop [lines (if (str/blank? (str text)) [] (wrap-text face font-pt text max-w))
                      y     (- (double top-y) font-pt)
                      used  0.0]
                 (if (and (seq lines) (<= (+ used lh) max-h))
                   (do (draw-line! cs face font-pt x y (first lines))
                       (recur (rest lines) (- y lh) (+ used lh)))
                   used))]
      (when color (.setNonStrokingColor cs Color/BLACK))
      used)))

(defn- draw-text-in-cell!
  "Draw wrapped text top-aligned within a cell rectangle, clipping to the cell height."
  [^PDPageContentStream cs face font-pt x top-y cell-w cell-h text]
  (draw-text-block! cs face font-pt nil x top-y cell-w cell-h text))

;; --------------------------------------------------------------------------------------------
;; Markdown image fetching (SSRF-hardened). Markdown text cards can reference remote images, which
;; means fetching user-provided URLs server-side -- the classic SSRF risk. Defenses:
;;  - HTTPS only; reject IP-literal hosts and localhost/metadata/internal hostnames.
;;  - Validate every *resolved* IP is a public unicast address via a custom DnsResolver -- this
;;    runs inside the connection the client actually opens, closing the DNS-rebinding TOCTOU gap.
;;    It rejects loopback, link-local (incl. cloud metadata 169.254.169.254), site-local (RFC1918),
;;    any-local, multicast, IPv6 ULA (fc00::/7), and IPv4 CGNAT (100.64/10).
;;  - No redirects (a 3xx would be a bypass vector; here it just fails -> link fallback).
;;  - No cookies/credentials (a fresh clj-http GET carries no Metabase session).
;;  - Cap the download at 20 MB; only raster image content-types; check dimensions before decoding
;;    (decompression-bomb guard). Any failure returns nil and the caller renders a Markdown link.
;; --------------------------------------------------------------------------------------------

(def ^:private image-fetch-timeout-ms 8000)
(def ^:private image-max-bytes (* 20 1024 1024))
(def ^:private image-max-megapixels 24)
(def ^:private allowed-image-content-types #{"image/png" "image/jpeg" "image/gif"})
(def ^:private blocked-image-hosts #{"localhost" "metadata" "metadata.google.internal"})
(def ^:private blocked-image-host-suffixes [".localhost" ".local" ".internal" ".lan" ".home.arpa"])

(defn- public-address?
  "True only for globally-routable unicast addresses."
  [^InetAddress addr]
  (let [b (.getAddress addr)]
    (not (or (.isLoopbackAddress addr)
             (.isLinkLocalAddress addr)
             (.isSiteLocalAddress addr)
             (.isAnyLocalAddress addr)
             (.isMulticastAddress addr)
             (and (instance? Inet6Address addr)              ; IPv6 unique-local fc00::/7
                  (= 0xfc (bit-and (aget b 0) 0xfe)))
             (and (= 4 (alength b))                          ; IPv4 CGNAT 100.64.0.0/10
                  (= 100 (bit-and (aget b 0) 0xff))
                  (<= 64 (bit-and (aget b 1) 0xff) 127))))))

(def ^DnsResolver ^:private ssrf-safe-dns-resolver
  (let [system (SystemDefaultDnsResolver.)]
    (reify DnsResolver
      (^"[Ljava.net.InetAddress;" resolve [_ ^String host]
        (let [addrs (.resolve system host)]
          (if (every? public-address? addrs)
            addrs
            (throw (ex-info "Refusing to fetch from a non-public address" {:ssrf true}))))))))

(defn- safe-image-url?
  "HTTPS scheme, no userinfo, and a real DNS hostname (not an IP literal, not
  localhost/metadata/internal)."
  [^String url]
  (try
    (let [u    (URL. url)
          host (some-> (.getHost u) str/lower-case (str/replace #"^\[|\]$" ""))]
      (and (= "https" (str/lower-case (str (.getProtocol u))))
           (str/blank? (str (.getUserInfo u)))
           (not (str/blank? host))
           (boolean (re-find #"[a-z]" host))    ; a real hostname has a letter; blocks decimal/octal IP forms
           (not (InetAddresses/isInetAddress host))
           (not (contains? blocked-image-hosts host))
           (not (some #(str/ends-with? host %) blocked-image-host-suffixes))))
    (catch Throwable _ false)))

(defn- read-bounded
  "Read up to `max` bytes from `in`; returns the byte[] or nil if the stream exceeds `max`."
  ^bytes [^InputStream in max]
  (let [out (ByteArrayOutputStream.)
        buf (byte-array 8192)]
    (loop [total 0]
      (let [n (.read in buf)]
        (cond
          (neg? n)            (.toByteArray out)
          (> (+ total n) max) nil
          :else               (do (.write out buf 0 n) (recur (+ total n))))))))

(defn- fetch-image-bytes
  "SSRF-hardened GET of `url`. Returns image bytes with an allowed raster content-type, or nil."
  ^bytes [url]
  (when (safe-image-url? url)
    (try
      (let [resp  (http/get url {:as                 :stream
                                 :redirect-strategy  :none
                                 :socket-timeout     image-fetch-timeout-ms
                                 :connection-timeout image-fetch-timeout-ms
                                 :throw-exceptions   false
                                 :dns-resolver       ssrf-safe-dns-resolver})
            ctype (some-> (get-in resp [:headers :content-type])
                          (str/split #";") first str/trim str/lower-case)
            ^InputStream body (:body resp)]
        (try
          (when (and (= 200 (:status resp)) (contains? allowed-image-content-types ctype))
            (read-bounded body image-max-bytes))
          (finally (some-> body .close))))
      (catch Throwable _ nil))))

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
  "Fetch + decode a remote image URL into a `PDImageXObject`, or nil if anything fails."
  [^PDDocument doc url]
  (when-let [bytes (fetch-image-bytes url)]
    (decode-image doc bytes)))

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

(declare inline-runs)

(defn- parse-ruby
  "Split plain text into runs, turning `{base|reading}` furigana shorthand into ruby runs
  (`{:ruby? true :base … :reading …}`) and leaving the rest as ordinary text runs."
  [text style href]
  (let [s (str text)
        m (re-matcher #"\{([^{}|]+)\|([^{}|]+)\}" s)]
    (loop [last 0, out []]
      (if (.find m)
        (recur (.end m)
               (cond-> out
                 (< last (.start m)) (conj (assoc style :text (subs s last (.start m)) :href href))
                 true                (conj (assoc style :ruby? true :base (.group m 1)
                                                  :reading (.group m 2) :href href))))
        (cond-> out
          (< last (count s)) (conj (assoc style :text (subs s last) :href href)))))))

(defn- inline-node->runs
  "Convert a single inline node into styled runs. Images nested in inline content degrade to their
  alt text; top-level paragraph images are pulled out as `:image` blocks (see `paragraph->blocks`)."
  [^Node c style href]
  (condp instance? c
    Text           (parse-ruby (md-unescape (.getChars c)) style href)
    StrongEmphasis (inline-runs c (assoc style :bold? true) href)
    Emphasis       (inline-runs c (assoc style :italic? true) href)
    Code           [(assoc style :code? true :text (str (.getText ^Code c)) :href href)]
    Link           (inline-runs c style (str (.getUrl ^Link c)))
    AutoLink       (let [u (str (.getText ^AutoLink c))] [(assoc style :text u :href u)])
    MailLink       (let [u (str (.getText ^MailLink c))] [(assoc style :text u :href (str "mailto:" u))])
    Image          (let [alt (str (.getText ^Image c))]
                     [(assoc style :text (if (str/blank? alt) "[image]" alt)
                             :href (str (.getUrl ^Image c)))])
    SoftLineBreak  [{:text " " :space? true}]
    HardLineBreak  [{:break? true}]
    (if (.getFirstChild c)
      (inline-runs c style href)
      (parse-ruby (md-unescape (.getChars c)) style href))))

(defn- inline-runs
  "Flatten a block node's inline children into styled runs: each is `{:text :bold? :italic? :code?
  :href}`, plus `{:break? true}` for a hard line break."
  ([^Node node] (inline-runs node {} nil))
  ([^Node node style href]
   (vec (mapcat #(inline-node->runs % style href) (node-children node)))))

(defn- paragraph->blocks
  "A paragraph normally becomes one `:paragraph` block, but top-level images are pulled out as
  standalone `:image` blocks, interleaved with the surrounding text."
  [^Node node]
  (loop [children (node-children node), runs [], out []]
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
    Paragraph         (paragraph->blocks node)
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

(defn- run-font [{:keys [bold? italic? code?]}]
  (face (cond
          code?               :mono
          (and bold? italic?) :bold-italic
          bold?               :bold
          italic?             :italic
          :else               :regular)))

(defn- heading-pt [level]
  (case (long level) 1 15.0 2 13.5 3 12.0 11.5))

(defn- runs->words
  "Split runs into a flat seq of word tokens, each `{:text :style :space-before?}` (or
  `{:break? true}`), so that adjacent runs with no whitespace between them don't get a space."
  [runs]
  (loop [runs runs, pending false, out []]
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

(defn- words->lines
  "Greedily wrap `words` to `max-w`, resolving each word's font/color. Returns a vector of lines;
  each line is a vector of drawable items `{:text :font :pt :color :ww :sp :space-before?}`."
  [words base-pt heading? max-w]
  (loop [ws words, line [], line-w 0.0, lines []]
    (if (empty? ws)
      (if (seq line) (conj lines line) lines)
      (let [w (first ws)]
        (cond
          (:break? w)
          (recur (rest ws) [] 0.0 (conj lines line))

          ;; furigana group: base text with a smaller reading centered above; width is the wider of
          ;; the two, and the item is atomic (the reading must not wrap away from its base).
          (:ruby? w)
          (let [style      (:style w)
                font       (run-font (cond-> style heading? (assoc :bold? true)))
                ruby-pt    (* base-pt ruby-scale)
                bw         (text-width font base-pt (:base w))
                rw         (text-width font ruby-pt (:reading w))
                ww         (max bw rw)
                sp         (text-width font base-pt " ")
                color      (cond (:link? style) link-color (:code? style) code-color :else Color/BLACK)
                add-space? (boolean (and (seq line) (:space-before? w)))
                advance    (+ (if add-space? sp 0.0) ww)
                item       {:ruby? true :base (:base w) :reading (:reading w) :font font
                            :pt base-pt :ruby-pt ruby-pt :base-ww bw :reading-ww rw :color color
                            :href (:href style) :ww ww :sp sp :space-before? add-space?}]
            (if (and (seq line) (> (+ line-w advance) max-w))
              (recur ws [] 0.0 (conj lines line))
              (recur (rest ws) (conj line item) (+ line-w advance) lines)))

          :else
          (let [style      (:style w)
                font       (run-font (cond-> style heading? (assoc :bold? true)))
                txt        (:text w)
                ww         (text-width font base-pt txt)
                sp         (text-width font base-pt " ")
                color      (cond (:link? style) link-color (:code? style) code-color :else Color/BLACK)
                add-space? (boolean (and (seq line) (:space-before? w)))
                advance    (+ (if add-space? sp 0.0) ww)
                item       {:text txt :font font :pt base-pt :color color
                            :href (:href style) :ww ww :sp sp :space-before? add-space?}]
            (cond
              ;; a single token wider than the whole line -> hard-break into characters
              (and (empty? line) (> ww max-w) (> (count txt) 1))
              (recur (concat (split-into-chars w) (rest ws)) line line-w lines)

              (and (seq line) (> (+ line-w advance) max-w))
              (recur ws [] 0.0 (conj lines line))

              :else
              (recur (rest ws) (conj line item) (+ line-w advance) lines))))))))

(defn- line-extra
  "Extra vertical space a line needs above its base text -- the furigana band, if it has any ruby."
  [line base-pt]
  (if (some :ruby? line) (* base-pt ruby-scale 1.2) 0.0))

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
          marker-w (if marker (text-width (regular-font) base-pt marker) 0.0)
          content-w (- cell-w (* (long (or (:indent block) 0)) 14.0) marker-w)
          lines    (words->lines (runs->words (:runs block)) base-pt heading? content-w)
          lh       (* base-pt line-height-factor)]
      (reduce (fn [acc line] (+ acc lh (line-extra line base-pt))) 0.0 lines))))

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

(defn- draw-md-line!
  [^PDPageContentStream cs x baseline items]
  (loop [items items, cx (double x)]
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
  (.setNonStrokingColor cs Color/BLACK))

(defn- draw-code-block!
  [^PDPageContentStream cs block x top-y cell-w bottom scale]
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
          (.setStrokingColor cs ^Color desc-color)
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
                  (draw-line! cs marker-font base-pt indent-x baseline marker))
                (draw-md-line! cs content-x baseline (first lines))
                (recur (rest lines) (- y adv) false)))))))))

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

(defn- dashcard->cell
  "Build a renderable cell from a dashcard, preserving its grid geometry. Returns nil for
  dashcard kinds we don't render (iframe/placeholder/action) or cards that fail/are empty."
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

      ;; link cards render as a markdown `### [name](url)` text cell (clickable like any md link);
      ;; reuse the email conversion so they match, and so entity links are permission-checked.
      (notification.execute/virtual-card-of-type? dc "link")
      (when-let [part (notification.execute/dashcard-link-card->part dc)]
        (assoc geom :kind :text :text (:text part)))

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
  [section idx {:keys [unit rows]} tabbed? dash-name param-lines param-rows]
  (let [dash-rows (rows-for-pt (header-block-pt dashboard-title-pt) unit)
        tab-rows  (rows-for-pt (header-block-pt tab-title-pt) unit)
        ;; the parameter bar shows once, on the dashboard's very first page (section 0)
        first-hdr (+ (if (zero? idx) (+ dash-rows param-rows) 0)
                     (if tabbed? tab-rows 0))]
    (map-indexed
     (fn [pi pg]
       (assoc pg
              :dashboard-title (when (and (zero? idx) (zero? pi)) dash-name)
              :tab-title       (when (and tabbed? (zero? pi)) (:tab-name section))
              :param-lines     (when (and (zero? idx) (zero? pi)) param-lines)))
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
  [face font-pt max-w max-h text]
  (if (str/blank? (str text))
    0.0
    (let [lh    (* font-pt line-height-factor)
          lines (count (wrap-text face font-pt text max-w))
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

;; --------------------------------------------------------------------------------------------
;; Parameter bar -- the dashboard's active (non-inline) filter values, shown once at the very top
;; of the dashboard (like the email subscription filter bar). Chips flow and wrap across lines, so
;; dashboards with many parameters take however many rows they need.
;; --------------------------------------------------------------------------------------------

(defn- dashboard-param-chips
  "Build the parameter chips to show at the top of the dashboard: top-level (non-inline) parameters
  that have a value, formatted like the email filter bar via `value-string`. Each chip carries its
  measured widths for layout. Requires `*fonts*` bound."
  [params inline-ids]
  (let [locale (system/site-locale)
        sep-w  (text-width (regular-font) param-pt ": ")]
    (vec (for [p     params
               ;; only top-level (non-inline) parameters that actually have a value
               :when (and (not (contains? inline-ids (:id p))) (some? (:value p)))
               :let  [v (some-> (shared.params/value-string p locale) str str/trim)]
               :when (not (str/blank? v))
               :let  [nm (str (:name p))]]
           {:name nm :value v
            :name-w (text-width (bold-font) param-pt nm)
            :sep-w  sep-w
            :width  (+ (text-width (bold-font) param-pt nm) sep-w (text-width (regular-font) param-pt v))}))))

(defn- layout-param-chips
  "Greedily pack chips into lines fitting `content-w`, giving each an `:x` offset within the content
  area. Returns a vector of lines (each a vector of placed chips)."
  [chips content-w]
  (loop [chips chips, line [], line-w 0.0, lines []]
    (if (empty? chips)
      (cond-> lines (seq line) (conj line))
      (let [c   (first chips)
            gap (if (seq line) param-chip-gap 0.0)
            adv (+ gap (:width c))]
        (if (and (seq line) (> (+ line-w adv) content-w))
          (recur chips [] 0.0 (conj lines line))
          (recur (rest chips) (conj line (assoc c :x (+ line-w gap))) (+ line-w adv) lines))))))

(defn- param-lines-rows
  "Whole grid rows the parameter bar consumes (0 when there are no params)."
  [param-lines unit]
  (if (seq param-lines)
    (rows-for-pt (+ (* (count param-lines) (* param-pt line-height-factor)) header-pad-pt) unit)
    0))

(defn- draw-param-chip!
  [^PDPageContentStream cs x baseline {:keys [name value name-w sep-w]}]
  (draw-line! cs (bold-font) param-pt x baseline name)
  (draw-line! cs (regular-font) param-pt (+ x name-w) baseline ": ")
  (.setNonStrokingColor cs ^Color desc-color)
  (draw-line! cs (regular-font) param-pt (+ x name-w sep-w) baseline value)
  (.setNonStrokingColor cs Color/BLACK))

(defn- draw-param-lines!
  "Draw the parameter bar from `top-y`, returning the y below it."
  [^PDPageContentStream cs param-lines top-y]
  (loop [lines param-lines, y (double top-y)]
    (if (empty? lines)
      (- y 4.0)
      (do
        (doseq [chip (first lines)]
          (draw-param-chip! cs (+ margin (:x chip)) (- y param-pt) chip))
        (recur (rest lines) (- y (* param-pt line-height-factor)))))))

(defn- draw-header!
  [^PDPageContentStream cs page-height {:keys [dashboard-title tab-title param-lines]}]
  (let [bold (bold-font)
        top  (- (double page-height) margin)
        ;; order: dashboard title, then the dashboard-wide parameter bar, then the tab title
        y1   (if dashboard-title
               (do (draw-line! cs bold dashboard-title-pt margin (- top dashboard-title-pt) dashboard-title)
                   (- top (header-block-pt dashboard-title-pt)))
               top)
        y2   (if (seq param-lines)
               (draw-param-lines! cs param-lines y1)
               y1)]
    (when tab-title
      (draw-line! cs bold tab-title-pt margin (- y2 tab-title-pt) tab-title))))

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

(defn- render-page!
  [^PDDocument doc {:keys [^PDRectangle rect unit]} timezone page]
  (let [pg            (PDPage. rect)
        _             (.addPage doc pg)
        ph            (.getHeight rect)
        cs            (PDPageContentStream. doc pg)
        card-area-top (- ph margin (* (:header-rows page) unit))]
    (binding [*link-rects* (atom [])]
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
                :text    (draw-markdown-in-cell! doc cs x top-y cell-w cell-h (:text cell))
                nil)
              (catch Throwable e
                (log/error e "Error rendering dashboard PDF cell; substituting placeholder")
                (draw-text-in-cell! cs (regular-font) 10.0 x top-y cell-w cell-h "[Unable to render this card]")))))
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
         (binding [*fonts* (load-fonts! doc)]
           (let [content-w   (* grid-cols (:unit dims))
                 inline-ids  (into #{} (mapcat :inline_parameters) dcs)
                 param-lines (layout-param-chips (dashboard-param-chips resolved inline-ids) content-w)
                 param-rows  (param-lines-rows param-lines (:unit dims))]
             (doseq [[idx section] (map-indexed vector sections)
                     page          (pages-for-section section idx dims tabbed? (:name dash) param-lines param-rows)]
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
  (let [main-dash 1
        i18n-dash 18]
    (render-dashboard-to-pdf-file 18 1 {} "/tmp/dash13.pdf")))
