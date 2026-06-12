(ns metabase.channel.render.pdf-test
  "Tests for backend dashboard->PDF rendering: the pure layout/text helpers (Markdown furigana,
  parameter chip wrapping, inline-parameter resolution, visualizer display resolution, and the
  right-to-left shaping/reordering/alignment for Arabic and Hebrew). Everything here is
  intentionally network-free (pure predicates and in-memory PDFs) so the suite is fast and not
  flaky. The SSRF-safe image-fetch defenses now live in `metabase.util.http` (see
  `metabase.util.http-test`)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.channel.render.pdf :as pdf]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs])
  (:import
   (java.awt.image BufferedImage)
   (javax.imageio ImageIO)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.interactive.action PDActionURI)
   (org.apache.pdfbox.pdmodel.interactive.annotation PDAnnotationLink)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; Markdown: furigana {base|reading} parsing
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel parse-ruby-test
  (let [strip (fn [runs] (mapv #(dissoc % :href) runs))]
    (testing "{base|reading} becomes a ruby run; surrounding text stays as text runs"
      (is (= [{:ruby? true :base "参加希望" :reading "さんかきぼう"} {:text "の方は"}]
             (strip (#'pdf/parse-ruby "{参加希望|さんかきぼう}の方は" {} nil)))))
    (testing "multiple furigana groups interleaved with text"
      (is (= [{:text "a"} {:ruby? true :base "x" :reading "y"}
              {:text "b"} {:ruby? true :base "c" :reading "d"}]
             (strip (#'pdf/parse-ruby "a{x|y}b{c|d}" {} nil)))))
    (testing "plain text without ruby is a single text run"
      (is (= [{:text "hello world"}] (strip (#'pdf/parse-ruby "hello world" {} nil)))))
    (testing "braces without a pipe are not treated as ruby"
      (is (= [{:text "{not ruby}"}] (strip (#'pdf/parse-ruby "{not ruby}" {} nil)))))
    (testing "the run's style keys are carried onto base/reading runs"
      (is (= [{:bold? true :ruby? true :base "x" :reading "y"}]
             (strip (#'pdf/parse-ruby "{x|y}" {:bold? true} nil)))))))

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
          (binding [pdf/*fonts*      (#'pdf/load-fonts! doc)
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
        n-at (fn [w] (count (#'pdf/pack-units->lines us w noop)))]
    (testing "returns the narrowest width that preserves the fewest-lines count"
      (let [w1 (#'pdf/min-column-width us 1000.0 noop)]    ; everything fits on one line when wide
        (is (= 1 (n-at 1000.0)))
        (is (= 1 (n-at w1)))                                ; still one line at the computed width
        (is (= 2 (n-at (- w1 1.0))))                        ; ... two lines just below it
        (is (<= 129.0 w1 131.0)))                           ; == total advance 30 + (5+40) + (5+50)
      (let [w2 (#'pdf/min-column-width us 80.0 noop)]       ; only two units fit per line at 80
        (is (= 2 (n-at 80.0)))
        (is (= 2 (n-at w2)))
        (is (<= 74.0 w2 76.0))))                            ; == width to fit [30,40]: 30 + 5 + 40
    (testing "empty units -> zero width"
      (is (= 0.0 (#'pdf/min-column-width [] 100.0 noop))))))

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
    (is (= "Hello, world 123" (#'pdf/visual-order "Hello, world 123")))
    (is (= "" (#'pdf/visual-order "")))
    (is (= "日本語" (#'pdf/visual-order "日本語"))))
  (testing "Hebrew (non-joining) is reordered logical->visual, i.e. reversed, so a left-to-right
            renderer draws it right-to-left; the letters themselves are unchanged"
    (let [shalom "שלום"]              ; שלום
      (is (= (apply str (reverse shalom)) (#'pdf/visual-order shalom)))))
  (testing "Arabic is shaped to positional presentation forms (Presentation-Forms-B / -A) and
            reordered to visual order"
    (let [marhaba "مرحبا"        ; مرحبا, base (non-presentation) letters
          out     (#'pdf/visual-order marhaba)]
      ;; every output char is a joined presentation form, none is a bare base letter
      (is (every? (fn [c] (or (<= 0xFB50 (int c) 0xFDFF) (<= 0xFE70 (int c) 0xFEFF)))
                  out))
      (is (not-any? (fn [c] (<= 0x0600 (int c) 0x06FF)) out))
      (is (not (re-find #"\?" out)))))
  (testing "Arabic vowel marks (tashkeel) are dropped, leaving the bare consonant skeleton
            (no zero-width combining marks, no spacing FE70-block tashkeel that would float)"
    ;; مُحَمَّدٌ (vocalised 'Muhammad') and مرحبا shape to the same consonants once marks are gone
    (let [vocalised (#'pdf/visual-order "مُحَمَّدٌ")]
      (is (= 4 (count vocalised)))                              ; د م ح م, no marks left
      (is (not-any? (fn [c] (<= 0xFE70 (int c) 0xFE7F)) vocalised))  ; no spacing tashkeel forms
      (is (= (#'pdf/visual-order "مرحبا")
             (#'pdf/visual-order "مَرْحَبًا"))))))               ; vocalised == plain once stripped

(deftest ^:parallel base-rtl?-test
  (testing "base direction is RTL only when the first strong character is RTL"
    (is (true?  (boolean (#'pdf/base-rtl? "שלום עולם"))))            ; Hebrew
    (is (true?  (boolean (#'pdf/base-rtl? "مرحبا بكم"))))            ; Arabic
    (is (true?  (boolean (#'pdf/base-rtl? "مرحبا Metabase"))))       ; RTL-first, embedded LTR
    (is (false? (boolean (#'pdf/base-rtl? "Metabase مرحبا"))))       ; LTR-first, embedded RTL
    (is (true?  (boolean (#'pdf/base-rtl? "123 مرحبا"))))            ; digits are neutral; first STRONG char is Arabic
    (is (false? (boolean (#'pdf/base-rtl? "Hello world"))))
    (is (false? (boolean (#'pdf/base-rtl? ""))))
    (is (false? (boolean (#'pdf/base-rtl? "日本語"))))))            ; CJK is LTR

(deftest ^:parallel reorder-bidi-items-test
  (let [mk    (fn [t sp] {:text t :space-before? sp})
        texts (fn [items] (mapv :text (#'pdf/reorder-bidi-items items)))]
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
             (mapv :space-before? (#'pdf/reorder-bidi-items
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
      (binding [pdf/*fonts*      (#'pdf/load-fonts! doc)
                pdf/*link-rects* (atom [])]
        (let [reg  (#'pdf/face :regular)
              bold (#'pdf/face :bold)
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
                     {:font :regular :pt 10.0 :x 60.0 :y 690.0 :text "quick"}
                     {:font :regular :pt 10.0 :x 87.6 :y 690.0 :text "brown"}
                     {:font :regular :pt 10.0 :x 120.6 :y 690.0 :text "fox"}
                     {:font :regular :pt 10.0 :x 40.0 :y 677.0 :text "jumps"}
                     {:font :regular :pt 10.0 :x 71.6 :y 677.0 :text "over"}]]
                   ["plain RTL title (right-aligned, per-word reorder)"
                    (dtb bold 13.0 40.0 700.0 200.0 40.0 "مرحبا بكم")
                    [{:font :bold :pt 13.0 :x 186.6 :y 687.0 :text "بكم"}
                     {:font :bold :pt 13.0 :x 209.3 :y 687.0 :text "مرحبا"}]]
                   ["markdown inline styles (per-run fonts)"
                    (dmic 40.0 700.0 240.0 80.0 "Hi **bold** *em* `cd` [lk](https://x.com)")
                    [{:font :regular :pt 10.5 :x 40.0 :y 689.5 :text "Hi"}
                     {:font :bold :pt 10.5 :x 53.2 :y 689.5 :text "bold"}
                     {:font :italic :pt 10.5 :x 78.9 :y 689.5 :text "em"}
                     {:font :mono :pt 10.5 :x 99.7 :y 689.5 :text "cd"}
                     {:font :regular :pt 10.5 :x 115.0 :y 689.5 :text "lk"}]]
                   ["markdown heading + bullet list (markers)"
                    (dmic 40.0 700.0 240.0 120.0 "## Head\n\n- one\n- two")
                    [{:font :bold :pt 13.5 :x 40.0 :y 686.5 :text "Head"}
                     {:font :regular :pt 10.5 :x 40.0 :y 668.0 :text "- "}
                     {:font :regular :pt 10.5 :x 46.1 :y 668.0 :text "one"}
                     {:font :regular :pt 10.5 :x 40.0 :y 650.3 :text "- "}
                     {:font :regular :pt 10.5 :x 46.1 :y 650.3 :text "two"}]]
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
                    [{:font :regular :pt 10.5 :x 186.4 :y 689.5 :text "ميتابيس"}
                     {:font :regular :pt 10.5 :x 225.5 :y 689.5 :text "في"}
                     {:font :regular :pt 10.5 :x 240.7 :y 689.5 :text "بكم"}
                     {:font :regular :pt 10.5 :x 257.5 :y 689.5 :text "مرحبا"}]]
                   ["Hebrew markdown (word reorder + right align)"
                    (dmic 40.0 700.0 240.0 80.0 "שלום עולם מטאבייס")
                    [{:font :regular :pt 10.5 :x 192.9 :y 689.5 :text "מטאבייס"}
                     {:font :regular :pt 10.5 :x 233.6 :y 689.5 :text "עולם"}
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
                     {:font :regular :pt 10.5 :x 61.5 :y 689.5 :text "two"}
                     {:font :regular :pt 10.5 :x 40.0 :y 675.9 :text "three"}]]]]
            (is (= expected (capture-line-draws! render)) nm))
          (.close cs))))))

(deftest width-cache-test
  (with-open [doc (PDDocument.)]
    (binding [pdf/*fonts* (#'pdf/load-fonts! doc)]
      (let [reg   (#'pdf/face :regular)
            strs  ["Hello world" "مرحبا بكم" "これはテスト" "" "שלום עולם"]
            width (fn [s pt] (#'pdf/text-width reg pt s))]
        (testing "text-width is identical whether or not the per-render width cache is bound"
          (let [uncached (mapv #(width % 11.0) strs)
                cached   (binding [pdf/*width-cache* (atom {})] (mapv #(width % 11.0) strs))]
            (is (= uncached cached))))
        (testing "a string's em-width is cached once and reused across font sizes (the fit-scale win)"
          (let [cache (atom {})]
            (binding [pdf/*width-cache* cache]
              (width "Hello world" 10.0)
              (width "Hello world" 20.0)    ; same face+string, different size -> no new entry
              (width "Goodbye now" 10.0))
            (is (= 2 (count @cache)))
            ;; and the scaled widths are exactly proportional to font size
            (binding [pdf/*width-cache* cache]
              (is (= (* 2.0 (width "Hello world" 10.0))
                     (width "Hello world" 20.0))))))))))

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
        [_ attrs [_ [_ _ th-a th-b th-c]] tbody] (#'pdf/restyle-table table)]
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
