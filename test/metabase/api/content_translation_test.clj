(ns metabase.api.content-translation-test
  "Tests for /api/content-translation endpoints."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.models.content-translation]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]))

(defn- make-csv-file [data]
  (let [file (java.io.File/createTempFile "content-translation-test" ".csv")]
    (with-open [writer (io/writer file)]
      (.write writer "Language,String,Translation\n")
      (doseq [[locale msgid msgstr] data]
        (.write writer (format "%s,%s,%s\n" locale msgid msgstr))))
    file))

(deftest upload-dictionary-test
  (testing "POST /api/content-translation/upload-dictionary"
    (testing "should reject dictionary with invalid locale"
      (let [file (make-csv-file [["INVALID-LOCALE" "Test String" "Test Translation"]])]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid locale"
               (mt/user-http-request :crowberto :post 400 "content-translation/upload-dictionary"
                                     {:file {:content (slurp file)
                                             :filename "test.csv"}})))
          (finally
            (.delete file)))))

    (testing "should accept dictionary with valid locale"
      (let [file (make-csv-file [["en" "Test String" "Test Translation"]])]
        (try
          (is (= {:success true
                  :message "Import was successful"}
                 (mt/user-http-request :crowberto :post 200 "content-translation/upload-dictionary"
                                       {:file {:content (slurp file)
                                               :filename "test.csv"}})))
          (finally
            (.delete file)))))

    (testing "should accept empty locale (which is not validated)"
      (let [file (make-csv-file [["" "Test String" "Test Translation"]])]
        (try
          (is (= {:success true
                  :message "Import was successful"}
                 (mt/user-http-request :crowberto :post 200 "content-translation/upload-dictionary"
                                       {:file {:content (slurp file)
                                               :filename "test.csv"}})))
          (finally
            (.delete file)))))))