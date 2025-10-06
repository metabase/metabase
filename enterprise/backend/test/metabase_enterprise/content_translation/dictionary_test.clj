(ns metabase-enterprise.content-translation.dictionary-test
  "Tests for content translation dictionary import logic."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase-enterprise.content-translation.utils :as ct-utils]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- count-translations
  "Count the number of translations in the database."
  []
  (t2/count :model/ContentTranslation))

(defn- get-translations
  "Get all translations from the database."
  []
  (t2/select :model/ContentTranslation))

(deftest ^:parallel process-rows-test
  (testing "Valid rows are processed correctly"
    (let [rows [["en" "Hello" "Hola"]
                ["fr" "Goodbye" "Au revoir"]
                ["de" "Thank you" "Danke"]]
          result (#'dictionary/process-rows rows)]
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

(deftest ^:parallel process-rows-invalid-locale-test
  (testing "Invalid locale generates error"
    (let [rows [["invalidlocale" "Hello" "Hola"]]
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 1.*Invalid locale" (first (:errors result)))))))

(deftest ^:parallel process-rows-undefined-locale-test
  (testing "Invalid locale generates error"
    ;; Esperanto is not a locale metabase is available in
    (let [rows [["eo" "Hello" "Hola"]]
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 1.*Invalid locale" (first (:errors result)))))))

(deftest ^:parallel process-rows-duplicate-keys-test
  (testing "Duplicate translation keys generate error"
    (let [rows [["fr" "Hello" "Bonjour"]
                ["fr" "Hello" "Salut"]]  ; Same locale+msgid
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 2.*Hello.*fr.*earlier" (first (:errors result)))))))

(deftest ^:parallel process-rows-wrong-columns-test
  (testing "Wrong number of columns generates error"
    (let [rows [["fr" "Hello" "Bonjour" "extra"]]
          result (#'dictionary/process-rows rows)]
      (is (= 1 (count (:errors result))))
      (is (re-find #"Row 1.*Invalid format.*3 columns" (first (:errors result)))))))

(deftest ^:parallel process-rows-multiple-errors-test
  (testing "Multiple errors are collected"
    (let [rows [["invalid" "Hello" "Hola" "extra"]  ; Invalid locale + extra column
                ["fr" "Hello" "Bonjour"]
                ["fr" "Hello" "Salut"]] ; Duplicate
          result (#'dictionary/process-rows rows)]
      (is (= 3 (count (:errors result))))
      (is (some #(re-find #"Invalid locale" %) (:errors result)))
      (is (some #(re-find #"Invalid format" %) (:errors result)))
      (is (some #(re-find #"earlier in the file" %) (:errors result))))))

(deftest ^:parallel is-msgstr-usable-test
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

(deftest ^:parallel translation-key-test
  (testing "Translation key extracts locale and msgid"
    (is (= {:locale "en" :msgid "Hello"}
           (#'dictionary/translation-key {:locale "en" :msgid "Hello" :msgstr "Hola"})))
    (is (= {:locale "fr" :msgid "Goodbye"}
           (#'dictionary/translation-key {:locale "fr" :msgid "Goodbye" :msgstr "Au revoir"})))))

(deftest ^:parallel adjust-index-test
  (testing "Index adjustment for human-readable error messages"
    (binding [dictionary/*header-adjustment* 1]
      (is (= 2 (#'dictionary/adjust-index 0)) "First row becomes row 2 (header is row 1)")
      (is (= 3 (#'dictionary/adjust-index 1)) "Second row becomes row 3")
      (is (= 10 (#'dictionary/adjust-index 8)) "Ninth row becomes row 10"))))

(deftest read-and-import-csv!-test
  (mt/with-premium-features #{:content-translation}
    (testing "Reads valid CSV without error"
      (let [file (.getBytes "Language,String,Translation")]
        (is (nil? (dictionary/read-and-import-csv! file)))))
    (testing "Reads CSV with invalid header row and throws informative error"
      (let [file (.getBytes "Language,String,\"Translation\"X")] ; character outside quotation marks
        (is (thrown-with-msg?
             Exception #"Row 1.*CSV error.*unexpected character.*X"
             (dictionary/read-and-import-csv! file)))))
    (testing "Reads CSV with invalid header name and throws informative error"
      (let [file (.getBytes "Loca,String,Translation\nes-mx,hello,hola")] ; bad header
        (is (thrown-with-msg?
             Exception #"This file could not be uploaded due to the following error\(s\):"
             (dictionary/read-and-import-csv! file)))))
    (testing "Reads CSV with invalid data row and throws informative error"
      (let [file (.getBytes "Language,String,Translation\nde,Title,Titel\nde,Vendor,\"Anbieter\"X")] ; character outside quotation marks
        (is (thrown-with-msg?
             Exception #"Row 3.*CSV error.*unexpected character.*X"
             (dictionary/read-and-import-csv! file)))))))

(deftest read-and-import-csv-with-and-without-header-test
  (ct-utils/with-clean-translations!
    (testing "CSV with header row is imported correctly"
      (mt/with-premium-features #{:content-translation}
        (let [csv-with-header "Language,String,Translation\nes,Hello,Hola\nfr,Goodbye,Au revoir"
              file (.getBytes csv-with-header)]
          (dictionary/read-and-import-csv! file)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "es") (= (:msgid %) "Hello") (= (:msgstr %) "Hola")) translations))
            (is (some #(and (= (:locale %) "fr") (= (:msgid %) "Goodbye") (= (:msgstr %) "Au revoir")) translations))))))

    (testing "CSV without header row is imported correctly"
      (mt/with-premium-features #{:content-translation}
        (let [csv-without-header "de,Thank you,Danke\nit,Good morning,Buongiorno"
              file (.getBytes csv-without-header)]
          (dictionary/read-and-import-csv! file)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "de") (= (:msgid %) "Thank you") (= (:msgstr %) "Danke")) translations))
            (is (some #(and (= (:locale %) "it") (= (:msgid %) "Good morning") (= (:msgstr %) "Buongiorno")) translations))))))

    (testing "CSV with headers in different order is imported correctly"
      (mt/with-premium-features #{:content-translation}
        (let [csv-different-order "Translation,Language,String\nHola,es,Hello\nAu revoir,fr,Goodbye"
              file (.getBytes csv-different-order)]
          (dictionary/read-and-import-csv! file)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "es") (= (:msgid %) "Hello") (= (:msgstr %) "Hola")) translations))
            (is (some #(and (= (:locale %) "fr") (= (:msgid %) "Goodbye") (= (:msgstr %) "Au revoir")) translations))))))))

(deftest read-and-import-csv-different-locale-headers-test
  (ct-utils/with-clean-translations!
    (testing "CSV with 'locale' header is imported correctly"
      (mt/with-premium-features #{:content-translation}
        (let [csv-with-locale "locale,string,translation\nes,Hello,Hola\nfr,Goodbye,Au revoir"
              file (.getBytes csv-with-locale)]
          (dictionary/read-and-import-csv! file)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "es") (= (:msgid %) "Hello") (= (:msgstr %) "Hola")) translations))
            (is (some #(and (= (:locale %) "fr") (= (:msgid %) "Goodbye") (= (:msgstr %) "Au revoir")) translations))))))

    (testing "CSV with 'locale code' header is imported correctly"
      (mt/with-premium-features #{:content-translation}
        (let [csv-with-locale-code "locale code,string,translation\nde,Thank you,Danke\nit,Good morning,Buongiorno"
              file (.getBytes csv-with-locale-code)]
          (dictionary/read-and-import-csv! file)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "de") (= (:msgid %) "Thank you") (= (:msgstr %) "Danke")) translations))
            (is (some #(and (= (:locale %) "it") (= (:msgid %) "Good morning") (= (:msgstr %) "Buongiorno")) translations))))))

    (testing "CSV with 'language' header is imported correctly"
      (mt/with-premium-features #{:content-translation}
        (let [csv-with-language "language,string,translation\npt_BR,Welcome,Bem-vindo\nzh_CN,Hello,你好"
              file (.getBytes csv-with-language)]
          (dictionary/read-and-import-csv! file)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "pt_BR") (= (:msgid %) "Welcome") (= (:msgstr %) "Bem-vindo")) translations))
            (is (some #(and (= (:locale %) "zh_CN") (= (:msgid %) "Hello") (= (:msgstr %) "你好")) translations))))))))

(deftest ^:parallel format-row-locale-standardization-test
  (testing "Format function standardizes locale"
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["language" "string" "translation"] ["pt-br" "msgid" "msgstr"])))
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["language" "string" "translation"] ["Pt-bR" "msgid" "msgstr"])))
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["language" "string" "translation"] ["pt_br" "msgid" "msgstr"])))
    (is (=
         ["zh_CN" "msgid" "msgstr"]
         (#'dictionary/format-row ["language" "string" "translation"] ["ZH-cn" "msgid" "msgstr"])))))

(deftest ^:parallel format-row-trimming-test
  (testing "Format function trims all fields"
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["language" "string" "translation"] [" pt-BR " "msgid " " msgstr"])))))

(deftest ^:parallel format-row-header-names-test
  (testing "Format function works with different locale header names"
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["locale" "string" "translation"] ["pt-br" "msgid" "msgstr"])))
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["locale code" "string" "translation"] ["pt-br" "msgid" "msgstr"])))
    (is (=
         ["pt_BR" "msgid" "msgstr"]
         (#'dictionary/format-row ["language" "string" "translation"] ["pt-br" "msgid" "msgstr"])))))

(deftest ^:parallel format-row-field-order-test
  (testing "Format function extracts fields in correct order regardless of input order"
    (is (=
         ["es" "Hello" "Hola"]
         (#'dictionary/format-row ["language" "string" "translation"] ["es" "Hello" "Hola"])))
    (is (=
         ["es" "Hello" "Hola"]
         (#'dictionary/format-row ["string" "language" "translation"] ["Hello" "es" "Hola"])))
    (is (=
         ["es" "Hello" "Hola"]
         (#'dictionary/format-row ["translation" "string" "language"] ["Hola" "Hello" "es"])))
    (is (=
         ["es" "Hello" "Hola"]
         (#'dictionary/format-row ["string" "translation" "language"] ["Hello" "Hola" "es"])))
    (is (=
         ["es" "Hello" "Hola"]
         (#'dictionary/format-row ["language" "translation" "string"] ["es" "Hola" "Hello"])))
    (is (=
         ["es" "Hello" "Hola"]
         (#'dictionary/format-row ["translation" "language" "string"] ["Hola" "es" "Hello"])))))

(deftest ^:parallel format-row-mixed-headers-order-test
  (testing "Format function works with different locale header names in different orders"
    (is (=
         ["fr" "Goodbye" "Au revoir"]
         (#'dictionary/format-row ["locale" "string" "translation"] ["fr" "Goodbye" "Au revoir"])))
    (is (=
         ["fr" "Goodbye" "Au revoir"]
         (#'dictionary/format-row ["string" "locale" "translation"] ["Goodbye" "fr" "Au revoir"])))
    (is (=
         ["fr" "Goodbye" "Au revoir"]
         (#'dictionary/format-row ["locale code" "translation" "string"] ["fr" "Au revoir" "Goodbye"])))))

(deftest import-translations-success-test
  (ct-utils/with-clean-translations!
    (testing "Valid translations are imported when content translation feature is present"
      (mt/with-premium-features #{:content-translation}
        (let [rows [["es" "Hello" "Hola"]
                    ["fr" "Goodbye" "Au revoir"]
                    ["de" "Thank you" "Danke"]
                    ["pt-br" "Thank you" "Obrigado"]]]
          (#'dictionary/import-translations! rows)
          (is (= 4 (count-translations)) "All translations should be imported")

          (let [translations (get-translations)]
            (is (some #(and (= (:locale %) "es")
                            (= (:msgid %) "Hello")
                            (= (:msgstr %) "Hola")) translations))
            (is (some #(and (= (:locale %) "fr")
                            (= (:msgid %) "Goodbye")
                            (= (:msgstr %) "Au revoir")) translations))
            (is (some #(and (= (:locale %) "de")
                            (= (:msgid %) "Thank you")
                            (= (:msgstr %) "Danke")) translations))
            (is (some #(and (= (:locale %) "pt_BR") ; Check that locale was standardized
                            (= (:msgid %) "Thank you")
                            (= (:msgstr %) "Obrigado")) translations))))))
    (testing "Unusable translations are filtered out"
      (mt/with-premium-features #{:content-translation}
        (let [rows [["en" "Hello" "Hola"]     ; Usable
                    ["en" "Blank" ""]         ; Unusable
                    ["en" "Whitespace" "   "] ; Unusable
                    ["en" "Commas" ",,,"]     ; Unusable
                    ["fr" "Good" "Bien"]]]     ; Usable
          (#'dictionary/import-translations! rows)
          (is (= 2 (count-translations)) "Only usable translations should be imported")
          (let [translations (get-translations)]
            (is (some #(= (:msgstr %) "Hola") translations))
            (is (some #(= (:msgstr %) "Bien") translations))
            (is (not (some #(= (:msgstr %) "") translations)))
            (is (not (some #(= (:msgstr %) "   ") translations)))
            (is (not (some #(= (:msgstr %) ",,,") translations)))))))))

(deftest import-translations-error-test
  (ct-utils/with-clean-translations!
    (testing "Import fails with validation errors"
      (mt/with-premium-features #{:content-translation}
        (let [invalid-rows [["invalid-locale" "Hello" "Hola"]
                            ["en" "Test" "Translation" "extra"]
                            ["en" "Duplicate" "First"]
                            ["en" "Duplicate" "Second"]]]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The file could not be uploaded due to the following error"
               (#'dictionary/import-translations! invalid-rows))))))
    (testing "Import fails when one row has too many fields"
      (mt/with-premium-features #{:content-translation}
        (let [invalid-rows [["en" "Test" "Translation" "extra"]]]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The file could not be uploaded due to the following error"
               (#'dictionary/import-translations! invalid-rows))))))
    (testing "Import fails when two rows have the same msgid and the same standardized locale"
      (mt/with-premium-features #{:content-translation}
        (let [invalid-rows [["pt-br" "Test" "Translation"]
                            ["pt_BR" "Test" "Another translation"]]]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"The file could not be uploaded due to the following error"
               (#'dictionary/import-translations! invalid-rows))))))
    (testing "Multiple error messages can be returned"
      (mt/with-premium-features #{:content-translation}
        (let [invalid-rows [["invalidlocale" "Hello" "Hola"]
                            ["fr" "Too" "many" "fields"]
                            ["en" "Test" "Translation1"]
                            ["en" "Test" "Translation2"]]]
          (try
            (#'dictionary/import-translations! invalid-rows)
            (is false "Should have thrown exception")
            (catch Exception e
              (let [data (ex-data e)]
                (is (= 422 (:status-code data)))
                (is (= 3 (count (:errors data))))
                (is (some #(re-find #"Invalid locale" %) (:errors data)))
                (is (some #(re-find #"Invalid format" %) (:errors data)))
                (is (some #(re-find #"earlier in the file" %) (:errors data)))))))))
    (testing "Existing translations are replaced"
      (mt/with-premium-features #{:content-translation}
        ;; First import
        (let [initial-rows [["it" "Hello" "Buongiorno"]]]
          (#'dictionary/import-translations! initial-rows)
          (is (= 1 (count-translations))))
        ;; Second import should replace all
        (let [new-rows [["de" "Thank you" "Danke"]
                        ["es" "Good morning" "Buenos días"]]]
          (#'dictionary/import-translations! new-rows)
          (is (= 2 (count-translations)))
          (let [translations (get-translations)]
            (is (not (some #(= (:locale %) "fr") translations)) "Old translations should be gone")
            (is (not (some #(= (:locale %) "it") translations)) "Old translations should be gone")
            (is (some #(= (:locale %) "de") translations) "New translations should be present")
            (is (some #(= (:locale %) "es") translations) "New translations should be present")))))))
