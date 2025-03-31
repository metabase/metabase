(ns ^:mb/driver-tests metabase.query-processor-test.split-part-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel split-part-test
  (mt/test-drivers (mt/normal-drivers-with-feature :split-part)
    (let [mp (mt/metadata-provider)
          main-strings [(lib.metadata/field mp (mt/id :people :name))
                        (lib.metadata/field mp (mt/id :people :zip))
                        (lib.metadata/field mp (mt/id :people :password))
                        (lib.metadata/field mp (mt/id :people :address))]
          delimiters [" " "-" "7"]
          indexes [1 2 3]]
      (doseq [main-string main-strings
              delimiter delimiters
              index indexes]
        (testing "split part"
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                          (lib/with-fields [main-string])
                          (lib/expression "SPLITPART" (lib/split-part main-string delimiter index))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (= :type/Text (-> cols last :base_type)))
            (doseq [[main-string split-string] rows]
              (is (string? split-string))
              (is (= (-> main-string
                         (str/split (re-pattern delimiter))
                         (get (dec index) ""))
                     split-string)
                  (str "Full field: " (pr-str main-string) ", Delimiter: " (pr-str delimiter) ", position: " index)))))))))

(deftest ^:parallel split-part-test-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :split-part)
    (let [mp (mt/metadata-provider)
          main-strings [(lib.metadata/field mp (mt/id :people :name))
                        (lib.metadata/field mp (mt/id :people :zip))
                        (lib.metadata/field mp (mt/id :people :password))
                        (lib.metadata/field mp (mt/id :people :address))]
          delimiters [(fn [] (lib/concat " " ""))]
          indexes [(fn [] (lib/+ 0 1))]]
      (doseq [main-string main-strings
              delimiter delimiters
              index indexes]
        (testing "split part"
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                          (lib/with-fields [main-string])
                          (lib/expression "DELIMITER" (delimiter))
                          (lib/expression "INDEX" (index))
                          (lib/expression "SPLITPART" (lib/split-part main-string (delimiter) (index)))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (= :type/Text (-> cols last :base_type)))
            (doseq [[main-string delimiter index split-string] rows]
              (is (string? split-string))
              (is (= (-> main-string
                         (str/split (re-pattern delimiter))
                         (get (dec index) ""))
                     split-string)))))))))
