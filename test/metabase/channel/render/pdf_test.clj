(ns metabase.channel.render.pdf-test
  "Tests for backend dashboard->PDF rendering. This first installment covers the security-critical
  SSRF defenses around fetching user-provided Markdown image URLs. Everything here is intentionally
  network-free (pure predicates, the DNS resolver exercised against `localhost`, and in-memory
  streams) so the suite is fast and not flaky."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.channel.render.pdf :as pdf])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)
   (java.net InetAddress)
   (org.apache.pdfbox.pdmodel PDDocument PDPage PDPageContentStream)
   (org.apache.pdfbox.pdmodel.common PDRectangle)
   (org.apache.pdfbox.pdmodel.interactive.action PDActionURI)
   (org.apache.pdfbox.pdmodel.interactive.annotation PDAnnotationLink)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; SSRF: URL validation matrix (safe-image-url?)
;; --------------------------------------------------------------------------------------------

(def ^:private allowed-urls
  ["https://example.com/a.png"
   "https://sub.example.co.uk/path/to/img.jpg?x=1&y=2"
   "https://example.com:8443/a.png"                 ; non-default https port is fine
   "HTTPS://Example.COM/a.png"                       ; scheme/host are case-insensitive
   "https://xn--80ak6aa92e.com/a.png"])              ; punycode IDN host

(def ^:private blocked-urls
  ["http://example.com/a.png"                        ; not https
   "ftp://example.com/a.png"                          ; not https
   "file:///etc/passwd"                               ; not https
   "javascript:alert(1)"                              ; not https / malformed
   "https://169.254.169.254/latest/meta-data/"        ; link-local IP literal (AWS/GCP IMDS)
   "https://10.0.0.5/x.png"                           ; RFC1918 IP literal
   "https://192.168.1.1/x.png"
   "https://172.16.0.1/x.png"
   "https://127.0.0.1/x.png"                          ; loopback IP literal
   "https://[::1]/x.png"                              ; IPv6 loopback literal
   "https://[fe80::1]/x.png"                          ; IPv6 link-local literal
   "https://2130706433/x.png"                         ; decimal form of 127.0.0.1
   "https://0177.0.0.1/x.png"                         ; octal-ish IP form
   "https://localhost/x.png"                          ; localhost
   "https://LOCALHOST/x.png"
   "https://foo.localhost/x.png"                      ; .localhost suffix
   "https://svc.internal/x.png"                       ; .internal suffix
   "https://host.local/x.png"                         ; .local suffix
   "https://box.lan/x.png"                            ; .lan suffix
   "https://metadata.google.internal/x.png"           ; GCP metadata host
   "https://metadata/x.png"
   "https://user:pass@example.com/x.png"              ; userinfo (credential smuggling)
   "https:///x.png"                                   ; no host
   "not a url"
   ""])

(deftest safe-image-url?-test
  (testing "allowed image URLs"
    (doseq [url allowed-urls]
      (is (true? (boolean (#'pdf/safe-image-url? url))) (str "should be allowed: " url))))
  (testing "blocked image URLs (SSRF / non-https / bad host)"
    (doseq [url blocked-urls]
      (is (false? (boolean (#'pdf/safe-image-url? url))) (str "should be blocked: " url)))))

;; --------------------------------------------------------------------------------------------
;; SSRF: resolved-address validation matrix (public-address?)
;; --------------------------------------------------------------------------------------------

(def ^:private public-ips
  ["8.8.8.8"
   "1.1.1.1"
   "93.184.216.34"
   "100.63.255.255"                ; one below the CGNAT 100.64.0.0/10 range
   "100.128.0.0"                   ; one above the CGNAT range
   "2606:4700:4700::1111"])        ; public IPv6

(def ^:private non-public-ips
  ["127.0.0.1"                     ; loopback
   "169.254.169.254"              ; link-local (cloud metadata)
   "10.1.2.3"                     ; RFC1918
   "172.16.0.1"
   "172.31.255.255"
   "192.168.0.1"
   "0.0.0.0"                      ; any-local
   "224.0.0.1"                    ; multicast
   "100.64.0.1"                   ; CGNAT
   "100.127.255.255"              ; CGNAT (top)
   "::1"                          ; IPv6 loopback
   "fe80::1"                      ; IPv6 link-local
   "fc00::1"                      ; IPv6 ULA (fc)
   "fd12:3456::1"                 ; IPv6 ULA (fd)
   "ff02::1"])                    ; IPv6 multicast

(deftest public-address?-test
  (testing "globally-routable addresses are allowed"
    (doseq [ip public-ips]
      (is (true? (boolean (#'pdf/public-address? (InetAddress/getByName ip))))
          (str "should be public: " ip))))
  (testing "loopback/link-local/private/ULA/CGNAT/multicast addresses are rejected"
    (doseq [ip non-public-ips]
      (is (false? (boolean (#'pdf/public-address? (InetAddress/getByName ip))))
          (str "should be rejected: " ip)))))

;; --------------------------------------------------------------------------------------------
;; SSRF: DNS resolver closes the rebinding gap, and the fetch short-circuits before any network IO
;; --------------------------------------------------------------------------------------------

(deftest ssrf-safe-dns-resolver-test
  (testing "the validating resolver throws when a host resolves to a non-public address"
    ;; `localhost` resolves to loopback (no network needed) -> must be refused
    (is (thrown? ExceptionInfo
                 (.resolve ^org.apache.http.conn.DnsResolver @#'pdf/ssrf-safe-dns-resolver "localhost")))))

(deftest fetch-image-bytes-blocks-without-network-test
  (testing "blocked URLs return nil at the validation gate, never reaching the network"
    (doseq [url ["https://169.254.169.254/latest/meta-data/"
                 "http://example.com/x.png"
                 "https://10.0.0.1/x.png"
                 "https://localhost/x.png"
                 "https://metadata.google.internal/x.png"]]
      (is (nil? (#'pdf/fetch-image-bytes url)) (str "should not fetch: " url)))))

;; --------------------------------------------------------------------------------------------
;; Download size cap (read-bounded)
;; --------------------------------------------------------------------------------------------

(deftest read-bounded-test
  (testing "reads the whole stream when under the cap"
    (is (= "hello" (String. ^bytes (#'pdf/read-bounded (ByteArrayInputStream. (.getBytes "hello")) 100)))))
  (testing "reads exactly up to the cap (inclusive)"
    (is (= 5 (count (#'pdf/read-bounded (ByteArrayInputStream. (.getBytes "12345")) 5)))))
  (testing "returns nil when the stream exceeds the cap"
    (is (nil? (#'pdf/read-bounded (ByteArrayInputStream. (.getBytes "0123456789")) 5)))))

;; --------------------------------------------------------------------------------------------
;; Markdown: furigana {base|reading} parsing
;; --------------------------------------------------------------------------------------------

(deftest parse-ruby-test
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

(deftest clickable-href?-test
  (testing "absolute http/https/mailto links are clickable"
    (doseq [h ["https://example.com" "http://example.com/a?b=1" "HTTPS://EX.COM" "mailto:a@b.com"]]
      (is (true? (boolean (#'pdf/clickable-href? h))) (str h))))
  (testing "relative, scheme-less, and dangerous schemes are not clickable"
    (doseq [h ["/dashboard/5" "example.com" "javascript:alert(1)" "file:///etc/passwd" "ftp://x/y" "" nil]]
      (is (false? (boolean (#'pdf/clickable-href? h))) (str h)))))

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

(deftest link-card-cell-test
  (testing "a URL link dashcard becomes a markdown text cell (clickable like any md link)"
    (binding [api/*current-user-id* 1]
      (is (= {:row 0 :col 0 :size_x 2 :size_y 1 :kind :text
              :text "### [https://example.com](https://example.com)"}
             (#'pdf/dashcard->cell {:row 0 :col 0 :size_x 2 :size_y 1
                                    :visualization_settings {:virtual_card {:display "link"}
                                                             :link {:url "https://example.com"}}}
                                   []))))))

(deftest iframe-url-test
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

(deftest iframe-card-cell-test
  (testing "an iframe dashcard becomes a clickable link text cell to its target"
    (is (= {:row 0 :col 0 :size_x 4 :size_y 3 :kind :text :text "https://youtu.be/abc"}
           (#'pdf/dashcard->cell {:row 0 :col 0 :size_x 4 :size_y 3
                                  :visualization_settings {:virtual_card {:display "iframe"}
                                                           :iframe "https://youtu.be/abc"}}
                                 [])))))

;; --------------------------------------------------------------------------------------------
;; Parameter bar layout (flow + wrap)
;; --------------------------------------------------------------------------------------------

(deftest layout-param-chips-test
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

(deftest resolve-inline-params-test
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

(deftest visual-order-test
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
      (is (not (re-find #"\?" out))))))

(deftest effective-display-test
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
