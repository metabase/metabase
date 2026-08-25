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

(deftest route-preload-tags-test
  (let [manifest [{:patterns ["/question/ask"] :files ["app/dist/metabot-query-builder.js"]}
                  {:patterns ["/question" "/question/*"] :files ["app/dist/query-builder.js"]}
                  {:patterns ["/dashboard/*"] :files ["app/dist/dashboard.js" "app/dist/dashboard.css"]}
                  {:patterns ["/metric/*"] :files ["app/dist/metrics.js"]}
                  {:patterns ["/setup"] :files ["app/dist/setup.js"]}
                  {:patterns ["/"] :files ["app/dist/home.js"]}]
        tags-for (fn tags-for
                   ([uri] (tags-for uri true))
                   ([uri signed-in?]
                    (with-redefs-fn {#'index/load-route-preloads
                                     (constantly (mapv #'index/compile-entry manifest))}
                      (fn [] (#'index/route-preload-tags uri signed-in?)))))]
    (testing "a wildcard covers the section below it"
      (is (= (str "<link rel=\"preload\" href=\"app/dist/dashboard.js\" as=\"script\" fetchpriority=\"low\">"
                  "<link rel=\"preload\" href=\"app/dist/dashboard.css\" as=\"style\" fetchpriority=\"low\">")
             (tags-for "/dashboard/42"))))
    (testing "the first matching row wins"
      (is (= "<link rel=\"preload\" href=\"app/dist/metabot-query-builder.js\" as=\"script\" fetchpriority=\"low\">"
             (tags-for "/question/ask")))
      (is (= "<link rel=\"preload\" href=\"app/dist/query-builder.js\" as=\"script\" fetchpriority=\"low\">"
             (tags-for "/question/12-orders"))))
    (testing "the home page matches only the whole path"
      (is (= "<link rel=\"preload\" href=\"app/dist/home.js\" as=\"script\" fetchpriority=\"low\">"
             (tags-for "/")))
      (is (nil? (tags-for "/xyzzy"))))
    (testing "a section does not claim a URL that merely starts with its name"
      (is (nil? (tags-for "/metrics/1"))))
    (testing "a signed-out visitor is redirected to the login page, so gets no hints"
      (is (nil? (tags-for "/dashboard/42" false)))
      (is (nil? (tags-for "/" false))))
    (testing "except on setup, which runs before any user exists"
      (is (= "<link rel=\"preload\" href=\"app/dist/setup.js\" as=\"script\" fetchpriority=\"low\">"
             (tags-for "/setup" false)))))
  (testing "no manifest, no hints"
    (is (nil? (with-redefs-fn {#'index/load-route-preloads (constantly nil)}
                (fn [] (#'index/route-preload-tags "/" true)))))))
