(ns metabase.pulse.render.png-test
  (:require
   [clojure.test :refer :all]
   [hiccup.core :as hiccup]
   [metabase.pulse.render.png :as png]
   [metabase.pulse.render.style :as style])
  (:import
   (java.awt Font GraphicsEnvironment)
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream)
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
  [content width]
  (-> {:content     content
       :attachments {}}
      (png/render-html-to-png width)
      bytes->image))

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
