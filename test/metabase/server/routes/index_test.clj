(ns metabase.server.routes.index-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.routes.index :as index]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]))

(defn- with-manifest
  "Runs `f` with the locales manifest replaced. `locales-manifest` is private, so this redefines
  the var rather than the symbol.

  Both cases are pinned explicitly, because whether a manifest exists on the classpath depends on
  whether the translations build step has run in this tree."
  [manifest f]
  (with-redefs-fn {#'index/locales-manifest (constantly manifest)} f))

;; not ^:parallel: redefines a var
(deftest localization-json-file-name-test
  (testing "with no manifest, a locale resolves to its plain name"
    (with-manifest nil
      (fn []
        (is (= "frontend_client/app/locales/es.json"
               (#'index/localization-json-file-name "es")))
        (is (= "frontend_client/app/locales/es_MX.json"
               (#'index/localization-json-file-name "es-MX")))))))

;; not ^:parallel: redefines a var
(deftest localization-json-file-name-manifest-test
  (testing "a built tree resolves through the manifest, since the name carries a content hash"
    (with-manifest {"es"    "es.0123456789.json"
                    "es_MX" "es_MX.abcdef0123.json"}
      (fn []
        (is (= "frontend_client/app/locales/es.0123456789.json"
               (#'index/localization-json-file-name "es")))
        (is (= "frontend_client/app/locales/es_MX.abcdef0123.json"
               (#'index/localization-json-file-name "es-MX"))))))

  (testing "a locale the manifest does not list falls back to the plain name"
    (with-manifest {"es" "es.0123456789.json"}
      (fn []
        (is (= "frontend_client/app/locales/de.json"
               (#'index/localization-json-file-name "de")))))))

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
            (binding [i18n/*user-locale* "es_for_test"]
              (#'index/load-localization nil))
            json/decode
            (update "translations" select-keys [""])
            (update-in ["translations" ""] select-keys ["Your database has been added!"]))))))

(deftest ^:parallel fallback-localization-test
  (testing "if locale does not exist it should log a message and return the 'fallback' localalization (english)"
    (is (= {"headers"      {"language" "xx", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "xx"]
              (#'index/load-localization nil))
            json/decode)))))

(deftest ^:parallel english-test
  (testing "english should return the fallback localization (english)"
    (is (= {"headers"      {"language" "en", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "en"]
              (#'index/load-localization nil))
            json/decode)))))

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
              (#'index/load-localization "es_for_test"))
            json/decode
            (update "translations" select-keys [""])
            (update-in ["translations" ""] select-keys ["Your database has been added!"])))))
  (testing "an invalid override causes a fallback to English"
    (is (= {"headers"      {"language" "yy", "plural-forms" "nplurals=2; plural=(n != 1);"}
            "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
           (some->
            (binding [i18n/*user-locale* "xx"]
              (#'index/load-localization "yy"))
            json/decode)))))

(deftest load-entrypoint-template-contains-user-locale
  (binding [i18n/*user-locale* "es"]
    (is (= "es" (:language (#'index/template-parameters false {})))))
  (binding [i18n/*user-locale* "en"]
    (is (= "en" (:language (#'index/template-parameters false {})))))
  (mt/with-temporary-setting-values [site-locale "es"]
    ;; site locale is used as the default
    (is (= "es" (:language (#'index/template-parameters false {}))))
    ;; but we can override with the user locale
    (binding [i18n/*user-locale* "fr"]
      (is (= "fr" (:language (#'index/template-parameters false {})))))))
