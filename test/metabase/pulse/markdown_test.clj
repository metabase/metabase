(ns metabase.pulse.markdown-test
  "Tests for processing Markdown to mrkdwn for Slack, and HTML for email. Assertions that are commented
  out are known discrepencies between the markdown-clj library and the Markdown parser used by the frontend."
  (:require [clojure.test :refer :all]
            [metabase.pulse.markdown :as md]))

(defn- mrkdwn
  [markdown]
  (md/process-markdown markdown :slack))

(deftest process-markdown-slack-test
  (testing "Headers are converted to bold text"
    (is (= "*header*" (mrkdwn "# header")))
    (is (= "*header*" (mrkdwn "## header")))
    (is (= "*header*" (mrkdwn "### header")))
    (is (= "*header*" (mrkdwn "#### header")))
    (is (= "*header*" (mrkdwn "##### header")))
    (is (= "*header*" (mrkdwn "###### header")))
    (is (= "*header*" (mrkdwn "header\n=========")))
    (is (= "*header*" (mrkdwn "header\n---------"))))

  (testing "Bold and italic text uses Slack's syntax"
    (is (= "*bold*"   (mrkdwn "**bold**")))
    (is (= "*bold*"   (mrkdwn "__bold__")))
    (is (= "_italic_" (mrkdwn "*italic*")))
    (is (= "_italic_" (mrkdwn "_italic_")))
    (is (= "*_both_*" (mrkdwn "***both***")))
    (is (= "*_both_*" (mrkdwn "__*both*__")))
    (is (= "*_both_*" (mrkdwn "**_both_**"))))
    ;; (is (= "*_both_*" (mrkdwn "___both___"))))

  (testing "Lines are correctly split or joined"
    (is (= "foo bar"   (mrkdwn "foo\nbar")))
    (is (= "foo\nbar"  (mrkdwn "foo\n\nbar")))
    (is (= "foo\n bar" (mrkdwn "foo  \nbar"))))
    ; (is (= "foo\n bar" (mrkdwn "foo\\\nbar"))))

  (testing "Code blocks are preserved"
    (is (= "`code`"                (mrkdwn "`code`")))
    (is (= "```\ncode\nblock```"   (mrkdwn "    code\n    block")))
    (is (= "```\ncode\nblock\n```" (mrkdwn "```\ncode\nblock\n```")))
    (is (= "```\ncode\nblock\n```" (mrkdwn "```lang\ncode\nblock\n```"))))
    ;; (is (= "```\ncode\nblock\n```" (mrkdwn "~~~\ncode\nblock\n~~~"))))

  (testing "Blockquotes are preserved"
    (is (= ">block "              (mrkdwn ">block")))
    (is (= "> block "             (mrkdwn "> block")))
    (is (= ">block quote "        (mrkdwn ">block\n>quote")))
    (is (= ">block quote "        (mrkdwn ">block\n>quote")))
    (is (= ">quote \n>• footer"   (mrkdwn ">quote\n>- footer"))))

  (testing "Links use Slack's syntax, tooltips are dropped, and link formatting is preserved"
    (is (= "<metabase.com|Metabase>"   (mrkdwn "[Metabase](metabase.com)")))
    (is (= "<metabase.com|Metabase>"   (mrkdwn "[Metabase](metabase.com tooltip)")))
    (is (= "<metabase.com>"            (mrkdwn "<metabase.com>")))
    (is (= "<metabase.com>"            (mrkdwn "<metabase.com>")))
    (is (= "<metabase.com|_Metabase_>" (mrkdwn "[*Metabase*](metabase.com)")))
    (is (= "<metabase.com|_Metabase_>" (mrkdwn "[_Metabase_](metabase.com)")))
    (is (= "<metabase.com|*Metabase*>" (mrkdwn "[**Metabase**](metabase.com)")))
    (is (= "<metabase.com|*Metabase*>" (mrkdwn "[__Metabase__](metabase.com)")))
    (is (= "<metabase.com|`Metabase`>" (mrkdwn "[`Metabase`](metabase.com)"))))

  (testing "Lists are rendered correctly using raw text"
    (is (= "• foo\n• bar"   (mrkdwn "* foo\n* bar")))
    (is (= "• foo\n• bar"   (mrkdwn "- foo\n- bar")))
    (is (= "• foo\n• bar"   (mrkdwn "+ foo\n+ bar")))
    (is (= "1. foo\n2. bar" (mrkdwn "1. foo\n2. bar")))
    (is (= "1. foo\n2. bar" (mrkdwn "1. foo\n1. bar"))))

  (testing "Nested lists are rendered correctly"
    (is (= "1. foo\n    1. bar"                     (mrkdwn "1. foo\n   1. bar")))
    (is (= "• foo\n    • bar"                       (mrkdwn "* foo\n   * bar")))
    (is (= "1. foo\n    • bar"                      (mrkdwn "1. foo\n   * bar")))
    (is (= "• foo\n    1. bar"                      (mrkdwn "* foo\n   1. bar")))
    (is (= "• foo\n    1. bar\n    2. baz"          (mrkdwn "* foo\n   1. bar\n   2. baz")))
    (is (= "• foo\n    1. bar\n• baz"               (mrkdwn "* foo\n   1. bar\n* baz")))
    (is (= "• foo   > quote"                        (mrkdwn "* foo\n   > quote")))
    (is (= "• foo\n    ```\n    codeblock\n    ```" (mrkdwn "* foo\n   ```\ncodeblock\n```"))))

  (testing "HTML in input is not converted to Markdown"
    (is (= "<h1>header</h1>" (mrkdwn "<h1>header</h1>"))))

  (testing "Certain characters that are escaped in Markdown are surrounded by zero-width characters for Slack"
    (is (= "\u00ad*\u00adfoo\u00ad*\u00ad" (mrkdwn "\\*foo\\*")))
    (is (= "\u00ad_\u00adfoo\u00ad_\u00ad" (mrkdwn "\\_foo\\_")))
    (is (= "\u00ad`\u00adfoo\u00ad`\u00ad" (mrkdwn "\\`foo\\`"))))

  (testing "Images in Markdown are converted to links, with alt text preserved"
    (is (= "<image.png|[Image]>"           (mrkdwn "![](image.png)")))
    (is (= "<image.png|[Image: alt-text]>" (mrkdwn "![alt-text](image.png)"))))

  (testing "Linked images include link target in parentheses"
    (is (= "<image.png|[Image]>\n(metabase.com)"           (mrkdwn "[![](image.png)](metabase.com)")))
    (is (= "<image.png|[Image: alt-text]>\n(metabase.com)" (mrkdwn "[![alt-text](image.png)](metabase.com)")))))
