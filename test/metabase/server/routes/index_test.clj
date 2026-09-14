(ns metabase.server.routes.index-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.routes.index :as index]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]))

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

(def ^:private test-ee-plugin-manifest
  {"audit_app"  {"features" ["audit_app"]
                 "files"    ["ee-plugin-audit_app.1.js" "shared.2.js"]}
   "sandboxes"  {"features" ["sandboxes"]
                 "files"    ["ee-plugin-sandboxes.3.js" "shared.2.js" "ee-plugin-sandboxes.4.css"]}
   "custom_viz" {"features" ["custom-viz"]
                 "files"    ["ee-plugin-custom_viz.5.js"]}})

(deftest ee-plugin-files-test
  (mt/with-dynamic-fn-redefs [index/load-ee-plugin-manifest (constantly test-ee-plugin-manifest)]
    (testing "lists the files of every plugin with an enabled feature, each once"
      (is (= #{"ee-plugin-audit_app.1.js" "shared.2.js" "ee-plugin-sandboxes.3.js" "ee-plugin-sandboxes.4.css"}
             (set (#'index/ee-plugin-files {:audit_app true, :sandboxes true, :custom-viz false}))))
      (is (= 4 (count (#'index/ee-plugin-files {:audit_app true, :sandboxes true})))))
    (testing "reads hyphenated feature names as the frontend spells them"
      (is (= ["ee-plugin-custom_viz.5.js"]
             (#'index/ee-plugin-files {:custom-viz true}))))
    (testing "lists nothing when no plugin's features are enabled"
      (is (empty? (#'index/ee-plugin-files {:audit_app false})))
      (is (empty? (#'index/ee-plugin-files nil))))))

(deftest ee-plugin-preloads-test
  (mt/with-dynamic-fn-redefs [index/load-ee-plugin-manifest (constantly test-ee-plugin-manifest)]
    (is (= (str "<link rel=\"preload\" href=\"app/dist/ee-plugin-sandboxes.3.js\" as=\"script\">\n    "
                "<link rel=\"preload\" href=\"app/dist/shared.2.js\" as=\"script\">\n    "
                "<link rel=\"preload\" href=\"app/dist/ee-plugin-sandboxes.4.css\" as=\"style\">")
           (#'index/ee-plugin-preloads {:sandboxes true})))
    (testing "renders nothing for an edition without the manifest"
      (mt/with-dynamic-fn-redefs [index/load-ee-plugin-manifest (constantly nil)]
        (is (= "" (#'index/ee-plugin-preloads {:sandboxes true})))))))
