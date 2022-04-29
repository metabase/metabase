(ns metabase.server.routes.index-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.server.routes.index :as index]
            [metabase.test :as mt]
            [metabase.util.i18n :as i18n]))

(deftest localization-json-file-name-test
  (is (= "frontend_client/app/locales/es.json"
         (#'index/localization-json-file-name "es")))
  (is (= "frontend_client/app/locales/es_MX.json"
         (#'index/localization-json-file-name "es-MX"))))

(comment
  (into {}
        (comp (remove (comp #{"en"} first))
              (map (fn [[l _human]]
                     [l (-> (slurp (clojure.java.io/resource (#'index/localization-json-file-name l)))
                            json/parse-string
                            (get-in ["headers" "language"]))])))
        (i18n/available-locales-with-names))
  )

(def ^:private po-header-langues
  "Map from our locale string to the locale declared in the headers of our po editor json
  files (resources/frontend_client/app/locales/<locale>.json)."
  {"nl"    "nl"
   "zh"    "zh-Hans"
   "sr"    "sr"
   "tr"    "tr"
   "it"    "it"
   "fa"    "fa"
   "zh_HK" "zh-hk"
   "vi"    "vi"
   "id"    "id"
   "uk"    "uk"
   "pl"    "pl"
   "zh_TW" "zh-TW"
   "ca"    "ca"
   "sv"    "sv"
   "fr"    "fr"
   "de"    "de"
   "nb"    "nb"
   "ru"    "ru"
   "sk"    "sk"
   "es"    "es"
   "ja"    "ja"
   "cs"    "cs"
   "bg"    "bg"
   "pt_BR" "pt-br"})

(deftest load-localization-test
  (testing "make sure `load-localization` is correctly loading i18n files (#9938)"
    (is (= {"charset"      "utf-8"
            "headers"      {"mime-version"              "1.0"
                            "content-type"              "text/plain; charset=UTF-8"
                            "content-transfer-encoding" "8bit"
                            "x-generator"               "POEditor.com"
                            "project-id-version"        "Metabase"
                            "language"                  "es"
                            "plural-forms"              "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Your database has been added!" {"msgstr" ["¡Tu base de datos ha sido añadida!"]}}}}
           (some->
            (binding [i18n/*user-locale* "es"]
              (#'index/load-localization))
            json/parse-string
            (update "translations" select-keys [""])
            (update-in ["translations" ""] select-keys ["Your database has been added!"])))))
  (testing "Localization files exist for all available locales"
    (letfn [(locale-json [] (-> (#'index/load-localization)
                                json/parse-string
                                (get "headers")
                                (select-keys ["language" "x-generator"])))]
      (testing "Setting site-locale finds localization json files for the frontend."
        (doseq [[localization human-readable] (i18n/available-locales-with-names)]
          (mt/with-temporary-setting-values [site-locale localization]
            (when-not (= "en" localization)
              ;; asserting that it found a json file created from the POEditor and the language is what we expect (ie,
              ;; not "id" -> "in" and the frontend blows up.)
              (is (= {"language" (po-header-langues localization)
                      "x-generator" "POEditor.com"}
                     (locale-json))
                  (format "Localization json file does not say exact same localization: %s (%s)" localization human-readable))))))
      (testing "Setting user-locale finds localization json files for the frontend"
        (doseq [[localization human-readable] (i18n/available-locales-with-names)]
          (binding [i18n/*user-locale* localization]
            (when-not (= "en" localization)
              (is (= {"language" (po-header-langues localization)
                      "x-generator" "POEditor.com"}
                     (locale-json))
                  (format "Localization json file does not say exact same localization: %s (%s)" localization human-readable)))))))))

(deftest fallback-localization-test
  (testing "if locale does not exist it should log a message and return the 'fallback' localalization (english)"
    (is (= {"headers"      {"language" "xx", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (mt/suppress-output
             (some->
              (binding [i18n/*user-locale* "xx"]
                (#'index/load-localization))
              json/parse-string))))))

(deftest english-test
  (testing "english should return the fallback localization (english)"
    (is (= {"headers"      {"language" "en", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "en"]
              (#'index/load-localization))
            json/parse-string)))))
