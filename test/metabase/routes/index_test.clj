(ns metabase.routes.index-test
  (:require [cheshire.core :as json]
            [expectations :refer [expect]]
            [metabase.routes.index :as index]
            [metabase.test.util.log :as tu.log]
            [puppetlabs.i18n.core :refer [*locale*]]))

;; make sure `load-localization` is correctly loading i18n files (#9938)
(expect
  {"charset"      "utf-8"
   "headers"      {"mime-version"              "1.0"
                   "content-type"              "text/plain; charset=UTF-8"
                   "content-transfer-encoding" "8bit"
                   "x-generator"               "POEditor.com"
                   "project-id-version"        "Metabase"
                   "language"                  "es"
                   "plural-forms"              "nplurals=2; plural=(n != 1);"}
   "translations" {"" {"Your database has been added!" {"msgstr" ["¡Tu base de datos ha sido añadida!"]}}}}
  (some->
   (binding [*locale* "es"]
     (#'index/load-localization))
   json/parse-string))

;; if locale does not exist it should log a message and return the 'fallback' localalization (english)
(expect
  {"headers"      {"language" "xx", "plural-forms" "nplurals=2; plural=(n != 1);"}
   "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
  (tu.log/suppress-output
    (some->
     (binding [*locale* "xx"]
       (#'index/load-localization))
     json/parse-string)))

;; english should return the fallback localization (english)
(expect
  {"headers"      {"language" "en", "plural-forms" "nplurals=2; plural=(n != 1);"}
   "translations" {"" {"Metabase" {"msgid" "Metabase", "msgstr" ["Metabase"]}}}}
  (some->
   (binding [*locale* "en"]
     (#'index/load-localization))
   json/parse-string))
