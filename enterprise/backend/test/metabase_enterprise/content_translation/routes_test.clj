(ns metabase-enterprise.content-translation.routes-test
  "Tests for content translation API endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn- create-temp-csv-file
  "Create a temporary CSV file with the given content for testing."
  [content]
  (let [temp-file (File/createTempFile "content-translation-test" ".csv")]
    (spit temp-file content)
    temp-file))

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
  (count (t2/select :model/ContentTranslation)))

;; TODO: Start with a working set of BE unit tests, maybe content verification. Iteratively mutate that file, making it more and more like this one, and see where and how it breaks.

(deftest content-translation-api-test
  (testing "GET /api/ee/content-translation/csv"
    (testing "requires content-translation feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Content translation"
         (mt/user-http-request :crowberto :get 402 "ee/content-translation/csv" {}))))
    (testing "fails for rasta"
      ; TODO: This should fail but it doesn't
      (mt/with-premium-features #{:content-translation}
        (mt/user-http-request :rasta :get 403 "ee/content-translation/csv" {})))
    (testing "returns csv for crowberto"
      (mt/with-temp [:model/ContentTranslation {_ :id} {:locale "fr" :msgid "Hello" :msgstr "Bonjour"}]
        (mt/with-premium-features #{:content-translation}
          (mt/user-http-request :crowberto :get 200 "ee/content-translation/csv" {})))))

  (testing "POST /api/ee/content-translation/upload-dictionary"
    (mt/with-premium-features #{:content-translation}
      (mt/with-empty-h2-app-db
        (fixtures/initialize :test-users)
        (let [csv-content (valid-csv-content)
              temp-file (create-temp-csv-file csv-content)]
          (testing "nonadmin cannot use"
            (try
              (is (=? {:message "You don't have permissions to do that."}
                      (mt/user-http-request :rasta :post 403 "ee/content-translation/upload-dictionary"
                                            {:request-options {:content-type "multipart/form-data"}}
                                            {"file" {:filename "upload.csv"
                                                     :tempfile temp-file}})))
              (finally
                (.delete temp-file))))

          (testing "admin can upload valid file"
            (let [valid-file (create-temp-csv-file csv-content)]
              (try
                (is (=? {:success true}
                        (mt/user-http-request :crowberto :post 200 "ee/content-translation/upload-dictionary"
                                              {:request-options {:content-type "multipart/form-data"}}
                                              {"file" {:filename "upload.csv"
                                                       :tempfile valid-file}})))
                (is (= 3 (count-translations)))
                (finally
                  (.delete valid-file))))))))))
