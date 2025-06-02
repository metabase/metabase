(ns metabase-enterprise.content-translation.dictionary-test
  "Tests for content translation dictionary import logic."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

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

  (testing "Duplicate translation keys generate warning"
    (let [rows [["fr" "Hello" "Bonjour"]
                ["fr" "Hello" "Salut"]]  ; Same locale+msgid
          result (#'dictionary/process-rows rows)]
      (is (empty? (:errors result)) "Should not have errors for duplicates")
      (is (= 1 (count (:warnings result))) "Should have one warning for duplicate")
      (is (re-find #"Row 3.*Hello.*fr.*earlier" (first (:warnings result))))))

  (testing "Wrong number of columns generates error"
    (let [rows [["fr" "Hello" "Bonjour" "extra"]]
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 2.*Invalid format.*3 columns" (first (:errors result))))))

  (testing "Multiple errors and warnings are collected"
    (let [rows [["invalid" "Hello" "Hola" "extra"]  ; Invalid locale + extra column
                ["fr" "Hello" "Bonjour"]
                ["fr" "Hello" "Salut"]] ; Duplicate
          result (#'dictionary/process-rows rows)]
      (is (= 2 (count (:errors result))) "Should have 2 errors (locale + format)")
      (is (= 1 (count (:warnings result))) "Should have 1 warning (duplicate)")
      (is (some #(re-find #"Invalid locale" %) (:errors result)))
      (is (some #(re-find #"Invalid format" %) (:errors result)))
      (is (some #(re-find #"earlier in the file" %) (:warnings result))))))

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
  (testing "Valid translations are imported successfully"
    (mt/with-empty-h2-app-db
      (let [rows [["es" "Hello" "Hola"]
                  ["fr" "Goodbye" "Au revoir"]
                  ["de" "Thank you" "Danke"]]
            result (dictionary/import-translations! rows)]
        (is (= 0 (count-translations)) "Database should start empty")

        (is (= {:success true} result) "Should return success with no warnings")

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
    (mt/with-empty-h2-app-db
      (let [rows [["en" "Hello" "Hola"]
                  ["en" "Blank" ""]
                  ["en" "Whitespace" "   "]
                  ["en" "Commas" ",,,"]
                  ["fr" "Good" "Bien"]]
            result (dictionary/import-translations! rows)]
        (is (= {:success true} result) "Should return success")

        (is (= 2 (count-translations)) "Only usable translations should be imported")

        (let [translations (get-translations)]
          (is (some #(= (:msgstr %) "Hola") translations))
          (is (some #(= (:msgstr %) "Bien") translations))
          (is (not (some #(= (:msgstr %) "") translations)))
          (is (not (some #(= (:msgstr %) "   ") translations)))
          (is (not (some #(= (:msgstr %) ",,,") translations)))))))

  (testing "Existing translations are replaced"
    (mt/with-empty-h2-app-db
      ;; First import
      (let [initial-rows [["it" "Hello" "Buongiorno"]
                          ["fr" "Goodbye" "Au revoir"]]
            result1 (dictionary/import-translations! initial-rows)]
        (is (= {:success true} result1))
        (is (= 2 (count-translations))))

      ;; Second import should replace all
      (let [new-rows [["de" "Thank you" "Danke"]
                      ["es" "Good morning" "Buenos días"]]
            result2 (dictionary/import-translations! new-rows)]
        (is (= {:success true} result2))
        (is (= 2 (count-translations)))

        (let [translations (get-translations)]
          (is (not (some #(= (:locale %) "it") translations)) "Old translations should be gone")
          (is (not (some #(= (:locale %) "fr") translations)) "Old translations should be gone")
          (is (some #(= (:locale %) "de") translations) "New translations should be present")
          (is (some #(= (:locale %) "es") translations) "New translations should be present")))))

  (deftest import-translations-error-test
    (testing "Import fails with validation errors"
      (mt/with-empty-h2-app-db
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
      (mt/with-empty-h2-app-db
        (let [invalid-rows [["invalid-locale" "Hello" "Hola"]
                            ["en" "Test" "Translation" "extra"]]]
          (try
            (dictionary/import-translations! invalid-rows)
            (is false "Should have thrown exception")
            (catch Exception e
              (let [data (ex-data e)]
                (is (= 422 (:status-code data)))
                (is (= 2 (count (:errors data))))
                (is (some #(re-find #"Invalid locale" %) (:errors data)))
                (is (some #(re-find #"Invalid format" %) (:errors data)))))))))))

(deftest import-translations-with-warnings-test
  (testing "Duplicate translations generate warnings but still succeed"
    (mt/with-empty-h2-app-db
      (let [rows [["fr" "Hello" "Bonjour"]
                  ["fr" "Hello" "Salut"]     ; Duplicate - should generate warning
                  ["es" "Goodbye" "Adiós"]]
            result (dictionary/import-translations! rows)]
        (is (contains? result :success))
        (is (:success result))
        (is (contains? result :warnings))
        (is (= 1 (count (:warnings result))))
        (is (re-find #"Row 3.*Hello.*fr.*earlier" (first (:warnings result))))

        ;; Only the first occurrence should be imported (plus the non-duplicate)
        (is (= 2 (count-translations)))
        (let [translations (get-translations)]
          (is (some #(and (= (:locale %) "fr")
                          (= (:msgid %) "Hello")
                          (= (:msgstr %) "Bonjour")) translations) "First duplicate should be kept")
          (is (some #(and (= (:locale %) "es")
                          (= (:msgid %) "Goodbye")
                          (= (:msgstr %) "Adiós")) translations) "Non-duplicate should be imported")
          (is (not (some #(= (:msgstr %) "Salut") translations)) "Second duplicate should not be imported"))))))

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
