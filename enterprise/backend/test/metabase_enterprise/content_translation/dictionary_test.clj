(ns metabase-enterprise.content-translation.dictionary-test
  "Tests for content translation dictionary import logic."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmacro with-clean-translations!
  "Macro to reset the content translation table to an empty state before a test and restore it after the test runs."
  [& body]
  (let [original-entities# (t2/select [:model/ContentTranslation])]
    (try
      (t2/delete! :model/ContentTranslation)
      ~@body
      (finally
        (t2/delete! :model/ContentTranslation)
        (when (seq original-entities#)
          (t2/insert! :model/ContentTranslation original-entities#))))))

(defn- count-translations
  "Count the number of translations in the database."
  []
  (count (t2/select :model/ContentTranslation)))

(defn- get-translations
  "Get all translations from the database."
  []
  (t2/select :model/ContentTranslation))

(deftest process-rows-test
  (testing "Valid rows are processed correctly"
    (let [rows [["en" "Hello" "Hola"]
                ["fr" "Goodbye" "Au revoir"]
                ["de" "Thank you" "Danke"]]
          result (#'dictionary/process-rows rows)]
      (log/info "process-rows-test")
      (is (empty? (:errors result)))
      (is (= 3 (count (:translations result))))
      (is (= #{{:locale "en" :msgid "Hello"}
               {:locale "fr" :msgid "Goodbye"}
               {:locale "de" :msgid "Thank you"}}
             (:seen result)))
      (is (= [{:locale "en" :msgid "Hello" :msgstr "Hola"}
              {:locale "fr" :msgid "Goodbye" :msgstr "Au revoir"}
              {:locale "de" :msgid "Thank you" :msgstr "Danke"}]
             (:translations result))))))

(deftest process-rows-validation-test
  (testing "Invalid locale generates error"
    (let [rows [["invalid-locale" "Hello" "Hola"]]
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 2.*Invalid locale.*invalid-locale" (first (:errors result))))))

  (testing "Duplicate translation keys generate error"
    (let [rows [["fr" "Hello" "Bonjour"]
                ["fr" "Hello" "Salut"]]  ; Same locale+msgid
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 3.*Hello.*fr.*earlier" (first (:errors result))))))

  (testing "Wrong number of columns generates error"
    (let [rows [["fr" "Hello" "Bonjour" "extra"]]
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 2.*Invalid format.*3 columns" (first (:errors result))))))

  (testing "Multiple errors are collected"
    (let [rows [["invalid" "Hello" "Hola" "extra"]  ; Invalid locale + extra column
                ["fr" "Hello" "Bonjour"]
                ["fr" "Hello" "Salut"]] ; Duplicate
          result (#'dictionary/process-rows rows)]
      (is (= 3 (count (:errors result))))
      (is (some #(re-find #"Invalid locale" %) (:errors result)))
      (is (some #(re-find #"Invalid format" %) (:errors result)))
      (is (some #(re-find #"earlier in the file" %) (:errors result))))))

(deftest is-msgstr-usable-test
  (testing "Usable translations"
    (is (#'dictionary/is-msgstr-usable "Hello"))
    (is (#'dictionary/is-msgstr-usable "Hello, world!"))
    (is (#'dictionary/is-msgstr-usable "123")))

  (testing "Unusable translations"
    (is (not (#'dictionary/is-msgstr-usable "")))
    (is (not (#'dictionary/is-msgstr-usable "   ")))
    (is (not (#'dictionary/is-msgstr-usable ",,,")))
    (is (not (#'dictionary/is-msgstr-usable " ; , ; ")))
    (is (not (#'dictionary/is-msgstr-usable nil)))))

(deftest import-translations-success-test
  (with-clean-translations!
    (testing "Content translation feature is required"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Content translation"
         (dictionary/import-translations! []))))
    (testing "Valid translations are imported when content translation feature is present"
      (mt/with-premium-features #{:content-translation}
        (let [rows [["es" "Hello" "Hola"]
                    ["fr" "Goodbye" "Au revoir"]
                    ["de" "Thank you" "Danke"]]]
          (is (= 0 (count-translations)) "Translations table should be initially blank")
          (dictionary/import-translations! rows)
          (is (= 3 (count-translations)) "All translations should be imported")

          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "es")
                            (= (:msgid %) "Hello")
                            (= (:msgstr %) "Hola")) translations))
            (is (some #(and (= (:locale %) "fr")
                            (= (:msgid %) "Goodbye")
                            (= (:msgstr %) "Au revoir")) translations))
            (is (some #(and (= (:locale %) "de")
                            (= (:msgid %) "Thank you")
                            (= (:msgstr %) "Danke")) translations))))))
    (testing "Unusable translations are filtered out"
      (mt/with-premium-features #{:content-translation}
        (let [rows [["en" "Hello" "Hola"]     ; Usable
                    ["en" "Blank" ""]         ; Unusable
                    ["en" "Whitespace" "   "] ; Unusable
                    ["en" "Commas" ",,,"]     ; Unusable
                    ["fr" "Good" "Bien"]]]     ; Usable

          (dictionary/import-translations! rows)

          (is (= 2 (count-translations)) "Only usable translations should be imported")

          (let [translations (get-translations)]
            (is (some #(= (:msgstr %) "Hola") translations))
            (is (some #(= (:msgstr %) "Bien") translations))
            (is (not (some #(= (:msgstr %) "") translations)))
            (is (not (some #(= (:msgstr %) "   ") translations)))
            (is (not (some #(= (:msgstr %) ",,,") translations)))))))))

(deftest import-translations-error-test
  (testing "Import fails with validation errors"
    (with-clean-translations!
      (let [invalid-rows [["invalid-locale" "Hello" "Hola"]
                          ["en" "Test" "Translation" "extra"]
                          ["en" "Duplicate" "First"]
                          ["en" "Duplicate" "Second"]]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"The file could not be uploaded due to the following error"
             (dictionary/import-translations! invalid-rows)))
        (is (= 0 (count-translations)) "No translations should be imported on error"))))
  (testing "Error contains multiple validation messages"
    (with-clean-translations!
      (let [invalid-rows [["invalid-locale" "Hello" "Hola"]
                          ["en" "Test" "Translation" "extra"]]]
        (with-clean-translations!
          (try
            (dictionary/import-translations! invalid-rows)
            (is false "Should have thrown exception")
            (catch Exception e
              (let [data (ex-data e)]
                (is (= 422 (:status-code data)))
                (is (= 2 (count (:errors data))))
                (is (some #(re-find #"Invalid locale" %) (:errors data)))
                (is (some #(re-find #"Invalid format" %) (:errors data)))))))))))

(testing "Existing translations are replaced"
  (with-clean-translations!
    ;; First import
    (let [initial-rows [["it" "Hello" "Buongiorno"]
                        ["fr" "Goodbye" "Au revoir"]]]
      (dictionary/import-translations! initial-rows)
      (is (= 2 (count-translations))))

    ;; Second import should replace all
    (let [new-rows [["de" "Thank you" "Danke"]
                    ["es" "Good morning" "Buenos días"]]]
      (dictionary/import-translations! new-rows)
      (is (= 2 (count-translations)))

      (let [translations (get-translations)]
        (is (not (some #(= (:locale %) "fr") translations)) "Old translations should be gone")
        (is (not (some #(= (:locale %) "it") translations)) "Old translations should be gone")
        (is (some #(= (:locale %) "de") translations) "New translations should be present")
        (is (some #(= (:locale %) "es") translations) "New translations should be present")))))

(deftest translation-key-test
  (testing "Translation key extracts locale and msgid"
    (is (= {:locale "en" :msgid "Hello"}
           (#'dictionary/translation-key {:locale "en" :msgid "Hello" :msgstr "Hola"})))
    (is (= {:locale "fr" :msgid "Goodbye"}
           (#'dictionary/translation-key {:locale "fr" :msgid "Goodbye" :msgstr "Au revoir"})))))

(deftest adjust-index-test
  (testing "Index adjustment for human-readable error messages"
    (is (= 2 (#'dictionary/adjust-index 0)) "First row becomes row 2 (header is row 1)")
    (is (= 3 (#'dictionary/adjust-index 1)) "Second row becomes row 3")
    (is (= 10 (#'dictionary/adjust-index 8)) "Ninth row becomes row 10")))
