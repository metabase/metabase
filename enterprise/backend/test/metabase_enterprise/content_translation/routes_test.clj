(ns metabase-enterprise.content-translation.routes-test
  "Tests for content translation API endpoints."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [metabase-enterprise.content-translation.utils :as ct-utils]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private valid-csv
  (.getBytes
   (str "Language,String,Translation"
        "\nde,Title,Titel"
        "\nde,Rating,Bewertung"
        "\nde,Vendor,Anbieter")))

(def ^:private csv-with-duplicate-translation
  (.getBytes
   (str "Language,String,Translation"
        "\nde,Title,Titel"
        "\nde,Rating,Bewertung"
        "\nde,Vendor,Anbieter"
        "\nde,Vendor,Verkäufer")))

(def ^:private csv-with-invalid-locale
  (.getBytes
   (str "Language,String,Translation"
        "\nde,Title,Titel"
        "\nde,Rating,Bewertung"
        "\nXX,Vendor,Anbieter")))

(def ^:private invalid-csv
  (.getBytes
   (str "Language,String,Translation"
        "\nde,Title,Titel"
        "\nde,Rating,Bewertung"
        "\nde,Vendor,\"Anbieter\"!"))) ; Trailing character

(defn- count-translations
  "Count the number of translations in the database."
  []
  (count (t2/select :model/ContentTranslation)))

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
        (mt/with-temp [:model/ContentTranslation _ {:locale "fr" :msgid "Hello" :msgstr "Bonjour"}]
          (mt/with-premium-features #{:content-translation}
            (let [body (mt/user-http-request :crowberto :get 200 "ee/content-translation/csv" {})
                  data (with-open [reader (java.io.StringReader. body)]
                         (doall (csv/read-csv reader)))
                  matches (filter #(and (= (nth % 0) "fr")
                                        (= (nth % 1) "Hello")
                                        (= (nth % 2) "Bonjour"))
                                  data)]
              (is (seq matches)))))))
    (testing "returns sample translations when content-translation table is empty"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (let [body (mt/user-http-request :crowberto :get 200 "ee/content-translation/csv" {})
                data (with-open [reader (java.io.StringReader. body)]
                       (doall (csv/read-csv reader)))
                matches (filter #(and (= (nth % 0) "de")
                                      (= (nth % 1) "Sample translation"))
                                data)]
            (is (seq matches)))))))
  (testing "POST /api/ee/content-translation/upload-dictionary"
    (testing "nonadmin cannot use"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (is (=? "You don't have permissions to do that."
                  (mt/user-http-request :rasta :post 403 "ee/content-translation/upload-dictionary"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file valid-csv}))))))
    (testing "admin can upload valid file"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (is (=? {:success true}
                  (mt/user-http-request :crowberto :post 200 "ee/content-translation/upload-dictionary"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file valid-csv})))
          (is (= 3 (count-translations))))))
    (testing "admin sees useful error when uploaded file has invalid csv"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (is (=? {:errors ["Error Parsing CSV at Row 4: CSV error (unexpected character: !)"]}
                  (mt/user-http-request :crowberto :post 422 "ee/content-translation/upload-dictionary"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file invalid-csv}))))))
    (testing "admin sees error when file has duplicate translations"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (is (=? {:errors ["Row 5: The string \"Vendor\" is translated into locale \"de\" earlier in the file"]}
                  (mt/user-http-request :crowberto :post 422 "ee/content-translation/upload-dictionary"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file csv-with-duplicate-translation}))))))
    (testing "admin sees error when file has invalid locale"
      (ct-utils/with-clean-translations!
        (mt/with-premium-features #{:content-translation}
          (is (=? {:errors ["Row 4: Invalid locale: xx"]}
                  (mt/user-http-request :crowberto :post 422 "ee/content-translation/upload-dictionary"
                                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                        {:file csv-with-invalid-locale}))))))))

(defn random-embedding-secret-key [] (u.random/secure-hex 32))

(defn do-with-new-secret-key! [f]
  (let [secret-key (random-embedding-secret-key)]
    (mt/with-temporary-setting-values [embedding-secret-key secret-key]
      (f secret-key))))

(defmacro with-new-secret-key! ^{:style/indent 0} [binding & body]
  `(do-with-new-secret-key! (fn ~binding ~@body)))

(defmacro with-static-embedding! ^{:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding-static true]
     ~@body))

(defn- embedded-dictionary-url [token]
  (str "/ee/content-translation/dictionary/" token))

(deftest embedded-dictionary-test
  (with-static-embedding!
    (ct-utils/with-clean-translations!
      (with-new-secret-key!
        [k]
        (mt/with-premium-features #{:content-translation}
          (testing "GET /api/ee/content-translation/dictionary/:token"
            (testing "provides translations"
              (mt/with-temp [:model/ContentTranslation _ {:locale "sv" :msgid "blueberry" :msgstr "blåbär"}]
                (let [resp (client/client :get 200
                                          (str (embedded-dictionary-url (jwt/sign {} k))
                                               "?locale=sv"))]
                  (is (= 1 (count (:data resp))))
                  (is (=? {:data [{:locale "sv"
                                   :msgid "blueberry"
                                   :msgstr "blåbär"}]}
                          resp)))))
            (testing "normalizes locale"
              (mt/with-temp [:model/ContentTranslation _ {:locale "pt_BR" :msgid "blueberry" :msgstr "mirtilo"}]
                (let [resp (client/client :get 200
                                          (str (embedded-dictionary-url (jwt/sign {} k))
                                               ; The locale has a hyphen here, but it should be normalized to match the
                                               ; locale in the content-translation table
                                               "?locale=pt-BR"))]
                  (is (= 1 (count (:data resp))))
                  (is (=? {:data [{:locale "pt_BR"
                                   :msgid "blueberry"
                                   :msgstr "mirtilo"}]}
                          resp)))))
            (testing "requires content-translation feature"
              (mt/with-premium-features #{}
                (mt/assert-has-premium-feature-error
                 "Content translation"
                 (client/client :get 402 (str (embedded-dictionary-url (jwt/sign {} k))
                                              "?locale=sv")))))
            (testing "requires locale"
              (is (= "Locale is required."
                     (client/client :get 400 (embedded-dictionary-url (jwt/sign {} k))))))
            (testing "requires valid token"
              (is (= "Message seems corrupt or manipulated"
                     (client/client :get 400 (str (embedded-dictionary-url
                                                   (jwt/sign {} (random-embedding-secret-key)))
                                                  "?locale=sv")))))))))))

(deftest authenticated-dictionary-test
  (testing "GET /api/ee/content-translation/dictionary"
    (ct-utils/with-clean-translations!
      (mt/with-premium-features #{:content-translation}
        (testing "requires authentication"
          (is (= "Unauthenticated"
                 (client/client :get 401 "ee/content-translation/dictionary?locale=sv"))))
        (testing "requires locale parameter"
          (is (=? {:errors {:locale some?}}
                  (mt/user-http-request :rasta :get 400 "ee/content-translation/dictionary"))))
        (testing "returns translations for authenticated user"
          (mt/with-temp [:model/ContentTranslation _ {:locale "sv" :msgid "blueberry" :msgstr "blåbär"}]
            (is (=? {:data [{:locale "sv"
                             :msgid "blueberry"
                             :msgstr "blåbär"}]}
                    (mt/user-http-request :rasta :get 200 "ee/content-translation/dictionary?locale=sv")))))
        (testing "normalizes locale"
          (mt/with-temp [:model/ContentTranslation _ {:locale "pt_BR" :msgid "blueberry" :msgstr "mirtilo"}]
            (is (=? {:data [{:locale "pt_BR"
                             :msgid "blueberry"
                             :msgstr "mirtilo"}]}
                    (mt/user-http-request :rasta :get 200 "ee/content-translation/dictionary?locale=pt-BR")))))))
    (testing "requires content-translation feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Content translation"
         (mt/user-http-request :rasta :get 402 "ee/content-translation/dictionary?locale=sv"))))))
