(ns metabase.app-db.params-test
  "End-to-end: a marked value reaches the database as a parameter."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest marked-value-is-bound-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                 :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
    (testing "the query filters on the bound value"
      (is (= ["hallo"]
             (map :msgstr (t2/select :model/ContentTranslation
                                     {:where [:= :locale [:auto/param "de"]]})))))
    (testing "a value that looks like SQL is compared as data and matches nothing"
      (is (empty? (t2/select :model/ContentTranslation
                             {:where [:= :locale [:auto/param "de' OR '1'='1"]]}))))
    (testing "several markers in one query each bind separately"
      (is (= ["hallo"]
             (map :msgstr (t2/select :model/ContentTranslation
                                     {:where [:and
                                              [:= :locale [:auto/param "de"]]
                                              [:= :msgid [:auto/param "hello"]]]})))))))

(deftest unmarked-string-is-already-a-literal-test
  (testing "an unmarked string was never the danger -- HoneySQL binds it"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (empty? (t2/select :model/ContentTranslation {:where [:= :locale "de' OR '1'='1"]})))
      (is (seq (t2/select :model/ContentTranslation {:where [:= :locale "de"]}))))))
