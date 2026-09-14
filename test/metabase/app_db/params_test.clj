(ns metabase.app-db.params-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest auto-param-is-lifted-by-the-pipeline-test
  (testing "an inline [:auto/param v] is bound as a SQL parameter with no wrapper at the call site"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                   :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
      (is (= ["hallo"]
             (map :msgstr
                  (t2/select :model/ContentTranslation
                             {:where [:= :locale [:auto/param "de"]]}))))))
  (testing "a value that looks like SQL is bound, not compiled"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (empty? (t2/select :model/ContentTranslation
                             {:where [:= :locale [:auto/param "de' OR '1'='1"]]})))))
  (testing "several markers in one query each get their own binding"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "x" :msgstr "ex"}
                   :model/ContentTranslation _ {:locale "de" :msgid "y" :msgstr "why"}]
      (is (= ["ex"]
             (map :msgstr
                  (t2/select :model/ContentTranslation
                             {:where [:and
                                      [:= :locale [:auto/param "de"]]
                                      [:= :msgid [:auto/param "x"]]]})))))))
