(ns metabase.server.routes.index-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.server.routes.index :as index]
   [metabase.util.i18n :as i18n]))

(deftest ^:parallel localization-json-file-name-test
  (is (= "frontend_client/app/locales/es.json"
         (#'index/localization-json-file-name "es")))
  (is (= "frontend_client/app/locales/es_MX.json"
         (#'index/localization-json-file-name "es-MX"))))

(deftest ^:parallel load-localization-test
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
              (#'index/load-localization nil))
            json/parse-string
            (update "translations" select-keys [""])
            (update-in ["translations" ""] select-keys ["Your database has been added!"]))))))

(deftest ^:parallel fallback-localization-test
  (testing "if locale does not exist it should log a message and return the 'fallback' localalization (english)"
    (is (= {"headers"      {"language" "xx", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "xx"]
              (#'index/load-localization nil))
            json/parse-string)))))

(deftest ^:parallel english-test
  (testing "english should return the fallback localization (english)"
    (is (= {"headers"      {"language" "en", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "en"]
              (#'index/load-localization nil))
            json/parse-string)))))

(deftest ^:parallel override-localization-test
  (testing "a valid override is honored no matter what the user locale is"
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
            (binding [i18n/*user-locale* "xx"]
              (#'index/load-localization "es"))
            json/parse-string
            (update "translations" select-keys [""])
            (update-in ["translations" ""] select-keys ["Your database has been added!"])))))

  (testing "an invalid override causes a fallback to English"
    (is (= {"headers"      {"language" "yy", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "xx"]
              (#'index/load-localization "yy"))
            json/parse-string)))))
