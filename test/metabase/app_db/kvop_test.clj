(ns metabase.app-db.kvop-test
  (:require [clojure.test :refer :all] [metabase.test :as mt] [toucan2.core :as t2]))

(deftest marker-goes-on-the-value-not-the-operator-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}
                 :model/ContentTranslation _ {:locale "fr" :msgid "c" :msgstr "d"}]
    (testing "a marker inside an operator form binds the value"
      (is (= ["de" "fr"]
             (sort (map :locale (t2/select :model/ContentTranslation
                                           :locale [:in [:auto/param ["de" "fr"]]])))))
      (is (= ["fr"]
             (map :locale (t2/select :model/ContentTranslation
                                     :locale [:not= [:auto/param "de"]])))))
    (testing "marking the whole operator form throws rather than changing the comparison"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Marked a whole operator form"
           (t2/select :model/ContentTranslation :locale [:auto/param [:in ["de" "fr"]]]))))))
