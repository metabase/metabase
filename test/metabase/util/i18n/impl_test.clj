(ns ^:mb/once metabase.util.i18n.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.models.setting :as setting]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.i18n :as i18n]
   [metabase.util.i18n.impl :as i18n.impl])
  (:import
   (java.util Locale)))

(set! *warn-on-reflection* true)

(deftest ^:parallel normalized-locale-string-test
  (doseq [[s expected] {"en"      "en"
                        "EN"      "en"
                        "En"      "en"
                        "en_US"   "en_US"
                        "en-US"   "en_US"
                        nil       nil
                        "en--"    nil
                        "a"       nil
                        "eng-USA" nil}]
    (testing (pr-str (list 'normalized-locale-string s))
      (is (= expected
             (i18n.impl/normalized-locale-string s))))))

(deftest ^:parallel locale-test
  (testing "Should be able to coerce various types of objects to Locales"
    (doseq [arg-type [:str :keyword]
            country   ["en" "En" "EN"]
            language  ["us" "Us" "US" nil]
            separator (when language
                        (concat ["_" "-"] (when (= arg-type :keyword) ["/"])))
            :let      [s (str country (when language (str separator language)))
                       x (case arg-type
                           :str     s
                           :keyword (keyword s))]]
      (testing (pr-str (list 'locale x))
        (is (= (Locale/forLanguageTag (if language "en-US" "en"))
               (i18n.impl/locale x)))))

    (testing "If something is already a Locale, `locale` should act as an identity fn"
      (is (= (Locale/forLanguageTag "en-US")
             (i18n.impl/locale #locale "en-US")))))

  (testing "nil"
    (is (= nil
           (i18n.impl/locale nil)))))

(deftest ^:parallel available-locale?-test
  (doseq [[locale expected] {"en"      true
                             "EN"      true
                             "en-US"   true
                             "en_US"   true
                             nil       false
                             ""        false
                             "en_en"   false
                             "abc_def" false
                             "eng_usa" false}]
    (testing (pr-str (list 'available-locale? locale))
      (is (= expected
             (i18n.impl/available-locale? locale))))))

(deftest ^:parallel fallback-locale-test
  (doseq [[locale expected] {nil                             nil
                             :es                             nil
                             "es"                            nil
                             (Locale/forLanguageTag "es")    nil
                             "es-MX"                         (Locale/forLanguageTag "es")
                             "es_MX"                         (Locale/forLanguageTag "es")
                             :es/MX                          (Locale/forLanguageTag "es")
                             (Locale/forLanguageTag "es-MX") (Locale/forLanguageTag "es")
                             ;; 0.39 changed pt to pt_BR (metabase#15630)
                             "pt"                            (Locale/forLanguageTag "pt-BR")
                             "pt-PT"                         (Locale/forLanguageTag "pt-BR")}]
    (testing locale
      (is (= expected
             (i18n.impl/fallback-locale locale))))))

(deftest ^:parallel graceful-fallback-test
  (testing "If a resource bundle doesn't exist, we should gracefully fall back to English"
    (is (= "Translate me 100"
           (i18n.impl/translate "zz" "Translate me {0}" [100])))))

(deftest translate-test
  (mt/with-mock-i18n-bundles  {"es"    {:messages
                                        {"Your database has been added!"  "¡Tu base de datos ha sido añadida!"
                                         "I''m good thanks"               "Está bien, gracias"
                                         "must be {0} characters or less" "deben tener {0} caracteres o menos"}}
                               "es_MX" {:messages
                                        {"I''m good thanks" "Está muy bien, gracias"}}}
    (testing "Should be able to translate stuff"
      (is (= "¡Tu base de datos ha sido añadida!"
             (i18n.impl/translate "es" "Your database has been added!"))))

    (testing "should be able to use language-country Locale if available"
      (is (= "Está muy bien, gracias"
             (i18n.impl/translate "es-MX" "I''m good thanks"))))

    (testing "should fall back from `language-country` Locale to `language`"
      (is (= "¡Tu base de datos ha sido añadida!"
             (i18n.impl/translate "es-MX" "Your database has been added!"))))

    (testing "Should fall back to English if no bundles/translations exist"
      (is (= "abc 123 wow"
             (i18n.impl/translate "ok" "abc 123 wow")
             (i18n.impl/translate "es" "abc 123 wow"))))

    (testing "format strings with arguments"
      (is (= "deben tener 140 caracteres o menos"
             (i18n.impl/translate "es" "must be {0} characters or less" [140]))))))

(deftest translate-error-handling-test
  (mt/with-mock-i18n-bundles {"ba-DD" {"Bad translation {0}" "BaD TrAnSlAtIoN {a}"}}
    (testing "Should fall back to original format string if translated one is busted"
      (is (= "Bad translation 100"
             (i18n.impl/translate "ba-DD" "Bad translation {0}" [100]))))

    (testing "if the original format string is busted, should just return format-string as-is (better than nothing)"
      (is (= "Bad original {a}"
             (i18n.impl/translate "ba-DD" "Bad original {a}" [100]))))))

(deftest avoid-infinite-i18n-loops-test
  (testing "recursive calls to site-locale should not result in infinite loops (#32376)"
    (mt/discard-setting-changes [site-locale]
      (encryption-test/with-secret-key "secret_key__1"
        ;; set `site-locale` to something encrypted with the first encryption key.
        (mt/with-temporary-setting-values [site-locale "en"]
          (binding [config/*disable-setting-cache* true]
            (is (= "en"
                   (i18n.impl/site-locale-from-setting)))
            ;; rotate the encryption key, which will trigger an error being logged
            ;; in [[metabase.util.encryption/maybe-decrypt]]... this will cause a Stack Overflow if `log/error` tries to
            ;; access `:site-locale` recursively to log the message.
            (encryption-test/with-secret-key "secret_key__2"
              (testing "low-level functions should return the encrypted String since we can't successfully decrypt it"
                ;; not 100% sure this general behavior makes sense for values that we cannot decrypt, but invalid
                ;; locales are handled by the high-level functions below.
                (is (encryption/possibly-encrypted-string? (#'setting/db-or-cache-value :site-locale))
                    `setting/db-or-cache-value)
                (is (encryption/possibly-encrypted-string? (i18n.impl/site-locale-from-setting))
                    `i18n.impl/site-locale-from-setting))
              (testing "since the encrypted string is an invalid value for a Locale, high-level functions should return nil"
                (is (nil? (i18n/site-locale))
                    `i18n/site-locale)
                (is (nil? (public-settings/site-locale))
                    `public-settings/site-locale))
              (testing "we should still be able to (no-op) i18n stuff"
                (is (= "Testing"
                       (i18n/trs "Testing")))))))))))
