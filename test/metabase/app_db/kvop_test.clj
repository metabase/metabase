(ns metabase.app-db.kvop-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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

(deftest marked-kv-arg-on-transformed-column-test
  (testing "a column's :in transform applies to a marker's payload, so a marked kv-arg compiles as the unmarked one does"
    (are [marked unmarked] (= (t2/compile (t2/select :model/FieldValues :type unmarked))
                              (t2/compile (t2/select :model/FieldValues :type marked)))
      [:auto/param :full]                  :full
      [:in [:auto/param [:full :sandbox]]] [:in [:full :sandbox]]
      [:not= [:auto/param :full]]          [:not= :full])))
