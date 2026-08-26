(ns metabase.cmd.markdown-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.markdown :as md]))

(set! *warn-on-reflection* true)

(deftest ^:parallel sentence-test
  (testing "text that doesn't terminate itself gets a period"
    (is (= "Only needed for temporary credentials."
           (md/sentence "Only needed for temporary credentials"))))
  (testing "text that already terminates is left alone, whichever mark it ends on"
    (is (= "Defaults to global." (md/sentence "Defaults to global.")))
    (is (= "Which model?" (md/sentence "Which model?")))
    (is (= "This one doesn't need a period!" (md/sentence "This one doesn't need a period!"))))
  (testing "the endings `add-period` knows about, which a docs page runs into"
    ;; a trailing colon reads as a dangling lead-in once the text is a
    ;; bullet of its own, and a fenced code block must not pick up a period after its closing fence
    (is (= "Pick one of." (md/sentence "Pick one of:")))
    (is (= "Run:\n```\nls\n```" (md/sentence "Run:\n```\nls\n```"))))
  (testing "nothing to say, nothing rendered — a blank `:help` must not become a bare `.`"
    (is (nil? (md/sentence nil)))
    (is (nil? (md/sentence "   ")))))

(deftest ^:parallel joining-test
  (testing "blank parts drop out rather than leaving a gap where they were"
    (is (= "One. Two." (md/sentences ["One." nil "" "Two."])))
    (is (= "One.\n\nTwo." (md/paragraphs ["One." nil "" "Two."])))
    (is (= "- One\n- Two" (md/bullets ["One" nil "" "Two"]))))
  (testing "nothing to join is the empty string, so a caller can pass the result straight to `paragraphs`"
    (is (= "" (md/sentences [])))
    (is (= "" (md/paragraphs [nil ""])))
    (is (= "" (md/bullets [nil ""])))))

(deftest ^:parallel inline-test
  (is (= "`MB_ADMIN_EMAIL`" (md/code "MB_ADMIN_EMAIL")))
  (is (= "**API key**" (md/bold "API key")))
  (is (= "[Where to find this](https://example.com/keys)"
         (md/link "Where to find this" "https://example.com/keys")))
  (testing "headings carry no formatting of their own, so a caller composes what it wants"
    (is (= "## Anthropic" (md/heading 2 "Anthropic")))
    (is (= "### `MB_ADMIN_EMAIL`" (md/heading 3 (md/code "MB_ADMIN_EMAIL"))))))

(deftest ^:parallel thousands-test
  (testing "large numbers are grouped without leaning on the default locale"
    (is (= "1,000,000" (md/thousands 1000000)))
    (is (= "200,000" (md/thousands 200000)))
    (is (= "512" (md/thousands 512)))))

(deftest ^:parallel blockquote-test
  (is (= "> DEPRECATED" (md/blockquote "DEPRECATED")))
  (testing "every line is prefixed, so a quote that runs on stays one quote instead of falling out into body text"
    (is (= "> Only on Pro.\n> Ask your admin." (md/blockquote "Only on Pro.\nAsk your admin.")))))

(deftest ^:parallel document-test
  (testing "a finished page ends in exactly one newline"
    (is (= "One.\n\nTwo.\n" (md/document ["One." nil "Two."]))))
  (testing "a part carrying its own trailing newline keeps the extra blank line it adds — trimming is the caller's call"
    (is (= "Intro\n\n\nBody\n" (md/document ["Intro\n" "Body"])))))

(deftest ^:parallel labeled-block-test
  (testing "a label line over the block it introduces"
    (is (= "Options:\n\n- `-e` - Continue on error"
           (md/labeled-block "Options:" (md/bullets ["`-e` - Continue on error"])))))
  (testing "an empty body leaves the label on its own rather than trailing a blank line"
    (is (= "Options:" (md/labeled-block "Options:" "")))))

(deftest ^:parallel table-test
  (testing "columns are padded to a common width so the raw file stays scannable in a diff"
    (is (= (str "| Model            | Model ID |\n"
                "| ---------------- | -------- |\n"
                "| Claude Haiku 4.5 | `haiku`  |\n"
                "| GPT              | `gpt`    |")
           (md/table ["Model" "Model ID"]
                     [["Claude Haiku 4.5" "`haiku`"] ["GPT" "`gpt`"]]))))
  (testing "a table with no rows still renders its header"
    (is (= (str "| Model |\n"
                "| ----- |")
           (md/table ["Model"] [])))))
