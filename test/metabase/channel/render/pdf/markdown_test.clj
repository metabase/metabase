(ns metabase.channel.render.pdf.markdown-test
  "Tests for the Markdown -> styled-runs/blocks parsing that feeds the backend PDF renderer."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.pdf.markdown :as md]))

;; --------------------------------------------------------------------------------------------
;; Furigana {base|reading} parsing
;; --------------------------------------------------------------------------------------------

(deftest ^:parallel parse-ruby-test
  (let [strip (fn [runs]
                (mapv #(dissoc % :href) runs))]
    (testing "{base|reading} becomes a ruby run; surrounding text stays as text runs"
      (is (= [{:ruby?   true
               :base    "参加希望"
               :reading "さんかきぼう"}
              {:text    "の方は"}]
             (strip (#'md/parse-ruby "{参加希望|さんかきぼう}の方は" {} nil)))))
    (testing "multiple furigana groups interleaved with text"
      (is (= [{:text "a"} {:ruby? true :base "x" :reading "y"}
              {:text "b"} {:ruby? true :base "c" :reading "d"}]
             (strip (#'md/parse-ruby "a{x|y}b{c|d}" {} nil)))))
    (testing "plain text without ruby is a single text run"
      (is (= [{:text "hello world"}]
             (strip (#'md/parse-ruby "hello world" {} nil)))))
    (testing "braces without a pipe are not treated as ruby"
      (is (= [{:text "{not ruby}"}]
             (strip (#'md/parse-ruby "{not ruby}" {} nil)))))
    (testing "the run's style keys are carried onto base/reading runs"
      (is (= [{:bold?   true
               :ruby?   true
               :base    "x"
               :reading "y"}]
             (strip (#'md/parse-ruby "{x|y}" {:bold? true} nil)))))))
