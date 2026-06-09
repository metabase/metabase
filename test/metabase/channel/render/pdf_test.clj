(ns metabase.channel.render.pdf-test
  "Tests for backend dashboard->PDF rendering: the pure layout/text helpers (Markdown furigana,
  parameter chip wrapping, inline-parameter resolution, visualizer display resolution, and the
  right-to-left shaping/reordering/alignment for Arabic and Hebrew). Everything here is
  intentionally network-free (pure predicates and in-memory PDFs) so the suite is fast and not
  flaky. The SSRF-safe image-fetch defenses now live in `metabase.util.http` (see
  `metabase.util.http-test`)."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.channel.render.pdf :as pdf])
  (:import
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
;; Parameter bar layout (flow + wrap)
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel layout-param-chips-test
  (let [chips [{:width 100.0} {:width 100.0} {:width 100.0}]] ; param-chip-gap is 16
    (testing "chips that fit stay on one line, with cumulative x offsets (0, 100+gap, 200+2gap)"
      (let [lines (#'pdf/layout-param-chips chips 1000.0)]
        (is (= 1 (count lines)))
        (is (= [0.0 116.0 232.0] (mapv :x (first lines))))))
    (testing "chips wrap onto new lines when they exceed the content width"
      (let [lines (#'pdf/layout-param-chips chips 250.0)]
        (is (= [2 1] (mapv count lines)))
        (is (= [0.0 116.0] (mapv :x (first lines))))
        (is (= [0.0] (mapv :x (second lines))))))
    (testing "no chips -> no lines"
      (is (= [] (#'pdf/layout-param-chips [] 1000.0))))))

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
