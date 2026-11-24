(ns metabase.channel.render.png-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [hiccup.core :as hiccup]
   [metabase.channel.render.png :as png]
   [metabase.channel.render.style :as style]
   [metabase.test :as mt]
   [metabase.util.http :as u.http])
  (:import
   (java.awt Color Font GraphicsEnvironment)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream ByteArrayOutputStream)
   (java.util Base64)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(def ^:private test-table-html-1
  "<table><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Data</td><td>Data</td></tr></table>")

(def ^:private test-table-html-2
  "<html><body style=\"margin: 0; padding: 0; background-color: white;\"><p><div style=\"overflow-x: auto;\"><a href=\"http://localhost:3000/question/2\" rel=\"noopener noreferrer\" style=\"font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; display: block; text-decoration: none;\" target=\"_blank\"><div class=\"pulse-body\" style=\"display: block; margin: 16px;\"><div><table cellpadding=\"0\" cellspacing=\"0\" style=\"max-width: 100%; white-space: nowrap; padding-bottom: 8px; border-collapse: collapse; width: 1%;\"><thead><tr><th style=\"min-width: 42px; color: #949AAB; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-top: 20px; padding-left: 0.375em; padding-bottom: 5px; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #EDF0F1;\">Test URL</th><th style=\"min-width: 42px; color: #949AAB; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-top: 20px; padding-left: 0.375em; padding-bottom: 5px; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #EDF0F1;\">Another Column</th><th style=\"min-width: 42px; color: #949AAB; text-align: right; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-top: 20px; padding-left: 0.375em; padding-bottom: 5px; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #EDF0F1;\">Test Version ID</th></tr></thead><tbody><tr style=\"color: #7C8381;\"><td style=\"color: #4C5773; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-left: 0.375em; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #F0F0F04D;\">test.example.com</td><td style=\"color: #4C5773; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-left: 0.375em; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #F0F0F04D;\">this-is-a-test-value</td><td style=\"color: #4C5773; text-align: right; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-left: 0.375em; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #F0F0F04D;\">123</td></tr></tbody></table></div></div></a></div></p></body></html>")

(deftest table-width-test
  (testing "The PNG of a table should be cropped to the width of its content"
    (let [^BufferedImage png (#'png/render-to-png test-table-html-1 1200)]
      ;; Check that width is within a range, since actual rendered result can very slightly by environment
      (is (< 140 (.getWidth png) 210))))
  (testing "The PNG of a table should not clip any of its content"
    (let [^BufferedImage png (#'png/render-to-png test-table-html-2 1200)]
      (is (< 320 (.getWidth png) 360)))))

(deftest installed-fonts-test
  (testing "Are the correct fonts available for rendering?"
    (is (contains?
         (into #{} (map #(.getName ^Font %)) (.getAllFonts (GraphicsEnvironment/getLocalGraphicsEnvironment)))
         "Lato Regular"))))

(defn- bytes->image
  [bytes]
  (let [input-stream (ByteArrayInputStream. bytes)]
    (ImageIO/read input-stream)))

(defn- render-without-wrapping
  [content width]
  (-> [:html
       [:body {:style (style/style
                       {:font-family      "Lato, 'Helvetica Neue', 'Lucida Grande', sans-serif"
                        :margin           0
                        :padding          0
                        :background-color :white})}
        content]]
      hiccup/html
      (#'png/render-to-png width)))

(defn- render-with-wrapping
  ([content width]
   (render-with-wrapping content width nil))
  ([content width options]
   (-> {:content     content
        :attachments {}}
       (png/render-html-to-png width options)
       bytes->image)))

(deftest wrap-non-lato-characters-test
  (testing "HTML Content inside tables with characters not supported by the Lato font are wrapped in a span."
    (is (= [:td {:not-wrapped-in-here "안녕"}
            [:span {:style "font-family: sans-serif;"} "안녕"]]
           (#'png/wrap-non-lato-chars [:td {:not-wrapped-in-here "안녕"} "안녕"])))
    (is (= [:table
            [:tr
             [:td "this is all Lato-compatible, baby!"]
             [:td "What do you think about різні шрифти в одному документі?"]
             [:td [:span {:style "font-family: sans-serif;"} "This part's English. This part is 英語ではありません"]]]]
           (#'png/wrap-non-lato-chars
            [:table
             [:tr
              [:td "this is all Lato-compatible, baby!"]
              [:td "What do you think about різні шрифти в одному документі?"]
              [:td "This part's English. This part is 英語ではありません"]]])))))

(deftest non-lato-characters-can-render-test
  (testing "Strings containing characters that are not included in the Lato font can still be rendered."
    (let [content                       [:span "안녕"]
          ^BufferedImage broken-render  (render-without-wrapping content 200)
          ^BufferedImage working-render (render-with-wrapping content 200)]
      ;; The broken-render's width is around 17px. It is the width of 2 `[?]` charaters
      ;; We assert that the working render is wider based on the assumption (verified manually by
      ;; actually looking at the rendered images) that the correctly rendered glyphs are wider.
      (is (< (.getWidth broken-render) (.getWidth working-render))))))

(deftest render-html-to-png-scale-test
  (testing "the :channel.render/scale option supersamples the raster without changing layout"
    (let [content              [:div {:style "width: 100px; height: 40px;"} "hello"]
          ^BufferedImage png1x (render-with-wrapping content 200)
          ^BufferedImage png2x (render-with-wrapping content 200 {:channel.render/scale 2.0})]
      (is (= (* 2 (.getWidth png1x)) (.getWidth png2x)))
      (is (= (* 2 (.getHeight png1x)) (.getHeight png2x))))))

(deftest render-html-to-png-scale-fn-test
  (testing "a function :channel.render/scale is handed the laid-out content size and its factor applied"
    (let [content              [:div {:style "width: 100px; height: 40px;"} "hello"]
          ^BufferedImage png1x (render-with-wrapping content 200)
          seen                 (atom nil)
          ^BufferedImage png3x (render-with-wrapping content 200
                                                     {:channel.render/scale (fn [w h]
                                                                              (reset! seen [w h])
                                                                              3.0)})]
      (testing "it sees the dimensions a 1:1 render would have produced"
        (is (= [(.getWidth png1x) (.getHeight png1x)] @seen)))
      (testing "and the factor it returns is what the raster is scaled by"
        (is (= (* 3 (.getWidth png1x)) (.getWidth png3x)))
        (is (= (* 3 (.getHeight png1x)) (.getHeight png3x)))))))

(defn- edge-alphas
  "The set of alpha values along `img`'s last column and last row."
  [^BufferedImage img]
  (let [w     (.getWidth img)
        h     (.getHeight img)
        alpha (fn [x y] (bit-and (bit-shift-right (.getRGB img x y) 24) 0xFF))]
    (into (sorted-set)
          (concat (map #(alpha (dec w) %) (range h))
                  (map #(alpha % (dec h)) (range w))))))

(deftest render-html-to-png-fractional-scale-edge-test
  (testing "a fractional scale leaves no unpainted edge -- the canvas never reaches past what CSSBox paints"
    ;; A canvas rounded *up* to a whole pixel leaves its last row/column transparent, which viewers that
    ;; resample without premultiplying (poppler) fringe grey. Only fractional factors hit this; an integer
    ;; one lands the paint exactly on the canvas edge.
    (let [content [:div {:style "width: 137px; height: 43px;"} "hello"]]
      (doseq [factor [1.4667844117506315 1.5964107160215022 2.000303023900741 3.9005602730645073]]
        (testing (str "scale " factor)
          (is (= #{255}
                 (edge-alphas (render-with-wrapping content 233 {:channel.render/scale factor})))))))))

(defn- red-png-bytes
  "A 20x20 solid #FF0000 PNG."
  ^bytes []
  (let [img (BufferedImage. 20 20 BufferedImage/TYPE_INT_RGB)]
    (doto (.createGraphics img)
      (.setColor Color/RED)
      (.fillRect 0 0 20 20)
      .dispose)
    (with-open [os (ByteArrayOutputStream.)]
      (ImageIO/write img "png" os)
      (.toByteArray os))))

(defn- red-pixel?
  [rgb]
  (let [r (bit-and (bit-shift-right rgb 16) 0xFF)
        g (bit-and (bit-shift-right rgb 8) 0xFF)
        b (bit-and rgb 0xFF)]
    (and (> r 200) (< g 60) (< b 60))))

(defn- has-red-pixel?
  "Whether any of `img`'s pixels came from the red test image -- i.e. whether the `<img>` actually loaded."
  [^BufferedImage img]
  (boolean (some red-pixel?
                 (for [x (range (.getWidth img))
                       y (range (.getHeight img))]
                   (.getRGB img x y)))))

(defn- render-img
  "Render a lone `<img>` of `src` at its natural 20x20 size."
  ^BufferedImage [src]
  (#'png/render-to-png (str "<html><body style=\"margin: 0; padding: 0;\">"
                            "<img src=\"" src "\" width=\"20\" height=\"20\">"
                            "</body></html>")
                       100))

(defn- render-with-head
  "Render a 20x20 div, with `head` injected into the document's `<head>`."
  ^BufferedImage [head]
  (#'png/render-to-png (str "<html><head>" head "</head>"
                            "<body style=\"margin: 0; padding: 0;\">"
                            "<div style=\"width: 20px; height: 20px;\">x</div>"
                            "</body></html>")
                       100))

(defn- red-data-uri []
  (str "data:image/png;base64," (.encodeToString (Base64/getEncoder) (red-png-bytes))))

(deftest data-uri-image-renders-test
  (testing "a `data:` image URI -- how our own chart images are embedded -- still renders"
    (is (true? (has-red-pixel? (render-img (red-data-uri)))))))

(deftest file-scheme-image-not-loaded-test
  (testing "a `file:` image URL is never read off the server's disk"
    (mt/with-temp-file [path "sec-872-red.png"]
      (with-open [os (io/output-stream path)]
        (.write os (red-png-bytes)))
      (is (false? (has-red-pixel? (render-img (str "file://" path))))))))

(deftest https-image-goes-through-hardened-fetch-test
  (testing "an `https:` image URL is fetched only through the SSRF-hardened fetcher"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [u.http/fetch-bytes (fn [url opts]
                                                       (swap! calls conj [url opts])
                                                       {:bytes (red-png-bytes) :content-type "image/png"})]
        (is (true? (has-red-pixel? (render-img "https://example.com/red.png"))))
        (is (= ["https://example.com/red.png"] (mapv first @calls)))
        (is (contains? (:allowed-content-types (second (first @calls))) "image/png"))))))

(deftest non-https-schemes-never-fetched-test
  (testing "no other scheme reaches the network or the filesystem"
    (mt/with-temp-file [path "sec-872-red-2.png"]
      (with-open [os (io/output-stream path)]
        (.write os (red-png-bytes)))
      (doseq [src ["http://example.com/red.png"
                   (str "file://" path)
                   (str "jar:file://" path "!/red.png")
                   "ftp://example.com/red.png"
                   "cid:red.png"]]
        (testing src
          (let [calls (atom [])]
            (mt/with-dynamic-fn-redefs [u.http/fetch-bytes (fn [url opts]
                                                             (swap! calls conj [url opts])
                                                             {:bytes (red-png-bytes) :content-type "image/png"})]
              (is (false? (has-red-pixel? (render-img src))))
              (is (= [] @calls)))))))))

(deftest https-image-refused-renders-without-it-test
  (testing "when the hardened fetch refuses the URL the render succeeds with no image"
    (mt/with-dynamic-fn-redefs [u.http/fetch-bytes (constantly nil)]
      (let [^BufferedImage img (render-img "https://10.0.0.1/red.png")]
        (is (false? (has-red-pixel? img)))
        (is (pos? (.getWidth img)))))))

(deftest external-stylesheet-not-loaded-test
  (testing "a stylesheet URL is never fetched -- jStyleParser retrieves those itself, outside the BrowserConfig"
    (mt/with-temp-file [path "sec-872-style.css"]
      (spit path "div { background-color: #FF0000; }")
      (let [url (str "file://" path)]
        (testing "an inline <style> block still applies, so the probe below can tell loading from not loading"
          (is (true? (has-red-pixel? (render-with-head "<style>div { background-color: #FF0000; }</style>")))))
        (testing "<link rel=stylesheet>"
          (is (false? (has-red-pixel? (render-with-head (str "<link rel=\"stylesheet\" href=\"" url "\">"))))))
        (testing "@import inside a <style> block"
          (is (false? (has-red-pixel? (render-with-head (str "<style>@import url(\"" url "\");</style>"))))))))))
