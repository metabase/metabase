(ns metabase.pulse.markdown-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.markdown :as markdown]
   [metabase.test.util :as tu]))

(defn- slack
  [markdown]
  (markdown/process-markdown markdown :slack))

(defn- escape
  [text]
  (@#'markdown/escape-text text))

(deftest process-markdown-slack-test
  (testing "Headers are converted to bold text"
    (is (= "*header*"          (slack "# header")))
    (is (= "*header*"          (slack "## header")))
    (is (= "*header*"          (slack "### header")))
    (is (= "*header*"          (slack "#### header")))
    (is (= "*header*"          (slack "##### header")))
    (is (= "*header*"          (slack "###### header")))
    (is (= "*header*"          (slack "header\n=========")))
    (is (= "*header*"          (slack "header\n---------")))
    (is (= "*header*\ncontent" (slack "# header\ncontent"))))

  (testing "Bold and italic text uses Slack's syntax"
    (is (= "*bold*"   (slack "**bold**")))
    (is (= "*bold*"   (slack "__bold__")))
    (is (= "_italic_" (slack "*italic*")))
    (is (= "_italic_" (slack "_italic_")))
    (is (= "_*both*_" (slack "***both***")))
    (is (= "*_both_*" (slack "__*both*__")))
    (is (= "*_both_*" (slack "**_both_**")))
    (is (= "_*both*_" (slack "___both___"))))

  (testing "Nested bold or italic only render the top-level syntax"
    (is (= "*bold extra bold*"           (slack "**bold **extra bold****")))
    (is (= "*bold extra extra bold*"     (slack "**bold **extra **extra bold******")))
    (is (= "*bold extra bold*"           (slack "__bold __extra bold____")))
    (is (= "*bold extra extra bold*"     (slack "__bold __extra __extra bold______")))
    (is (= "_italic extra italic_"       (slack "*italic *extra italic**")))
    (is (= "_italic extra extra italic_" (slack "*italic *extra *extra italic***")))
    (is (= "_italic extra italic_"       (slack "_italic _extra italic__")))
    (is (= "_italic extra extra italic_" (slack "_italic _extra _extra italic___"))))

  (testing "Lines are correctly split or joined"
    (is (= "foo bar"  (slack "foo\nbar")))
    (is (= "foo\nbar" (slack "foo\n\nbar")))
    (is (= "foo\nbar" (slack "foo  \nbar")))
    (is (= "foo\nbar" (slack "foo\\\nbar"))))

  (testing "Horizontal lines are created using box drawing characters"
    (is (= "───────────────────"               (slack "----")))
    (is (= "text\n\n───────────────────\ntext" (slack "text\n\n----\ntext"))))

  (testing "Code blocks are preserved"
    (is (= "`code`"                (slack "`code`")))
    (is (= "```\ncode\nblock```"   (slack "    code\n    block")))
    (is (= "```\ncode\nblock\n```" (slack "```\ncode\nblock\n```")))
    (is (= "```\ncode\nblock\n```" (slack "```lang\ncode\nblock\n```")))
    (is (= "```\ncode\nblock\n```" (slack "~~~\ncode\nblock\n~~~"))))

  (testing "Blockquotes are preserved"
    (is (= ">block"               (slack ">block")))
    (is (= ">block"               (slack "> block")))
    (is (= ">block quote"         (slack ">block\n>quote")))
    (is (= ">block quote"         (slack ">block\n>quote")))
    (is (= ">• quoted\n>• list"   (slack "> * quoted\n> * list")))
    (is (= ">1. quoted\n>2. list" (slack "> 1. quoted\n> 1. list")))
    (is (= ">quote\n>• footer"    (slack ">quote\n>- footer"))))

  (testing "Links use Slack's syntax, tooltips are dropped, link formatting is preserved"
    (is (= "<https://metabase.com|Metabase>"   (slack "[Metabase](https://metabase.com)")))
    (is (= "<https://metabase.com|Metabase>"   (slack "[Metabase](https://metabase.com \"tooltip\")")))
    (is (= "<https://metabase.com|_Metabase_>" (slack "[*Metabase*](https://metabase.com)")))
    (is (= "<https://metabase.com|_Metabase_>" (slack "[_Metabase_](https://metabase.com)")))
    (is (= "<https://metabase.com|*Metabase*>" (slack "[**Metabase**](https://metabase.com)")))
    (is (= "<https://metabase.com|*Metabase*>" (slack "[__Metabase__](https://metabase.com)")))
    (is (= "<https://metabase.com|`Metabase`>" (slack "[`Metabase`](https://metabase.com)"))))

  (testing "Relative links are resolved to the current site URL"
    (tu/with-temporary-setting-values [public-settings/site-url "https://example.com"]
      (is (= "<https://example.com/foo|Metabase>"   (slack "[Metabase](/foo)")))))

  (testing "Auto-links are preserved"
    (is (= "<http://metabase.com>"                        (slack "<http://metabase.com>")))
    (is (= "<mailto:test@metabase.com>"                   (slack "<mailto:test@metabase.com>")))
    (is (= "<mailto:test@metabase.com|test@metabase.com>" (slack "<test@metabase.com>"))))

  (testing "Bare URLs and email addresses are parsed as links"
    (is (= "<https://metabase.com>"                       (slack "https://metabase.com")))
    (is (= "<mailto:test@metabase.com|test@metabase.com>" (slack "test@metabase.com"))))

  (testing "Link references render as normal links"
    (is (= "<https://metabase.com|metabase>" (slack "[metabase]: https://metabase.com\n[metabase]")))
    (is (= "<https://metabase.com|Metabase>" (slack "[Metabase]: https://metabase.com\n[Metabase]")))
    (is (= "<https://metabase.com|Metabase>" (slack "[METABASE]: https://metabase.com\n[Metabase]")))
    (is (= "<https://metabase.com|Metabase>" (slack "[Metabase]: https://metabase.com \"tooltip\"\n[Metabase]"))))

  (testing "Lists are rendered correctly using raw text"
    (is (= "• foo\n• bar"   (slack "* foo\n* bar")))
    (is (= "• foo\n• bar"   (slack "- foo\n- bar")))
    (is (= "• foo\n• bar"   (slack "+ foo\n+ bar")))
    (is (= "1. foo\n2. bar" (slack "1. foo\n2. bar")))
    (is (= "1. foo\n2. bar" (slack "1. foo\n1. bar"))))

  (testing "Nested lists are rendered correctly"
    (is (= "1. foo\n    1. bar"                     (slack "1. foo\n   1. bar")))
    (is (= "• foo\n    • bar"                       (slack "* foo\n   * bar")))
    (is (= "1. foo\n    • bar"                      (slack "1. foo\n   * bar")))
    (is (= "• foo\n    1. bar"                      (slack "* foo\n   1. bar")))
    (is (= "• foo\n    1. bar\n    2. baz"          (slack "* foo\n   1. bar\n   2. baz")))
    (is (= "• foo\n    1. bar\n• baz"               (slack "* foo\n   1. bar\n* baz")))
    (is (= "• foo\n    >quote"                      (slack "* foo\n   >quote")))
    (is (= "• foo\n    ```\n    codeblock\n    ```" (slack "* foo\n    ```\n    codeblock\n    ```"))))

  (testing "Characters that are escaped in Markdown are preserved as plain text"
    (is (= "\\" (slack "\\\\")))
    (is (= "/"  (slack "\\/")))
    (is (= "'"  (slack "\\'")))
    (is (= "["  (slack "\\[")))
    (is (= "]"  (slack "\\]")))
    (is (= "("  (slack "\\(")))
    (is (= ")"  (slack "\\)")))
    (is (= "{"  (slack "\\{")))
    (is (= "}"  (slack "\\}")))
    (is (= "#"  (slack "\\#")))
    (is (= "+"  (slack "\\+")))
    (is (= "-"  (slack "\\-")))
    (is (= "."  (slack "\\.")))
    (is (= "!"  (slack "\\!")))
    (is (= "$"  (slack "\\$")))
    (is (= "%"  (slack "\\%")))
    (is (= "^"  (slack "\\^")))
    (is (= "="  (slack "\\=")))
    (is (= "|"  (slack "\\|")))
    (is (= "?"  (slack "\\?"))))

  (testing "Certain characters that are escaped in Markdown are surrounded by zero-width characters for Slack"
    (is (= "\u00ad&\u00ad" (slack "\\&")))
    (is (= "\u00ad>\u00ad" (slack "\\>")))
    (is (= "\u00ad<\u00ad" (slack "\\<")))
    (is (= "\u00ad*\u00ad" (slack "\\*")))
    (is (= "\u00ad_\u00ad" (slack "\\_")))
    (is (= "\u00ad`\u00ad" (slack "\\`"))))

  (testing "Images in Markdown are converted to links, with alt text preserved"
    (is (= "<image.png|[Image]>"           (slack "![](image.png)")))
    (is (= "<image.png|[Image: alt-text]>" (slack "![alt-text](image.png)"))))

  (testing "Image references are treated the same as normal images"
    (is (=  "<image.png|[Image]>"           (slack "![][ref]\n\n[ref]: image.png")))
    (is (=  "<image.png|[Image: alt-text]>" (slack "![alt-text][ref]\n\n[ref]: image.png")))
    (is (=  "<image.png|[Image]>"           (slack "![][Ref]\n\n[REF]: image.png"))))

  (testing "Linked images include link target in parentheses"
    (is (= "<image.png|[Image]>\n(https://metabase.com)"  (slack "[![](image.png)](https://metabase.com)")))
    (is (=  "<image.png|[Image]>\n(https://metabase.com)" (slack "[![][ref]](https://metabase.com)\n\n[ref]: image.png"))))

  (testing "Raw HTML in Markdown is passed through unmodified, aside from angle brackets being
           escaped with zero-width characters"
    (is (= (escape "<h1>header</h1>")              (slack "<h1>header</h1>")))
    (is (= (escape "<em>bold</em>")                (slack "<em>bold</em>")))
    (is (= (escape "<body><h1>header</h1></body>") (slack "<body><h1>header</h1></body>")))
    (is (= (escape "<p>&gt;</p>")                  (slack "<p>&gt;</p>")))
    (is (= (escape "<img src=\"img.png\" />")      (slack "<img src=\"img.png\" />")))
    (is (= (escape "<script>alert(1)</script>")    (slack "<script>alert(1)</script>")))
    (is (= (escape "<h1><!-- comment --></h1>")    (slack "<h1><!-- comment --></h1>")))
    (is (= (escape "<em><!-- comment --></em>")    (slack "<em><!-- comment --></em>")))
    (is (= (escape "<!-- <p>comm\nent</p> -->")    (slack "<!-- <p>comm\nent</p> -->")))
    (is (= (escape "<!-- <p>comm\nent</p> -->")    (slack "<!-- <p>comm\nent</p> -->")))
    (is (= (escape "<!DOCTYPE html>")              (slack "<!DOCTYPE html>"))))

  (testing "HTML entities (outside of HTML tags) are converted to Unicode"
    (is (= "&" (slack "&amp;")))
    (is (= ">" (slack "&gt;")))
    (is (= "ℋ" (slack "&HilbertSpace;"))))

  (testing "Square brackets that aren't used for a link are left as-is (#20993)"
    (is (= "[]"     (slack "[]")))
    (is (= "[test]" (slack "[test]")))))

(defn- html
  [markdown]
  (markdown/process-markdown markdown :html))

(deftest process-markdown-email-test
  (testing "HTML is generated correctly from Markdown input for emails. Not an exhaustive test suite since parsing and
           rendering is fully handled by flexmark."
    (is (= "<h1>header</h1>\n"
           (html "# header")))
    (is (= "<p><strong>bold</strong></p>\n"
           (html "**bold**")))
    (is (= "<p><a href=\"https://metabase.com\" title=\"tooltip\">Metabase</a></p>\n"
           (html "[Metabase](https://metabase.com \"tooltip\")")))
    (is (= "<ol>\n<li>foo\n<ol>\n<li>bar</li>\n</ol>\n</li>\n</ol>\n"
           (html "1. foo\n   1. bar")))
    (is (= "<p>/</p>\n"
           (html "\\/")))
    (doseq [temp-setting ["https://example.com" "https://example.com/"]]
      (tu/with-temporary-setting-values [site-url temp-setting]
        (is (= "<p><img src=\"https://example.com/image.png\" alt=\"alt-text\" /></p>\n"
               (html "![alt-text](/image.png)")))
        (is (= "<p><img src=\"https://example.com/image.png\" alt=\"alt-text\" /></p>\n"
               (html "![alt-text](image.png)")))
        (is (= "<p><a href=\"https://example.com/dashboard/1\">dashboard 1</a></p>\n"
               (html "[dashboard 1](/dashboard/1)"))))))

  (testing "Bare URLs and email addresses are converted to links"
    (is (= "<p><a href=\"https://metabase.com\">https://metabase.com</a></p>\n"
           (html "https://metabase.com")))
    (is (= "<p><a href=\"mailto:test@metabase.com\">test@metabase.com</a></p>\n"
           (html "test@metabase.com"))))

  (testing "Link references render as normal links"
    (is (= "<p><a href=\"https://metabase.com\">metabase</a></p>\n"
           (html "[metabase]: https://metabase.com\n[metabase]"))))

  (testing "Lone square brackets are preserved as-is (#20993)"
    (is (= "<p>[]</p>\n"     (html "[]")))
    (is (= "<p>[test]</p>\n" (html "[test]"))))

  (testing "HTML in the source markdown is escaped properly, but HTML entities are retained"
    (is (= "<p>&lt;h1&gt;header&lt;/h1&gt;</p>\n" (html "<h1>header</h1>")))
    (is (= "<p>&amp;</p>\n"                       (html "&amp;")))))
