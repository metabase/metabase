(ns metabase.pulse.render.png-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.png :as png]))

(set! *warn-on-reflection* true)

(def ^:private test-table-html-1
  "<table><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Data</td><td>Data</td></tr></table>")

(def ^:private test-table-html-2
  "<html><body style=\"margin: 0; padding: 0; background-color: white;\"><p><div style=\"overflow-x: auto;\"><a href=\"http://localhost:3000/question/2\" rel=\"noopener noreferrer\" style=\"font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; display: block; text-decoration: none;\" target=\"_blank\"><div class=\"pulse-body\" style=\"display: block; margin: 16px;\"><div><table cellpadding=\"0\" cellspacing=\"0\" style=\"max-width: 100%; white-space: nowrap; padding-bottom: 8px; border-collapse: collapse; width: 1%;\"><thead><tr><th style=\"min-width: 42px; color: #949AAB; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-top: 20px; padding-left: 0.375em; padding-bottom: 5px; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #EDF0F1;\">Test URL</th><th style=\"min-width: 42px; color: #949AAB; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-top: 20px; padding-left: 0.375em; padding-bottom: 5px; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #EDF0F1;\">Another Column</th><th style=\"min-width: 42px; color: #949AAB; text-align: right; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-top: 20px; padding-left: 0.375em; padding-bottom: 5px; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #EDF0F1;\">Test Version ID</th></tr></thead><tbody><tr style=\"color: #7C8381;\"><td style=\"color: #4C5773; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-left: 0.375em; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #F0F0F04D;\">test.example.com</td><td style=\"color: #4C5773; text-align: left; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-left: 0.375em; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #F0F0F04D;\">this-is-a-test-value</td><td style=\"color: #4C5773; text-align: right; font-size: 12px; font-weight: 700; padding-right: 0.375em; padding-left: 0.375em; font-family: Lato, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; height: 28px; border-bottom: 1px solid #F0F0F04D;\">123</td></tr></tbody></table></div></div></a></div></p></body></html>")

(deftest table-width-test
  (testing "The PNG of a table should be cropped to the width of its content"
    (let [^java.awt.image.BufferedImage png (@#'png/render-to-png test-table-html-1 1200)]
      ;; Check that width is within a range, since actual rendered result can very slightly by environment
      (is (< 140 (.getWidth png) 210))))
  (testing "The PNG of a table should not clip any of its content"
    (let [^java.awt.image.BufferedImage png (@#'png/render-to-png test-table-html-2 1200)]
      (is (< 320 (.getWidth png) 360)))))

(deftest installed-fonts-test
  (testing "Are the correct fonts available for rendering?"
    (is (= []
           (mapv #(.getName %) (.getAllFonts (java.awt.GraphicsEnvironment/getLocalGraphicsEnvironment)))))))
