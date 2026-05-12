(ns metabase.comments.render-test
  (:require
   [clojure.test :refer :all]
   [metabase.comments.render :as render]
   [metabase.test :as mt]))

(deftest content->html-basic-test
  (testing "nil content returns nil"
    (is (nil? (render/content->html nil))))

  (testing "empty doc"
    (is (= "" (render/content->html {:type "doc" :content []}))))

  (testing "simple paragraph"
    (is (= "<p>Hello world</p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type "text" :text "Hello world"}]}]}))))

  (testing "paragraph with no content"
    (is (= "<p></p>"
           (render/content->html {:type    "doc"
                                  :content [{:type "paragraph"}]})))))

(deftest content->html-marks-test
  (testing "bold text"
    (is (= "<p><strong>bold</strong></p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "bold"
                                                        :marks [{:type "bold"}]}]}]}))))

  (testing "italic text"
    (is (= "<p><em>italic</em></p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "italic"
                                                        :marks [{:type "italic"}]}]}]}))))

  (testing "multiple marks"
    (is (= "<p><em><strong>bold italic</strong></em></p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "bold italic"
                                                        :marks [{:type "bold"}
                                                                {:type "italic"}]}]}]}))))

  (testing "link marks are stripped, text preserved"
    (is (= "<p>click</p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "click"
                                                        :marks [{:type  "link"
                                                                 :attrs {:href "https://example.com"}}]}]}]}))))

  (testing "strike and code marks"
    (is (= "<p><s>deleted</s> and <code>code</code></p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "deleted"
                                                        :marks [{:type "strike"}]}
                                                       {:type "text" :text " and "}
                                                       {:type  "text"
                                                        :text  "code"
                                                        :marks [{:type "code"}]}]}]})))))

(deftest content->html-block-nodes-test
  (testing "heading"
    (is (= "<h2>Title</h2>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "heading"
                                             :attrs   {:level 2}
                                             :content [{:type "text" :text "Title"}]}]}))))

  (testing "bullet list"
    (is (= "<ul><li><p>one</p></li><li><p>two</p></li></ul>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "bulletList"
                                             :content [{:type    "listItem"
                                                        :content [{:type    "paragraph"
                                                                   :content [{:type "text" :text "one"}]}]}
                                                       {:type    "listItem"
                                                        :content [{:type    "paragraph"
                                                                   :content [{:type "text" :text "two"}]}]}]}]}))))

  (testing "ordered list"
    (is (= "<ol><li><p>first</p></li></ol>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "orderedList"
                                             :content [{:type    "listItem"
                                                        :content [{:type    "paragraph"
                                                                   :content [{:type "text" :text "first"}]}]}]}]}))))

  (testing "code block"
    (is (= "<pre><code>fn main()</code></pre>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "codeBlock"
                                             :content [{:type "text" :text "fn main()"}]}]}))))

  (testing "blockquote"
    (is (= "<blockquote><p>quoted</p></blockquote>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "blockquote"
                                             :content [{:type    "paragraph"
                                                        :content [{:type "text" :text "quoted"}]}]}]}))))

  (testing "hard break"
    (is (= "<p>line1<br />line2</p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type "text" :text "line1"}
                                                       {:type "hardBreak"}
                                                       {:type "text" :text "line2"}]}]}))))

  (testing "horizontal rule"
    (is (= "<hr />"
           (render/content->html {:type    "doc"
                                  :content [{:type "horizontalRule"}]})))))

(deftest content->html-smart-link-test
  (testing "smartLink for card renders URL from model + entityId"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (is (= "<a href=\"http://localhost:3000/question/42\">My Question</a>"
             (render/content->html {:type    "doc"
                                    :content [{:type  "smartLink"
                                               :attrs {:entityId 42
                                                       :model    "card"
                                                       :label    "My Question"
                                                       :href     "/question/42"}}]})))))

  (testing "smartLink user mention renders as plain text (no link)"
    (is (= "@42"
           (render/content->html {:type    "doc"
                                  :content [{:type  "smartLink"
                                             :attrs {:entityId 42
                                                     :model    "user"}}]}))))

  (testing "smartLink ignores href — phishing URL cannot be injected"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (is (= "<a href=\"http://localhost:3000/question/1\">Phishing</a>"
             (render/content->html {:type    "doc"
                                    :content [{:type  "smartLink"
                                               :attrs {:entityId 1
                                                       :model    "card"
                                                       :label    "Phishing"
                                                       :href     "https://evil.example"}}]}))))))

(deftest content->html-xss-test
  (testing "HTML in text content is escaped"
    (is (= "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type "text"
                                                        :text "<script>alert(1)</script>"}]}]}))))

  (testing "phishing link via crafted content JSON is stripped"
    (is (= "<p>Please re-authenticate</p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "Please re-authenticate"
                                                        :marks [{:type  "link"
                                                                 :attrs {:href "https://evil.example"}}]}]}]}))))

  (testing "unknown mark types are stripped"
    (is (= "<p>text</p>"
           (render/content->html {:type    "doc"
                                  :content [{:type    "paragraph"
                                             :content [{:type  "text"
                                                        :text  "text"
                                                        :marks [{:type "evilMark"}]}]}]}))))

  (testing "HTML in smartLink label is escaped"
    (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
      (is (= "<a href=\"http://localhost:3000/question/1\">&lt;img src=x&gt;</a>"
             (render/content->html {:type    "doc"
                                    :content [{:type  "smartLink"
                                               :attrs {:entityId 1
                                                       :model    "card"
                                                       :label    "<img src=x>"}}]})))))

  (testing "smartLink with unknown model renders as plain text"
    (is (= "My Thing"
           (render/content->html {:type    "doc"
                                  :content [{:type  "smartLink"
                                             :attrs {:entityId 1
                                                     :model    "unknown"
                                                     :label    "My Thing"}}]})))))

(deftest content->html-unknown-nodes-test
  (testing "unknown node type is dropped entirely"
    (is (= ""
           (render/content->html {:type    "doc"
                                  :content [{:type    "futureNodeType"
                                             :content [{:type    "paragraph"
                                                        :content [{:type "text" :text "still works"}]}]}]}))))

  (testing "unknown node type without children is dropped"
    (is (= ""
           (render/content->html {:type    "doc"
                                  :content [{:type "futureNodeType"}]})))))
