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
