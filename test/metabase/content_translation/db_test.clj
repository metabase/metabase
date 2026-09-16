(ns metabase.content-translation.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-translation.db :as content-translation.db]
   [metabase.test :as mt]))

(deftest translations-for-locale-test
  (testing "filters to the requested locale"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                   :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
      (is (= ["hallo"] (map :msgstr (content-translation.db/translations-for-locale "de"))))))
  (testing "a locale that looks like SQL is compared as a string, matching nothing"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}]
      (is (empty? (content-translation.db/translations-for-locale "de' OR '1'='1")))))
  (testing "a non-string locale is rejected before it reaches the query"
    (is (thrown? clojure.lang.ExceptionInfo
                 (content-translation.db/translations-for-locale {:raw "(SELECT 1)"})))))
