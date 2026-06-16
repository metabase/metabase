(ns metabase.channel.render.pdf-test
  "Tests for backend dashboard->PDF rendering: the pure layout/text helpers (Markdown furigana,
  parameter chip wrapping, inline-parameter resolution, visualizer display resolution, and the
  right-to-left shaping/reordering/alignment for Arabic and Hebrew). Everything here is
  intentionally network-free (pure predicates and in-memory PDFs) so the suite is fast and not
  flaky. The SSRF-safe image-fetch defenses now live in `metabase.util.http` (see
  `metabase.util.http-test`)."
  (:require
   [clojure.core.memoize :as ccm]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.channel.render.pdf :as pdf]
   [metabase.channel.render.pdf.font :as font]
   [metabase.channel.render.pdf.typeset :as typeset]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util.memoize :as memo])
  (:import
   (java.awt Color)
   (java.awt.geom PathIterator Rectangle2D)
   (java.awt.image BufferedImage)
   (java.io ByteArrayOutputStream StringReader)
   (javax.imageio ImageIO)
   (org.apache.batik.parser AWTPathProducer)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.interactive.action PDActionURI)
   (org.apache.pdfbox.pdmodel.interactive.annotation PDAnnotationLink)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; Clickable links
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel clickable-href?-test
  (testing "absolute http/https/mailto links are clickable"
    (doseq [h ["https://example.com" "http://example.com/a?b=1" "HTTPS://EX.COM" "mailto:a@b.com"]]
      (is (true? (boolean (#'pdf/clickable-href? h))) (str h))))
  (testing "relative, scheme-less, and dangerous schemes are not clickable"
    (doseq [h ["/dashboard/5" "example.com" "javascript:alert(1)" "file:///etc/passwd" "ftp://x/y" "" nil]]
      (is (false? (boolean (#'pdf/clickable-href? h))) (str h)))))

;; not ^:parallel: exercises the real PDFBox rendering path (PDDocument + font loading + drawing),
;; which the deftest linter treats as side-effecting
(deftest link-annotations-test
  (testing "markdown links become PDF URI link annotations (http/https/mailto only)"
    (with-open [doc (PDDocument.)]
      (let [page (PDPage. PDRectangle/A4)]
        (.addPage doc page)
        (let [cs (PDPageContentStream. doc page)
              md "[docs](https://metabase.com) [mail](mailto:a@b.com) [rel](/x) [js](javascript:1)"]
          (binding [font/*fonts*      (#'font/load-fonts! doc)
                    pdf/*link-rects* (atom [])]
            (#'pdf/draw-markdown-in-cell! doc cs 40.0 800.0 500.0 100.0 md)
            (.close cs)
            (#'pdf/add-link-annotations! page @pdf/*link-rects*)))
        (let [uris (->> (.getAnnotations page)
                        (filter (partial instance? PDAnnotationLink))
                        (map #(.getURI ^PDActionURI (.getAction ^PDAnnotationLink %)))
                        set)]
          ;; "rel" (relative) and "js" (javascript:) must not be clickable
          (is (= #{"https://metabase.com" "mailto:a@b.com"} uris)))))))

;; --------------------------------------------------------------------------------------------
;; "Made with Metabase" vector branding badge (logo SVG paths + Lato-outlined "Made with")
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel branding-logo-asset-test
  (testing "the logo SVG parses to three fill groups with the brand colors and non-empty paths"
    (let [{:keys [vw vh groups]} @@#'pdf/brand-logo]
      (is (= 87.0 vw))
      (is (= 22.0 vh))
      (is (= 3 (count groups)))
      (is (every? (comp seq :ds) groups) "every fill group has at least one path")
      (is (= #{(Color. 0x5A 0x60 0x72) (Color. 0x50 0x9E 0xE3) (Color. 0xC2 0xDA 0xF0)}
             (set (map :color groups)))))))

(deftest ^:parallel branding-svg-paths-drawable-test
  (testing "every logo path parses to a non-empty shape (Batik flattens arcs to beziers)"
    (doseq [{:keys [ds]} (:groups @@#'pdf/brand-logo)
            d            ds]
      (let [shape (AWTPathProducer/createShape (StringReader. d) PathIterator/WIND_NON_ZERO)
            b     ^Rectangle2D (.getBounds2D shape)]
        (is (pos? (.getWidth b)) (str "path has width: " d))
        (is (pos? (.getHeight b)) (str "path has height: " d))))))

;; not ^:parallel: exercises the real PDFBox rendering path (font registry + content-stream text and
;; SVG-vector logo), which the deftest linter treats as side-effecting
(deftest branding-badge-render-smoke-test
  (testing "draw-brand-badge! draws the localized prefix (body face) + SVG-vector logo into a saveable PDF"
    (with-open [doc (PDDocument.)]
      (binding [font/*fonts* (#'font/load-fonts! doc)]
        (let [page (PDPage. PDRectangle/A4)]
          (.addPage doc page)
          (with-open [cs (PDPageContentStream. doc page)]
            ;; right edge near the A4 content margin, badge in the top margin band
            (#'pdf/draw-brand-badge! cs 559.0 800.0))
          (let [baos (ByteArrayOutputStream.)]
            (.save doc baos)
            (is (pos? (count (.toByteArray baos))))))))))

;; --------------------------------------------------------------------------------------------
;; `segment` -- greedy streaming grouping transducer
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel segment-test
  ;; pack numbers into groups whose running sum stays <= limit (greedy bin packing); ::typeset/reject
  ;; uses the alias so it resolves to the sentinel in the typeset namespace.
  (let [pack (fn [limit]
               (#'typeset/segment
                (fn ([x] {:items [x] :sum x})
                  ([{:keys [items sum]} x]
                   (let [s (+ sum x)]
                     (if (<= s limit) {:items (conj items x) :sum s} ::typeset/reject))))
                :items))]
    (testing "greedy grouping by running total; an overflowing item reopens the next group"
      (is (= [[3 4] [5 5] [2]] (into [] (pack 10) [3 4 5 5 2]))))
    (testing "no rejection -> a single group"
      (is (= [[1 2 3]] (into [] (pack 100) [1 2 3]))))
    (testing "empty input -> no groups"
      (is (= [] (into [] (pack 10) []))))
    (testing "default close is identity (emits the raw accumulator)"
      (is (= [[1 2 3]]
             (into [] (#'typeset/segment (fn ([x] [x]) ([acc x] (conj acc x)))) [1 2 3]))))
    (testing "custom close transforms each finished group"
      (is (= [3 7 5] ; consecutive pairs, summed
             (into [] (#'typeset/segment (fn ([x] [x])
                                           ([acc x] (if (< (count acc) 2) (conj acc x) ::typeset/reject)))
                                         #(reduce + %))
                   [1 2 3 4 5]))))
    (testing "::break closes the group and DROPS the seam item"
      (is (= [[1 2] [3] [4]]
             (into [] (#'typeset/segment (fn ([x] [x])
                                           ([acc x] (if (= x :|) ::typeset/break (conj acc x)))))
                   [1 2 :| 3 :| 4]))))
    (testing "honors downstream reduced? (take) without double-flushing or erroring"
      (is (= [[3 4]] (into [] (comp (pack 10) (take 1)) [3 4 5 5 2])))
      (is (= [[3 4] [5 5]] (into [] (comp (pack 10) (take 2)) [3 4 5 5 2]))))
    (testing "composes/streams via sequence too, flushing the final open group"
      (is (= [[3 4] [5 5] [2]] (sequence (pack 10) [3 4 5 5 2]))))))

(deftest ^:parallel segment-partition-all-test
  (letfn [(part-all [n]
            (#'typeset/segment (fn
                                 ([item] [item])
                                 ([acc item]
                                  (if (= n (count acc))
                                    ::typeset/reject
                                    (conj acc item))))))]
    (are [n xs] (= (into [] (partition-all n) xs)
                   (into [] (part-all n) xs))
      3 (range 10)
      3 (range 11)
      3 (range 12)
      3 (range 13)
      1 (range 10)
      1 (range 1)
      3 []
      1 [])))

(deftest ^:parallel segment-partition-by-test
  (letfn [(part-by [kf]
            (#'typeset/segment (fn
                                 ([item] [(kf item) [item]])
                                 ([[old-key acc] item]
                                  (let [new-key (kf item)]
                                    (if (not= old-key new-key)
                                      ::typeset/reject
                                      [old-key (conj acc item)]))))
                               second))]
    (are [xs] (= (into [] (partition-by even?) xs)
                 (into [] (part-by even?) xs))
      (range 10)
      (range 12)
      (range 1)
      []
      [1 3 5 4 2 6 7 9 10 11 12])))

;; --------------------------------------------------------------------------------------------
;; Link cards render as clickable markdown text cells
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel link-card-cell-test
  (testing "a URL link dashcard becomes a markdown text cell (clickable like any md link)"
    (binding [api/*current-user-id* 1]
      (is (= {:row 0 :col 0 :size_x 2 :size_y 1 :kind :text
              :text "### [https://example.com](https://example.com)"}
             (#'pdf/dashcard->cell {:row 0 :col 0 :size_x 2 :size_y 1
                                    :visualization_settings {:virtual_card {:display "link"}
                                                             :link {:url "https://example.com"}}}
                                   []))))))

(deftest ^:parallel iframe-url-test
  (testing "a bare URL is used as-is"
    (is (= "https://youtu.be/x" (#'pdf/iframe-url "https://youtu.be/x"))))
  (testing "src is extracted from an <iframe> embed snippet"
    (is (= "https://www.youtube.com/embed/x"
           (#'pdf/iframe-url "<iframe width=\"560\" src=\"https://www.youtube.com/embed/x\" allowfullscreen></iframe>"))))
  (testing "a scheme-less URL gets https://"
    (is (= "https://vimeo.com/123" (#'pdf/iframe-url "vimeo.com/123")))
    (is (= "https://vimeo.com/123" (#'pdf/iframe-url "//vimeo.com/123"))))
  (testing "blank/nil or an empty iframe yields nil"
    (is (nil? (#'pdf/iframe-url nil)))
    (is (nil? (#'pdf/iframe-url "   ")))
    (is (nil? (#'pdf/iframe-url "<iframe></iframe>")))))

(deftest ^:parallel iframe-card-cell-test
  (testing "an iframe dashcard becomes a clickable link text cell to its target"
    (is (= {:row 0 :col 0 :size_x 4 :size_y 3 :kind :text :text "https://youtu.be/abc"}
           (#'pdf/dashcard->cell {:row 0 :col 0 :size_x 4 :size_y 3
                                  :visualization_settings {:virtual_card {:display "iframe"}
                                                           :iframe "https://youtu.be/abc"}}
                                 [])))))

;; --------------------------------------------------------------------------------------------
;; Parameter name-column sizing (min-column-width)
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel min-column-width-test
  ;; synthetic pre-measured units (no fonts needed): three units of width 30/40/50, each with a
  ;; 5pt leading space; an identity split-fn (nothing is splittable).
  (let [u    (fn [ww sb?] {:ww ww :sp 5.0 :space-before? sb?})
        noop (fn [x] [x])
        us   [(u 30.0 false) (u 40.0 true) (u 50.0 true)]
        n-at (fn [w] (count (#'typeset/pack-units->lines us w noop)))]
    (testing "returns the narrowest width that preserves the fewest-lines count"
      (let [w1 (#'typeset/min-column-width us 1000.0 noop)]    ; everything fits on one line when wide
        (is (= 1 (n-at 1000.0)))
        (is (= 1 (n-at w1)))                                ; still one line at the computed width
        (is (= 2 (n-at (- w1 1.0))))                        ; ... two lines just below it
        (is (<= 129.0 w1 131.0)))                           ; == total advance 30 + (5+40) + (5+50)
      (let [w2 (#'typeset/min-column-width us 80.0 noop)]       ; only two units fit per line at 80
        (is (= 2 (n-at 80.0)))
        (is (= 2 (n-at w2)))
        (is (<= 74.0 w2 76.0))))                            ; == width to fit [30,40]: 30 + 5 + 40
    (testing "empty units -> zero width"
      (is (= 0.0 (#'typeset/min-column-width [] 100.0 noop))))))

(deftest ^:parallel resolve-inline-params-test
  (let [params [{:id "a" :name "Max Discount" :value [100]}
                {:id "b" :name "Category" :value "Gadget"}
                {:id "c" :name "Unset"} ; no value -> dropped
                {:id "d" :name "Top level"}]]
    (testing "only the dashcard's inline parameter ids that carry a value are returned, in param order"
      (is (= [{:id "a" :name "Max Discount" :value [100]}]
             (#'pdf/resolve-inline-params {:inline_parameters ["a" "c"]} params))))
    (testing "multiple inline params preserve their order in the parameter list"
      (is (= ["b" "a"]
             (mapv :id (#'pdf/resolve-inline-params {:inline_parameters ["a" "b"]}
                                                    (reverse params))))))
    (testing "no inline parameters -> nil (so cells stay free of the key)"
      (is (nil? (#'pdf/resolve-inline-params {} params)))
      (is (nil? (#'pdf/resolve-inline-params {:inline_parameters []} params))))
    (testing "an inline id that only has an unset parameter -> nil"
      (is (nil? (#'pdf/resolve-inline-params {:inline_parameters ["c"]} params))))))

(deftest ^:parallel visual-order-test
  (testing "left-to-right text is returned unchanged (no bidi processing)"
    (is (= "Hello, world 123" (#'font/visual-order "Hello, world 123")))
    (is (= "" (#'font/visual-order "")))
    (is (= "日本語" (#'font/visual-order "日本語"))))
  (testing "Hebrew (non-joining) is reordered logical->visual, i.e. reversed, so a left-to-right
            renderer draws it right-to-left; the letters themselves are unchanged"
    (let [shalom "שלום"]              ; שלום
      (is (= (apply str (reverse shalom)) (#'font/visual-order shalom)))))
  (testing "Arabic is shaped to positional presentation forms (Presentation-Forms-B / -A) and
            reordered to visual order"
    (let [marhaba "مرحبا"        ; مرحبا, base (non-presentation) letters
          out     (#'font/visual-order marhaba)]
      ;; every output char is a joined presentation form, none is a bare base letter
      (is (every? (fn [c] (or (<= 0xFB50 (int c) 0xFDFF) (<= 0xFE70 (int c) 0xFEFF)))
                  out))
      (is (not-any? (fn [c] (<= 0x0600 (int c) 0x06FF)) out))
      (is (not (re-find #"\?" out)))))
  (testing "Arabic vowel marks (tashkeel) are dropped, leaving the bare consonant skeleton
            (no zero-width combining marks, no spacing FE70-block tashkeel that would float)"
    ;; مُحَمَّدٌ (vocalised 'Muhammad') and مرحبا shape to the same consonants once marks are gone
    (let [vocalised (#'font/visual-order "مُحَمَّدٌ")]
      (is (= 4 (count vocalised)))                              ; د م ح م, no marks left
      (is (not-any? (fn [c] (<= 0xFE70 (int c) 0xFE7F)) vocalised))  ; no spacing tashkeel forms
      (is (= (#'font/visual-order "مرحبا")
             (#'font/visual-order "مَرْحَبًا"))))))               ; vocalised == plain once stripped

(deftest ^:parallel base-rtl?-test
  (testing "base direction is RTL only when the first strong character is RTL"
    (is (true?  (boolean (#'font/base-rtl? "שלום עולם"))))            ; Hebrew
    (is (true?  (boolean (#'font/base-rtl? "مرحبا بكم"))))            ; Arabic
    (is (true?  (boolean (#'font/base-rtl? "مرحبا Metabase"))))       ; RTL-first, embedded LTR
    (is (false? (boolean (#'font/base-rtl? "Metabase مرحبا"))))       ; LTR-first, embedded RTL
    (is (true?  (boolean (#'font/base-rtl? "123 مرحبا"))))            ; digits are neutral; first STRONG char is Arabic
    (is (false? (boolean (#'font/base-rtl? "Hello world"))))
    (is (false? (boolean (#'font/base-rtl? ""))))
    (is (false? (boolean (#'font/base-rtl? "日本語"))))))            ; CJK is LTR

(deftest ^:parallel reorder-bidi-items-test
  (let [mk    (fn [t sp] {:text t :space-before? sp})
        texts (fn [items] (mapv :text (#'typeset/reorder-bidi-items items)))]
    (testing "a left-to-right line keeps its word order"
      (is (= ["Hello" "world"] (texts [(mk "Hello" false) (mk "world" true)]))))
    (testing "a single item (or empty line) is returned unchanged"
      (is (= ["שלום"] (texts [(mk "שלום" false)])))
      (is (= [] (texts []))))
    (testing "a right-to-left line has its words reversed to visual order"
      ;; logical [aleph beth gimel] reads right-to-left, so visually gimel is leftmost
      (is (= ["ג" "ב" "א"] (texts [(mk "א" false) (mk "ב" true) (mk "ג" true)]))))
    (testing "the first visual word loses its leading space; later words keep an inter-word space"
      (is (= [false true true]
             (mapv :space-before? (#'typeset/reorder-bidi-items
                                   [(mk "א" false) (mk "ב" true) (mk "ג" true)])))))
    (testing "an embedded left-to-right word keeps its internal order within an RTL line"
      ;; logical: shalom, Metabase, olam -> visual L-to-R: olam, Metabase, shalom
      (is (= ["עולם" "Metabase" "שלום"]
             (texts [(mk "שלום" false) (mk "Metabase" true) (mk "עולם" true)]))))))

(deftest ^:parallel effective-display-test
  (testing "a non-visualizer card uses its own display"
    (is (= :bar (#'pdf/effective-display {:display "bar"} {})))
    (is (= :bar (#'pdf/effective-display {:display "bar"} {:visualization_settings {}}))))
  (testing "a visualizer dashcard overrides the underlying card's display"
    ;; e.g. a smartscalar card surfaced as a bar chart -> fill its cell like a real bar chart
    (is (= :bar (#'pdf/effective-display
                 {:display "smartscalar"}
                 {:visualization_settings {:visualization {:display "bar"}}}))))
  (testing "a visualizer dashcard without an explicit display falls back to the card display"
    (is (= :line (#'pdf/effective-display
                  {:display "line"}
                  {:visualization_settings {:visualization {:settings {}}}})))))

;; --------------------------------------------------------------------------------------------
;; Text-layout characterization (golden) test.
;;
;; Captures the exact sequence of `draw-line!` calls -- {font, size, x, y, text} -- that each text
;; path produces, for a battery of fixtures covering plain wrapping, RTL titles, inline-styled
;; Markdown, headings/lists, CJK wrapping, Arabic/Hebrew reordering, and furigana. The numbers come
;; from PDFBox font metrics + ICU shaping (pure integer math, no rasterization), so they are
;; deterministic across platforms. This pins current layout behaviour so the planned wrap/measure
;; unification can be refactored without silently changing what gets drawn or where. If a change is
;; intentional, regenerate the expected values.
;; --------------------------------------------------------------------------------------------

(defn- round1 [v]
  (/ (Math/round (* (double v) 10.0)) 10.0))

(defn- capture-line-draws!
  "Run `render!` with `draw-line!` intercepted, returning each drawn line as
  {:font <face-id> :pt :x :y :text} with coordinates rounded to 0.1pt."
  [render!]
  (let [calls (atom [])]
    (dynamic-redefs/with-dynamic-fn-redefs [pdf/draw-line! (fn [_cs face font-pt x y text]
                                                             (swap! calls conj {:font (:id face) :pt (round1 font-pt)
                                                                                :x (round1 x) :y (round1 y) :text text}))]
      (render!))
    @calls))

(deftest text-layout-characterization-test
  (with-open [doc (PDDocument.)]
    (let [page (PDPage. PDRectangle/A4)
          _    (.addPage doc page)
          cs   (PDPageContentStream. doc page)]
      (binding [font/*fonts*      (#'font/load-fonts! doc)
                pdf/*link-rects* (atom [])]
        (let [reg  (#'font/face :regular)
              bold (#'font/face :bold)
              ;; draw-text-block! (plain text path) and draw-markdown-in-cell! (markdown path)
              dtb  (fn [face pt x y w h text] #(#'pdf/draw-text-block! cs face pt nil x y w h text))
              dmic (fn [x y w h text] #(#'pdf/draw-markdown-in-cell! doc cs x y w h text))]
          (doseq [[nm render expected]
                  ;; plain text now flows through the same item pipeline as Markdown, so it draws one
                  ;; record per word (not per line); the rendered pixels are unchanged -- verified
                  ;; separately by rasterising every fixture before/after the unification.
                  [["plain wrap (Latin, 2 lines)"
                    (dtb reg 10.0 40.0 700.0 120.0 60.0 "The quick brown fox jumps over")
                    [{:font :regular :pt 10.0 :x 40.0 :y 690.0 :text "The"}
                     {:font :regular :pt 10.0 :x 59.3 :y 690.0 :text "quick"}
                     {:font :regular :pt 10.0 :x 85.3 :y 690.0 :text "brown"}
                     {:font :regular :pt 10.0 :x 116.2 :y 690.0 :text "fox"}
                     {:font :regular :pt 10.0 :x 133.0 :y 690.0 :text "jumps"}
                     {:font :regular :pt 10.0 :x 40.0 :y 677.0 :text "over"}]]
                   ["plain RTL title (right-aligned, per-word reorder)"
                    (dtb bold 13.0 40.0 700.0 200.0 40.0 "مرحبا بكم")
                    [{:font :bold :pt 13.0 :x 187.5 :y 687.0 :text "بكم"}
                     {:font :bold :pt 13.0 :x 209.3 :y 687.0 :text "مرحبا"}]]
                   ["markdown inline styles (per-run fonts)"
                    (dmic 40.0 700.0 240.0 80.0 "Hi **bold** *em* `cd` [lk](https://x.com)")
                    [{:font :regular :pt 10.5 :x 40.0 :y 689.5 :text "Hi"}
                     {:font :bold :pt 10.5 :x 52.6 :y 689.5 :text "bold"}
                     {:font :italic :pt 10.5 :x 76.1 :y 689.5 :text "em"}
                     {:font :mono :pt 10.5 :x 96.8 :y 689.5 :text "cd"}
                     {:font :regular :pt 10.5 :x 112.1 :y 689.5 :text "lk"}]]
                   ;; a word whose style changes mid-word with no whitespace ("x**Y**z") is ONE
                   ;; indivisible multi-piece word: the pieces draw contiguously in their own fonts
                   ;; and never break across a line. (Pre-refactor this split into separate units that
                   ;; the wrapper could break between.)
                   ["markdown cross-style word stays one indivisible word"
                    (dmic 40.0 700.0 70.0 80.0 "x**Y**z tail end")
                    [{:font :regular :pt 10.5 :x 40.0 :y 689.5 :text "x"}
                     {:font :bold :pt 10.5 :x 45.2 :y 689.5 :text "Y"}
                     {:font :regular :pt 10.5 :x 52.1 :y 689.5 :text "z"}
                     {:font :regular :pt 10.5 :x 59.5 :y 689.5 :text "tail"}
                     {:font :regular :pt 10.5 :x 76.2 :y 689.5 :text "end"}]]
                   ["markdown heading + bullet list (markers)"
                    (dmic 40.0 700.0 240.0 120.0 "## Head\n\n- one\n- two")
                    [{:font :bold :pt 13.5 :x 40.0 :y 686.5 :text "Head"}
                     {:font :regular :pt 10.5 :x 40.0 :y 668.0 :text "- "}
                     {:font :regular :pt 10.5 :x 46.6 :y 668.0 :text "one"}
                     {:font :regular :pt 10.5 :x 40.0 :y 650.3 :text "- "}
                     {:font :regular :pt 10.5 :x 46.6 :y 650.3 :text "two"}]]
                   ["CJK wrap (per-character break units + kinsoku)"
                    (dmic 40.0 700.0 80.0 80.0 "これはテストです、日本語")
                    [{:font :regular :pt 10.5 :x 40.0 :y 689.5 :text "こ"}
                     {:font :regular :pt 10.5 :x 50.5 :y 689.5 :text "れ"}
                     {:font :regular :pt 10.5 :x 61.0 :y 689.5 :text "は"}
                     {:font :regular :pt 10.5 :x 71.5 :y 689.5 :text "テ"}
                     {:font :regular :pt 10.5 :x 82.0 :y 689.5 :text "ス"}
                     {:font :regular :pt 10.5 :x 92.5 :y 689.5 :text "ト"}
                     {:font :regular :pt 10.5 :x 103.0 :y 689.5 :text "で"}
                     {:font :regular :pt 10.5 :x 40.0 :y 675.9 :text "す、"}
                     {:font :regular :pt 10.5 :x 61.0 :y 675.9 :text "日"}
                     {:font :regular :pt 10.5 :x 71.5 :y 675.9 :text "本"}
                     {:font :regular :pt 10.5 :x 82.0 :y 675.9 :text "語"}]]
                   ["Arabic markdown (word reorder + right align)"
                    (dmic 40.0 700.0 240.0 80.0 "مرحبا بكم في ميتابيس")
                    [{:font :regular :pt 10.5 :x 186.5 :y 689.5 :text "ميتابيس"}
                     {:font :regular :pt 10.5 :x 225.6 :y 689.5 :text "في"}
                     {:font :regular :pt 10.5 :x 240.7 :y 689.5 :text "بكم"}
                     {:font :regular :pt 10.5 :x 257.5 :y 689.5 :text "مرحبا"}]]
                   ["Hebrew markdown (word reorder + right align)"
                    (dmic 40.0 700.0 240.0 80.0 "שלום עולם מטאבייס")
                    [{:font :regular :pt 10.5 :x 193.0 :y 689.5 :text "מטאבייס"}
                     {:font :regular :pt 10.5 :x 233.7 :y 689.5 :text "עולם"}
                     {:font :regular :pt 10.5 :x 257.7 :y 689.5 :text "שלום"}]]
                   ["furigana (ruby reading drawn above base)"
                    (dmic 40.0 700.0 240.0 80.0 "{漢字|かんじ}です")
                    [{:font :regular :pt 10.5 :x 40.0 :y 682.6 :text "漢字"}
                     {:font :regular :pt 5.8 :x 41.8 :y 694.1 :text "かんじ"}
                     {:font :regular :pt 10.5 :x 61.0 :y 682.6 :text "で"}
                     {:font :regular :pt 10.5 :x 71.5 :y 682.6 :text "す"}]]
                   ["markdown hard line break (two trailing spaces)"
                    (dmic 40.0 700.0 240.0 80.0 "one two  \nthree")
                    [{:font :regular :pt 10.5 :x 40.0 :y 689.5 :text "one"}
                     {:font :regular :pt 10.5 :x 60.0 :y 689.5 :text "two"}
                     {:font :regular :pt 10.5 :x 40.0 :y 675.9 :text "three"}]]]]
            (is (= expected (capture-line-draws! render)) nm))
          (.close cs))))))

(deftest em-width-memoization-test
  (with-open [doc (PDDocument.)]
    (binding [font/*fonts* (#'font/load-fonts! doc)]
      (let [reg   (#'font/face :regular)
            inner @#'font/raw-em-width-inner
            strs  ["Hello world" "مرحبا بكم" "これはテスト" "" "שלום עולם"]
            width (fn [s pt] (#'font/text-width reg pt s))]
        (testing "text-width is identical whether *em-width* is the default (uncached) or memoized"
          (let [uncached (mapv #(width % 11.0) strs)
                cached   (binding [font/*em-width* (memo/memo inner)] (mapv #(width % 11.0) strs))]
            (is (= uncached cached))))
        (testing "each [face string] is measured once and reused across font sizes (the fit-scale win)"
          (let [calls    (atom 0)
                counting (fn [face s] (swap! calls inc) (inner face s))]
            (binding [font/*em-width* (memo/memo counting)]
              (width "Hello world" 10.0)
              (width "Hello world" 20.0)    ; same face+string, different size -> no recompute
              (width "Goodbye now" 10.0))
            (is (= 2 @calls) "two distinct strings -> two inner computations; the sizes share the cache")))
        (testing "scaled widths are exactly proportional to font size (ems are size-independent)"
          (binding [font/*em-width* (memo/memo inner)]
            (is (= (* 2.0 (width "Hello world" 10.0))
                   (width "Hello world" 20.0)))))
        (testing "the memoization cache is introspectable and clearable (clojure.core.memoize tooling)"
          (let [m (memo/memo inner)]
            (binding [font/*em-width* m]
              (width "Hello world" 10.0)
              (width "Goodbye now" 10.0))
            (is (ccm/memoized? m))
            (is (= 2 (count (ccm/snapshot m))))
            (ccm/memo-clear! m)
            (is (= 0 (count (ccm/snapshot m))))))))))

;; --------------------------------------------------------------------------------------------
;; Tables: restyling the email table hiccup to fit the PDF card frame
;; --------------------------------------------------------------------------------------------

(defn- divider?
  "Whether a restyled header cell carries the border-right divider."
  [th]
  (str/includes? (get-in th [1 :style] "") "border-right"))

(deftest ^:parallel restyle-table-test
  (let [th    (fn [label] [:th {:style "color: #949AAB;"} label])
        ;; render-table-head splices the header cells into the :tr as a seq, like `for` output
        table [:table {:style "border: 1px solid #F0F0F0; border-radius: 6px; margin: 16px;"}
               [:thead [:tr {} (list (th "a") (th "b") (th "c"))]]
               [:tbody [:tr {} [:td {:style "x"} "1"]]]]
        [_table attrs [_thead [_tr _tr-attrs th-a th-b th-c]] tbody] (#'pdf/restyle-table table)]
    (testing "the <table> fills its frame and drops its own border/radius/margin"
      (is (str/includes? (:style attrs) "width:100%"))
      (is (str/includes? (:style attrs) "border:none")))
    (testing "header cells get a divider, except the last"
      (is (divider? th-a))
      (is (divider? th-b))
      (is (not (divider? th-c))))
    (testing "body rows pass through untouched"
      (is (= [:tbody [:tr {} [:td {:style "x"} "1"]]] tbody)))))

(deftest ^:parallel add-header-dividers-test
  (testing "spliced seqs are flattened and all header cells but the last get the divider"
    (let [[_ _ a b] (#'pdf/add-header-dividers
                     [:tr {} (list [:th {:style ""} "a"] [:th {:style ""} "b"])])]
      (is (divider? a))
      (is (not (divider? b)))))
  (testing "a th without an attrs map is left alone"
    (let [tr [:tr {} [:th "bare"] [:th {:style ""} "last"]]]
      (is (= tr (#'pdf/add-header-dividers tr))))))

;; not ^:parallel: exercises the real CSSBox HTML rendering path
(deftest table-body-png-sizing-test
  (let [data               {:cols [{:name         "n"
                                    :display_name "N"
                                    :base_type    :type/Integer}]
                            :rows (mapv vector (range 50))}
        part               {:card     {}
                            :dashcard nil
                            :result   {:data data}}
        px-w               400
        px-h               300
        ss                 (long @#'pdf/table-supersample)
        ^BufferedImage img (ImageIO/read (io/input-stream (#'pdf/table-body-png nil part px-w px-h)))]
    (testing "width fills the cell at the supersampled scale"
      (is (<= (* ss (- px-w 8)) (.getWidth img) (* ss px-w))))
    (testing "height is capped to the cell even though 50 rows don't fit"
      (is (<= 1 (.getHeight img) (* ss px-h))))))
