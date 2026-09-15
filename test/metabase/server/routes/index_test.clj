(ns metabase.server.routes.index-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.routes.index :as index]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]))

(deftest ^:parallel catalogue-locale-test
  (testing "a locale with a catalogue resolves to itself (#9938)"
    (is (= "es" (#'index/catalogue-locale "es")))
    (is (= "pt_BR" (#'index/catalogue-locale "pt-BR"))))
  (testing "a locale without a catalogue falls back to the one its language has"
    (is (= "es" (#'index/catalogue-locale "es-MX"))))
  (testing "english has no catalogue, it is the msgid source"
    (is (= "en" (#'index/catalogue-locale "en"))))
  (testing "an unknown locale falls back to english"
    (is (= "en" (#'index/catalogue-locale "xx"))))
  (testing "no locale at all falls back to english"
    (is (= "en" (#'index/catalogue-locale nil)))))

(deftest ^:parallel locale-scripts-test
  (testing "deferred, so the parser is not blocked and document order still holds"
    (is (= "<script defer src=\"app/dist/locale-es-json.abc123.js\"></script>"
           (#'index/locale-scripts ["app/dist/locale-es-json.abc123.js"]))))
  (testing "english needs none, and neither does a build that has not run"
    (is (= "" (#'index/locale-scripts [])))))

(deftest template-locales-test
  (testing "the document names the catalogues to load rather than carrying them"
    (binding [i18n/*user-locale* "es"]
      (is (= "es" (:userLocale (#'index/template-parameters false {})))))
    (mt/with-temporary-setting-values [site-locale "es"]
      (is (= "es" (:siteLocale (#'index/template-parameters false {}))))))
  (testing "a locale url parameter overrides the user locale, except on static embeds"
    (binding [i18n/*user-locale* "en"]
      (is (= "es"
             (:userLocale (#'index/template-parameters false {:params {:locale "es"}}))))
      (is (= "en"
             (:userLocale (#'index/template-parameters true {:params {:locale "es"}})))))))

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
