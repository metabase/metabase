(ns metabase.app-db.kv-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest kv-arg-marker-binds-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                 :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
    (testing "a marker in a kv-arg binds the value"
      (is (= ["hallo"] (map :msgstr (t2/select :model/ContentTranslation
                                               :locale [:auto/param "de"])))))
    (testing "a value that looks like SQL matches nothing"
      (is (empty? (t2/select :model/ContentTranslation :locale [:auto/param "de' OR '1'='1"]))))
    (testing "several marked kv-args each bind"
      (is (= ["hallo"] (map :msgstr (t2/select :model/ContentTranslation
                                               :locale [:auto/param "de"]
                                               :msgid  [:auto/param "hello"])))))
    (testing "marked and unmarked kv-args together"
      (is (= ["hallo"] (map :msgstr (t2/select :model/ContentTranslation
                                               :locale [:auto/param "de"]
                                               :msgid  "hello")))))
    (testing "other t2 fns take a marked kv-arg"
      (is (t2/exists? :model/ContentTranslation :locale [:auto/param "de"]))
      (is (= 1 (t2/count :model/ContentTranslation :locale [:auto/param "de"]))))))
