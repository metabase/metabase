(ns metabase.server.routes.index-test
  (:require
   [clojure.test :refer :all]
   [clout.core :as clout]
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
  (let [tag (fn [file kind] (format "<link rel=\"preload\" href=\"%s\" as=\"%s\" fetchpriority=\"low\">" file kind))
        manifest [["/question/ask" (tag "app/dist/metabot-query-builder.js" "script") false]
                  ["/question" (tag "app/dist/query-builder.js" "script") false]
                  ["/question/*" (tag "app/dist/query-builder.js" "script") false]
                  ["/dashboard/*" (str (tag "app/dist/dashboard.js" "script")
                                       (tag "app/dist/dashboard.css" "style"))
                   false]
                  ["/metric/*" (tag "app/dist/metrics.js" "script") false]
                  ["/setup" (tag "app/dist/setup.js" "script") true]
                  ["/" (tag "app/dist/home.js" "script") false]]
        tags-for (fn tags-for
                   ([uri] (tags-for uri true))
                   ([uri signed-in?]
                    (with-redefs-fn {#'index/route-preloads
                                     (constantly
                                      (mapv (fn [[pattern markup render-when-signed-out?]]
                                              [(clout/route-compile pattern) markup render-when-signed-out?])
                                            manifest))}
                      (fn [] (#'index/route-preload-tags uri signed-in?)))))]
    (testing "a wildcard covers the section below it"
      (is (= (str (tag "app/dist/dashboard.js" "script")
                  (tag "app/dist/dashboard.css" "style"))
             (tags-for "/dashboard/42"))))
    (testing "the first matching row wins"
      (is (= (tag "app/dist/metabot-query-builder.js" "script") (tags-for "/question/ask")))
      (is (= (tag "app/dist/query-builder.js" "script") (tags-for "/question/12-orders"))))
    (testing "the home page matches only the whole path"
      (is (= (tag "app/dist/home.js" "script") (tags-for "/")))
      (is (nil? (tags-for "/xyzzy"))))
    (testing "a section does not claim a URL that merely starts with its name"
      (is (nil? (tags-for "/metrics/1"))))
    (testing "a signed-out visitor is redirected to the login page, so gets no hints"
      (is (nil? (tags-for "/dashboard/42" false)))
      (is (nil? (tags-for "/" false))))
    (testing "except on setup, which runs before any user exists"
      (is (= (tag "app/dist/setup.js" "script") (tags-for "/setup" false)))))
  (testing "no manifest, no hints"
    (is (nil? (with-redefs-fn {#'index/route-preloads (constantly nil)}
                (fn [] (#'index/route-preload-tags "/" true)))))))
