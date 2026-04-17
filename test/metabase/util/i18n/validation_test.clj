(ns metabase.util.i18n.validation-test
  "Regression guard on the built `resources/i18n/*.edn` artifacts. The build pipeline
  (`bin/build/src/i18n/create_artifacts/backend.clj`) filters invalid translations out before
  writing the `.edn`, with a violation report at `target/i18n-violations.csv`. This test asserts
  the filter is doing its job — no shipped translation should fail any of the
  `metabase.util.i18n.validation` predicates.

  When `.edn` files are absent (fresh checkout, no build run), the test no-ops. The CI `i18n`
  workflow runs `./bin/i18n/build-translation-resources` before invoking it."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [clojure.tools.reader.edn :as edn]
   [metabase.util.i18n.impl :as i18n.impl]
   [metabase.util.i18n.validation :as validation]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Unit tests for predicates ------------------------------------------------

(deftest ^:parallel message-format-error-test
  (are [s expected] (= expected (some? (validation/message-format-error s)))
    "Hello {0}"          false
    "Hello"              false
    ""                   false
    "{0} and {1}"        false
    "It''s {0}"          false    ; escaped apostrophe
    "Bad {0 unclosed"    true     ; missing closing brace
    "Bad {x} named"      true     ; non-numeric placeholder
    "Extra { brace"      true)    ; bare opening brace
  (testing "nil input returns nil (no error)"
    (is (nil? (validation/message-format-error nil)))))

(deftest ^:parallel valid-message-format?-test
  (are [s expected] (= expected (validation/valid-message-format? s))
    "Hello {0}"          true
    "{0} and {1}"        true
    "It''s {0}"          true
    "no placeholders"    true
    ""                   true
    "Bad {0 unclosed"    false
    "Extra { brace"      false))

(deftest ^:parallel message-format-arg-count-test
  (are [s expected] (= expected (validation/message-format-arg-count s))
    "Hello"              0
    "{0}"                1
    "{0} and {1}"        2
    "{0} and {0} again"  1      ; duplicate index counts once
    "{0,number,integer}" 1      ; format specifier still counts
    "It''s {0}"          1      ; escaped apostrophe, arg still visible
    "'{0}'"              0      ; apostrophe-escaped braces = literal, no arg
    ""                   0
    nil                  nil    ; nil in, nil out
    "Bad { brace"        nil))  ; invalid pattern returns nil

(deftest ^:parallel skipped-arg-index?-test
  (are [s expected] (= expected (validation/skipped-arg-index? s))
    "{0} {2}"            true    ; skips {1}
    "{1}"                true    ; skips {0}
    "{0} {0}"            true    ; getFormats=2 vs getFormatsByArgumentIndex=1
    "{0} {1}"            false
    "{0}"                false
    "no args"            false
    ""                   false
    nil                  nil     ; nil passthrough
    "Bad { brace"        false)) ; invalid pattern returns false

(deftest ^:parallel regex-arg-indices-test
  (are [s expected] (= expected (validation/regex-arg-indices s))
    "{0} foo {1}"        #{0 1}
    "{0} and {0}"        #{0}        ; deduped
    "{0} {2}"            #{0 2}
    "no args"            #{}
    ""                   #{}
    "{0,number,integer}" #{}         ; regex doesn't match format specifiers
    "you're {0}"         #{0}        ; apostrophe is not special for regex
    nil                  nil))

(deftest ^:parallel regex-arg-count-test
  (are [s expected] (= expected (validation/regex-arg-count s))
    "{0} foo {1}"        2
    "{0} and {0}"        1
    "no args"            0
    ""                   0
    nil                  nil         ; nil in, nil out (matches message-format-arg-count contract)
    "you're {0}"         1))

(deftest ^:parallel regex-skipped-arg-index?-test
  (are [s expected] (= expected (validation/regex-skipped-arg-index? s))
    "{0} {2}"            true     ; skips {1}
    "{1}"                true     ; skips {0}
    "{0} {1}"            false
    "{0}"                false
    "no args"            nil      ; no indices → (and (seq #{}) ...) → nil
    ""                   nil
    nil                  nil))

(deftest ^:parallel arg-count-mismatch-test
  (testing "string input (macro-time path — parses format string)"
    (is (nil? (validation/arg-count-mismatch "{0} {1}" 2))
        "matching count returns nil")
    (is (= {:expected-arg-counts #{2} :actual-arg-count 1}
           (validation/arg-count-mismatch "{0}" 2))
        "fewer args than expected")
    (is (= {:expected-arg-counts #{1} :actual-arg-count 2}
           (validation/arg-count-mismatch "{0} {1}" 1))
        "more args than expected"))
  (testing "integer input (scanner path — pre-computed count)"
    (is (nil? (validation/arg-count-mismatch 2 #{1 2}))
        "actual in acceptable set")
    (is (some? (validation/arg-count-mismatch 3 #{0 1}))
        "actual not in acceptable set"))
  (testing "set-based acceptable counts (plural forms)"
    (is (nil? (validation/arg-count-mismatch 0 [0 1]))
        "0 args matches msgid count")
    (is (nil? (validation/arg-count-mismatch 1 [0 1]))
        "1 arg matches msgid_plural count")
    (is (some? (validation/arg-count-mismatch 2 [0 1]))
        "2 args matches neither"))
  (testing "nil handling"
    (is (nil? (validation/arg-count-mismatch nil 2))
        "nil actual → no mismatch")
    (is (nil? (validation/arg-count-mismatch 1 [nil]))
        "all-nil acceptable → no mismatch")))

(deftest ^:parallel regex-vs-message-format-divergence-test
  (testing "apostrophe escaping — regex sees arg, MessageFormat doesn't"
    (is (= 0 (validation/message-format-arg-count "'{0}'"))
        "MessageFormat: '{0}' is literal")
    (is (= 1 (validation/regex-arg-count "'{0}'"))
        "regex: sees {0} regardless of quotes"))
  (testing "format specifiers — MessageFormat sees arg, regex doesn't"
    (is (= 1 (validation/message-format-arg-count "{0,number,integer}"))
        "MessageFormat: parses format specifier")
    (is (= 0 (validation/regex-arg-count "{0,number,integer}"))
        "regex: doesn't match {0,number,integer}")))

;;; ------------------------------------------- Integration test on built .edn files -------------------------------------------

(defn- locale-resource ^java.net.URL [locale-name]
  (io/resource (format "i18n/%s.edn" locale-name)))

(defn- translated-forms
  "Normalize a translation value into a seq of form-strings. Plural entries are vectors; we drop
  non-string elements defensively so a missing plural form doesn't NPE inside MessageFormat."
  [translated]
  (if (string? translated)
    [translated]
    (filter string? translated)))

(deftest ^:parallel translations-are-valid-message-format-test
  (testing "Every translated string in resources/i18n/*.edn passes the build-time validator"
    (doseq [locale-name          (i18n.impl/available-locale-names)
            :let                 [resource (locale-resource locale-name)]
            :when                resource
            :let                 [messages (-> resource slurp edn/read-string :messages)]
            [english translated] messages
            t                    (translated-forms translated)]
      (testing (format "locale %s, source %s, translated %s" locale-name (pr-str english) (pr-str t))
        (is (validation/valid-message-format? t)
            (format "Translated string is not a valid java.text.MessageFormat pattern — the build filter should have dropped it. Inspect target/i18n-violations.csv. msgid=%s locale=%s"
                    (pr-str english) locale-name))
        (is (not (validation/skipped-arg-index? t))
            (format "Translated string has a skipped/duplicated argument index — the build filter should have dropped it. Inspect target/i18n-violations.csv. msgid=%s locale=%s"
                    (pr-str english) locale-name))))))
