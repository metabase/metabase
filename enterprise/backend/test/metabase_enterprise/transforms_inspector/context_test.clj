(ns metabase-enterprise.transforms-inspector.context-test
  "Tests for transforms-inspector context that require runner language registration.
  Pre-existing :python tests moved here because transform-source-type now uses dynamic
  language registration instead of a hardcoded `case`."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-inspector.context :as context]
   [metabase.transforms.interface :as transforms.i]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [thunk]
                      (doseq [lang [:python :javascript :clojure]]
                        (transforms.i/register-runner! lang))
                      (thunk)))

(deftest extract-sources-python-test
  (testing "Python: extracts source tables from source-tables map"
    (let [transform {:source {:type :python
                              :source-tables {"orders" (mt/id :orders)}
                              :source-database (mt/id)}
                     :name "test"}
          sources (context/extract-sources transform)]
      (is (seq sources))
      (is (= (mt/id :orders) (:table-id (first sources))))
      (is (= (mt/id) (:db-id (first sources)))))))

(deftest extract-sources-python-multiple-tables-test
  (testing "Python: extracts multiple source tables"
    (let [transform {:source {:type :python
                              :source-tables {"orders" (mt/id :orders)
                                              "products" (mt/id :products)}
                              :source-database (mt/id)}
                     :name "test"}
          sources (context/extract-sources transform)
          table-ids (set (map :table-id sources))]
      (is (= 2 (count sources)))
      (is (contains? table-ids (mt/id :orders)))
      (is (contains? table-ids (mt/id :products))))))

(deftest extract-sources-all-runner-languages-test
  (testing "extract-sources works for all registered runner languages, not just :python"
    (doseq [lang [:python :javascript :clojure]]
      (testing (str lang)
        (let [transform {:source {:type lang
                                  :source-tables {"orders" (mt/id :orders)}
                                  :source-database (mt/id)}
                         :name "test"}
              sources (context/extract-sources transform)]
          (is (seq sources) (str "Expected sources for " lang))
          (is (= (mt/id :orders) (:table-id (first sources))))
          (is (= (mt/id) (:db-id (first sources)))))))))
