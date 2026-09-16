(ns metabase.app-db.empty-in-test
  "A literal that something downstream rewrites has to stay visible to it."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest empty-collection-is-not-lifted-test
  (testing "Toucan rewrites an empty :in to `false`; a bound parameter would leave invalid `IN ()`"
    (is (= (t2/compile (t2/select :model/ContentTranslation {:where [:in :id []]}))
           (t2/compile (t2/select :model/ContentTranslation {:where [:in :id [:auto/param []]]})))))
  (testing "and the same through a kv-arg"
    (is (= (t2/compile (t2/select :model/ContentTranslation :id [:in []]))
           (t2/compile (t2/select :model/ContentTranslation :id [:in [:auto/param []]]))))))

(deftest a-non-empty-collection-still-binds-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}
                 :model/ContentTranslation _ {:locale "fr" :msgid "c" :msgstr "d"}]
    (is (= ["de" "fr"]
           (sort (map :locale (t2/select :model/ContentTranslation
                                         {:where [:in :locale [:auto/param ["de" "fr"]]]})))))))

(deftest an-empty-collection-matches-nothing-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
    (is (empty? (t2/select :model/ContentTranslation {:where [:in :locale [:auto/param []]]})))))
