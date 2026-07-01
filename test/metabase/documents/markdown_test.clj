(ns metabase.documents.markdown-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.markdown :as documents.markdown]))

(defn- content [markdown]
  (:content (documents.markdown/markdown->prose-mirror markdown)))

(deftest empty-input-test
  (testing "nil and empty input produce an empty doc"
    (is (= {:type "doc" :content []} (documents.markdown/markdown->prose-mirror "")))
    (is (= {:type "doc" :content []} (documents.markdown/markdown->prose-mirror nil)))))

(deftest headings-test
  (testing "ATX headings carry their level"
    (is (= [{:type "heading" :attrs {:level 1} :content [{:type "text" :text "Title"}]}
            {:type "heading" :attrs {:level 2} :content [{:type "text" :text "Sub"}]}]
           (content "# Title\n\n## Sub")))))

(deftest paragraph-and-marks-test
  (testing "inline marks: bold, italic, inline code"
    (is (= [{:type "paragraph"
             :content [{:type "text" :text "a "}
                       {:type "text" :text "bold" :marks [{:type "bold"}]}
                       {:type "text" :text " "}
                       {:type "text" :text "italic" :marks [{:type "italic"}]}
                       {:type "text" :text " "}
                       {:type "text" :text "code" :marks [{:type "code"}]}]}]
           (content "a **bold** *italic* `code`"))))
  (testing "links become a link mark carrying the href"
    (is (= [{:type "paragraph"
             :content [{:type "text" :text "see "}
                       {:type "text" :text "here"
                        :marks [{:type "link" :attrs {:href "https://example.com"}}]}]}]
           (content "see [here](https://example.com)")))))

(deftest lists-test
  (testing "bulleted list"
    (is (= [{:type "bulletList"
             :content [{:type "listItem" :content [{:type "paragraph" :content [{:type "text" :text "one"}]}]}
                       {:type "listItem" :content [{:type "paragraph" :content [{:type "text" :text "two"}]}]}]}]
           (content "- one\n- two"))))
  (testing "numbered list"
    (is (= "orderedList" (:type (first (content "1. one\n2. two")))))))

(deftest code-block-test
  (testing "fenced code block keeps language and literal content"
    (is (= [{:type "codeBlock" :attrs {:language "sql"}
             :content [{:type "text" :text "select 1"}]}]
           (content "```sql\nselect 1\n```")))))

(deftest blockquote-and-rule-test
  (testing "blockquote wraps paragraphs"
    (is (= [{:type "blockquote"
             :content [{:type "paragraph" :content [{:type "text" :text "quoted"}]}]}]
           (content "> quoted"))))
  (testing "thematic break becomes a horizontal rule"
    (is (= [{:type "horizontalRule"}]
           (content "---")))))

(deftest card-embed-test
  (testing "a standalone {{card:id}} paragraph becomes a cardEmbed node"
    (is (= [{:type "cardEmbed" :attrs {:id 42 :name nil}}]
           (content "{{card:42}}")))
    (is (= [{:type "cardEmbed" :attrs {:id 7 :name nil}}]
           (content "{{ card : 7 }}"))))
  (testing "a cardEmbed can sit between prose blocks"
    (is (= [{:type "heading" :attrs {:level 1} :content [{:type "text" :text "Report"}]}
            {:type "cardEmbed" :attrs {:id 9 :name nil}}
            {:type "paragraph" :content [{:type "text" :text "after"}]}]
           (content "# Report\n\n{{card:9}}\n\nafter"))))
  (testing "card directive embedded mid-sentence stays plain text"
    (is (= [{:type "paragraph" :content [{:type "text" :text "see {{card:1}} here"}]}]
           (content "see {{card:1}} here")))))
