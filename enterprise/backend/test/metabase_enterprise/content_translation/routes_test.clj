(ns metabase-enterprise.content-translation.routes-test
  "Tests for content translation API endpoints."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [crypto.random :as crypto-random]
   [metabase-enterprise.content-translation.utils :as ct-utils]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- valid-csv-content
  "Create valid CSV content for testing with the specified number of rows."
  [& {:keys [num-rows locale]
      :or {num-rows 3
           locale "de"}}]
  (str "Language,String,Translation\n"
       (str/join "\n"
                 (for [i (range num-rows)]
                   (format "%s,Original %d,Translation %d" locale i i)))))

(defn- count-translations
  "Count the number of translations in the database."
  []
  (count (t2/select :model/ContentTranslation)))

(defn random-embedding-secret-key [] (crypto-random/hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key! [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (mt/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key! {:style/indent 0} [& body]
  `(do-with-new-secret-key! (fn [] ~@body)))

(defn token []
  (sign {:resource {:question 1} ; The payload doesn't matter
         :params   {}}))

(defmacro with-static-embedding! {:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding-static true]
     (with-new-secret-key!
       ~@body)))

(defn embedded-dictionary-url [] (str "ee/embedded-content-translation/dictionary/" (token)))

(deftest content-translation-api-test
  (testing "GET /api/ee/content-translation/csv"
    (testing "fails without content-translation feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Content translation"
         (mt/user-http-request :crowberto :get 402 "ee/content-translation/csv" {}))))
    (testing "fails for rasta"
      (mt/with-premium-features #{:content-translation}
        (mt/user-http-request :rasta :get 403 "ee/content-translation/csv" {})))
    (testing "returns csv for crowberto"
      (ct-utils/with-clean-translations!
        (mt/with-temp [:model/ContentTranslation {_ :id} {:locale "fr" :msgid "Hello" :msgstr "Bonjour"}]
          (mt/with-premium-features #{:content-translation}
            (let [body (mt/user-http-request :crowberto :get 200 "ee/content-translation/csv" {})]
              (log/info (str "body" body))
              (let [data (with-open [reader (java.io.StringReader. body)]
                           (doall (csv/read-csv reader)))
                    matches (filter #(and (= (nth % 0) "fr")
                                          (= (nth % 1) "Hello")
                                          (= (nth % 2) "Bonjour"))
                                    data)]
                (is (seq matches)))))))))
  (testing "POST /api/ee/content-translation/upload-dictionary"
    (testing "nonadmin cannot use"
      (mt/with-premium-features #{:content-translation}
        (is (=? "You don't have permissions to do that."
                (mt/user-http-request :rasta :post 403 "ee/content-translation/upload-dictionary"
                                      {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                      {:file (valid-csv-content)})))))
    (testing "admin can upload valid file"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (is (=? {:success true}
                  (mt/user-http-request :crowberto :post 200 "ee/content-translation/upload-dictionary"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file (.getBytes (valid-csv-content))})))
          (is (= 3 (count-translations))))))))

(deftest embedded-dictionary-test
  (testing "GET /api/ee/embedded-content-translation/dictionary/:token"
    (testing "requires content-translation feature"
      (with-static-embedding!
        (mt/with-premium-features #{}
          (mt/assert-has-premium-feature-error
           "Content translation"
           (client/client :get 402 (embedded-dictionary-url))))))
    (testing "requires locale"
      (with-static-embedding!
        (mt/with-premium-features #{:content-translation}
          (client/client :get 400 (embedded-dictionary-url)))))
    (testing "provides translations"
      (with-static-embedding!
        (ct-utils/with-clean-translations!
          (mt/with-temp [:model/ContentTranslation
                         {_ :id}
                         {:locale "sv" :msgid "blueberry" :msgstr "blåbär"}]
            (mt/with-premium-features #{:content-translation}
              (let [response (client/client :get 200 (str (embedded-dictionary-url) "?locale=sv"))]
                (is (map? response))
                (is (contains? response :data))
                (let [data (:data response)
                      translation (first data)]
                  (is (= 1 (count data)))
                  (is (= "sv" (:locale translation)))
                  (is (= "blueberry" (:msgid translation)))
                  (is (= "blåbär" (:msgstr translation))))))))))))
