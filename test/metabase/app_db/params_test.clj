(ns metabase.app-db.params-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.value-guard :as value-guard]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest bound-binds-inline-values-test
  (testing "an inline [:auto/param v] is bound as a SQL parameter and filters correctly"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                   :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
      (value-guard/bound [query {:where [:= :locale [:auto/param "de"]]}]
                         (is (= ["hallo"] (map :msgstr (t2/select :model/ContentTranslation query)))))))
  (testing "a value that looks like SQL is bound, not compiled"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (value-guard/bound [query {:where [:= :locale [:auto/param "de' OR '1'='1"]]}]
                         (is (empty? (t2/select :model/ContentTranslation query)))))))
