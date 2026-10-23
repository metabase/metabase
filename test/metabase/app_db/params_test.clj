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

(deftest marker-binds-on-the-write-path-test
  (testing "a marked value is bound in an update"
    (mt/with-temp [:model/ContentTranslation {id :id} {:locale "de" :msgid "a" :msgstr "b"}]
      (t2/update! :model/ContentTranslation id {:msgstr [:auto/param "updated"]})
      (is (= "updated" (:msgstr (t2/select-one :model/ContentTranslation :id id))))))
  (testing "and in an insert"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (t2/insert! :model/ContentTranslation {:locale [:auto/param "fr"] :msgid "x" :msgstr "y"})
      (is (= ["y"] (map :msgstr (t2/select :model/ContentTranslation :locale "fr")))))))

(deftest a-query-without-markers-is-unchanged-test
  (testing "a plain query still runs -- the compile step leaves it alone"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (= ["b"] (map :msgstr (t2/select :model/ContentTranslation :locale "de"))))
      (is (= 1 (t2/count :model/ContentTranslation :locale "de"))))))

(deftest values-that-bind-as-several-arguments-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "x" :msgstr "ex"}
                 :model/ContentTranslation _ {:locale "fr" :msgid "y" :msgstr "why"}]
    (testing "a marked collection spreads across one argument per element"
      (is (= #{"ex" "why"}
             (set (map :msgstr (t2/select :model/ContentTranslation
                                          {:where [:in :locale [:auto/param ["de" "fr"]]]}))))))
    (testing "the same value marked twice binds twice"
      (is (= ["ex"]
             (map :msgstr (t2/select :model/ContentTranslation
                                     {:where [:and
                                              [:= :locale [:auto/param "de"]]
                                              [:not= :msgid [:auto/param "de"]]]})))))
    (testing "marked and unmarked values sit side by side"
      (is (= ["ex"]
             (map :msgstr (t2/select :model/ContentTranslation
                                     {:where [:and [:= :locale [:auto/param "de"]] [:= :msgid "x"]]})))))))

(deftest unmarked-string-is-already-a-literal-test
  (testing "an unmarked string was never the danger -- HoneySQL binds it"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (empty? (t2/select :model/ContentTranslation {:where [:= :locale "de' OR '1'='1"]})))
      (is (seq (t2/select :model/ContentTranslation {:where [:= :locale "de"]}))))))
