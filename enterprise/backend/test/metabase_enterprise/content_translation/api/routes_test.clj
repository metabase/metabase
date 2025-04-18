(ns metabase-enterprise.content-translation.api.routes-test
  "Tests for content translation API endpoints and related functionality."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.content-translation.api.routes :as routes]
   [metabase.config :as config]
   [metabase.db.query :as mdb.query]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util.i18n :as i18n])
  (:import
   (java.io File)
   (org.apache.commons.io FileUtils)))

;; Test helpers

(defn- create-temp-csv-file
  "Create a temporary CSV file with the given content for testing."
  [content]
  (let [temp-file (File/createTempFile "content-translation-test" ".csv")]
    (spit temp-file content)
    temp-file))

(defn- create-temp-file
  "Create a temporary file with the given content, extension, and mime-type for testing."
  [content extension mime-type]
  (let [temp-file (File/createTempFile "content-translation-test" (str "." extension))]
    (spit temp-file content)
    ;; This is a hack to test mime type detection without actually changing the file
    (with-redefs [routes/file-mime-type (constantly mime-type)]
      temp-file)))

(defn- valid-csv-content
  "Create valid CSV content for testing with the specified number of rows."
  [& {:keys [num-rows locale]
      :or {num-rows 3
           locale "en"}}]
  (str "Language,String,Translation\n"
       (str/join "\n"
                 (for [i (range num-rows)]
                   (format "%s,Original %d,Translation %d" locale i i)))))

(defn- count-translations
  "Count the number of translations in the database."
  []
  (count (mdb.query/query {:select [:*]
                           :from [:content_translation]})))

(defn- find-translation
  "Find a specific translation in the database."
  [locale msgid]
  (first (mdb.query/query {:select [:*]
                           :from [:content_translation]
                           :where [:and
                                   [:= :locale locale]
                                   [:= :msgid msgid]]})))

;; Actual tests

(deftest file-extension-test
  (testing "file-extension function correctly extracts extensions"
    (are [filename expected] (= expected (routes/file-extension filename))
      "test.csv" "csv"
      "test.CSV" "CSV"
      "test.file.csv" "csv"
      "test" nil
      nil nil)))

(deftest check-filetype-test
  (testing "check-filetype accepts valid files"
    (let [valid-file (create-temp-file "test,data" "csv" "text/csv")]
      (is (nil? (routes/check-filetype "test.csv" valid-file)))
      (.delete valid-file)))
  
  (testing "check-filetype rejects files with invalid extensions"
    (let [invalid-file (create-temp-file "test,data" "txt" "text/csv")]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"The file could not be uploaded"
           (routes/check-filetype "test.txt" invalid-file)))
      (.delete invalid-file)))
  
  (testing "check-filetype rejects files with invalid mime types"
    (let [invalid-file (create-temp-file "test,data" "csv" "text/plain")]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"The file could not be uploaded"
           (routes/check-filetype "test.csv" invalid-file)))
      (.delete invalid-file))))

(deftest check-valid-locale-test
  (testing "check-valid-locale accepts valid locales"
    (is (nil? (routes/check-valid-locale "en")))
    (is (nil? (routes/check-valid-locale "fr")))
    (is (nil? (routes/check-valid-locale "de")))
    (is (nil? (routes/check-valid-locale "es"))))
  
  (testing "check-valid-locale rejects invalid locales"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid locale"
         (routes/check-valid-locale "invalid-locale"))))
  
  (testing "check-valid-locale allows blank locales"
    (is (nil? (routes/check-valid-locale "")))
    (is (nil? (routes/check-valid-locale nil)))))

(deftest check-string-length-test
  (testing "check-string-length accepts strings within maximum length"
    (is (nil? (routes/check-string-length "Test" "short string")))
    (is (nil? (routes/check-string-length "Test" (apply str (repeat 254 "a"))))))
  
  (testing "check-string-length rejects strings exceeding maximum length"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"is longer than .* characters"
         (routes/check-string-length "Test" (apply str (repeat 256 "a"))))))
  
  (testing "check-string-length handles blank strings"
    (is (nil? (routes/check-string-length "Test" "")))
    (is (nil? (routes/check-string-length "Test" nil)))))

(deftest import-translations-test
  (mt/with-temp-vals-in-db :core_user [:id (mt/user->id :crowberto)] {:locale "en"}
    (testing "import-translations correctly imports valid CSV content"
      (mt/with-empty-db
        (let [csv-content (valid-csv-content)
              temp-file (create-temp-csv-file csv-content)]
          (try
            (let [initial-count (count-translations)]
              (routes/import-translations! {:filename "test.csv" :file temp-file})
              (is (= (+ initial-count 3) (count-translations)))
              (let [translation (find-translation "en" "Original 1")]
                (is (= "Translation 1" (:msgstr translation)))))
            (finally
              (.delete temp-file))))))
    
    (testing "import-translations validates all rows before insertion"
      (mt/with-empty-db
        (let [csv-content (str "Language,String,Translation\n"
                               "en,Valid String,Valid Translation\n"
                               "invalid-locale,Invalid Locale,Translation\n")
              temp-file (create-temp-csv-file csv-content)]
          (try
            (let [initial-count (count-translations)]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"problem in row 3"
                   (routes/import-translations! {:filename "test.csv" :file temp-file})))
              (is (= initial-count (count-translations))))
            (finally
              (.delete temp-file))))))
    
    (testing "import-translations handles empty translations"
      (mt/with-empty-db
        (let [csv-content (str "Language,String,Translation\n"
                               "en,Original,\n")
              temp-file (create-temp-csv-file csv-content)]
          (try
            (let [initial-count (count-translations)]
              (routes/import-translations! {:filename "test.csv" :file temp-file})
              (is (= initial-count (count-translations))))
            (finally
              (.delete temp-file))))))
    
    (testing "import-translations handles updates to existing translations"
      (mt/with-empty-db
        (let [csv-content-1 (str "Language,String,Translation\n"
                                 "en,Original,Translation\n")
              csv-content-2 (str "Language,String,Translation\n"
                                 "en,Original,Updated Translation\n")
              temp-file-1 (create-temp-csv-file csv-content-1)
              temp-file-2 (create-temp-csv-file csv-content-2)]
          (try
            (routes/import-translations! {:filename "test1.csv" :file temp-file-1})
            (let [initial-count (count-translations)
                  original-translation (find-translation "en" "Original")]
              (is (= "Translation" (:msgstr original-translation)))
              
              (routes/import-translations! {:filename "test2.csv" :file temp-file-2})
              (is (= initial-count (count-translations)))
              
              (let [updated-translation (find-translation "en" "Original")]
                (is (= "Updated Translation" (:msgstr updated-translation)))))
            (finally
              (.delete temp-file-1)
              (.delete temp-file-2))))))
    
    (testing "import-translations validates string length"
      (mt/with-empty-db
        (let [long-string (apply str (repeat 300 "a"))
              csv-content (str "Language,String,Translation\n"
                               "en," long-string ",Translation\n")
              temp-file (create-temp-csv-file csv-content)]
          (try
            (let [initial-count (count-translations)]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"problem in row 2"
                   (routes/import-translations! {:filename "test.csv" :file temp-file})))
              (is (= initial-count (count-translations))))
            (finally
              (.delete temp-file))))))))

(deftest content-translation-api-test
  (testing "POST /api/ee/content-translation/upload-dictionary"
    (mt/with-premium-features #{:content-translation}
      (mt/with-empty-db
        (let [csv-content (valid-csv-content)
              temp-file (create-temp-csv-file csv-content)]
          (try
            (mt/user-http-request :crowberto :post 200 "ee/content-translation/upload-dictionary"
                                  {:file {:content   (.getBytes csv-content)
                                          :filename  "test.csv"}})
            (is (= 3 (count-translations)))
            (finally
              (.delete temp-file)))))))
  
  (testing "GET /api/ee/content-translation/dictionary"
    (mt/with-premium-features #{:content-translation}
      (mt/with-empty-db
        (let [csv-content (str "Language,String,Translation\n"
                               "en,Original EN,Translation EN\n"
                               "fr,Original FR,Translation FR\n")
              temp-file (create-temp-csv-file csv-content)]
          (try
            (routes/import-translations! {:filename "test.csv" :file temp-file})
            
            (let [all-translations (mt/user-http-request :crowberto :get 200 "ee/content-translation/dictionary")
                  en-translations (mt/user-http-request :crowberto :get 200 "ee/content-translation/dictionary" {:locale "en"})]
              
              (is (= 2 (count (:data all-translations))))
              (is (= 1 (count (:data en-translations))))
              (is (= "Translation EN" (:msgstr (first (:data en-translations))))))
            (finally
              (.delete temp-file))))))))