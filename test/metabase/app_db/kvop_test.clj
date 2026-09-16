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
      (are [form] (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                    (t2/select :model/ContentTranslation form))
        ;; a query map, not only a kv-arg
        {:where [:= :locale [:auto/param [:in ["de"]]]]}
        {:where [:= :locale [:auto/param [:lower :x]]]})
      (are [v] (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked a whole operator form"
                                 (t2/select :model/ContentTranslation :locale v))
        [:auto/param [:in ["de" "fr"]]]
        ;; an operator the check does not have to know by name
        [:auto/param [:not-between 1 5]]
        [:auto/param [:regexp "x"]]))))
