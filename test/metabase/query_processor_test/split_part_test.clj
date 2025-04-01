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

(deftest ^:parallel split-part-test-examples
  (mt/test-drivers (mt/normal-drivers-with-feature :split-part)
    (let [mp (mt/metadata-provider)
          examples [{:text "ABC-123" :delimiter "-" :position 1 :expected "ABC" :msg "Easy case."}
                    {:text "ABC-123" :delimiter "-" :position 2 :expected "123" :msg "Easy case."}
                    ;;{:text "ABC-123" :delimiter "-" :position 0 :expected ""    :msg "Position too low."}
                    {:text "ABC-123" :delimiter "-" :position 3 :expected ""    :msg "Position too high."}

                    {:text "/ABC/123/" :delimiter "/" :position 1 :expected "" :msg "Empty part when delimiter is first char."}
                    {:text "/ABC/123/" :delimiter "/" :position 2 :expected "ABC" :msg "First part of path."}
                    {:text "/ABC/123/" :delimiter "/" :position 3 :expected "123" :msg "Second part of path."}
                    {:text "/ABC/123/" :delimiter "/" :position 4 :expected "" :msg "Empty part when delimiter is last char."}
                    {:text "/ABC/123/" :delimiter "/" :position 40 :expected "" :msg "Empty part when position out of bounds."}

                    {:text "ABC-123" :delimiter "," :position 1 :expected "ABC-123"    :msg "Delimiter doesn't exist."}

                    {:text "ABC-123" :delimiter "ABC-123" :position 1 :expected ""    :msg "Delimiter matches whole string."}
                    {:text "ABC-123" :delimiter "ABC-123" :position 2 :expected ""    :msg "Delimiter matches whole string."}

                    {:text "ABC-123" :delimiter "ABC-1235" :position 1 :expected "ABC-123"    :msg "Delimiter longer than whole string."}]]
      (doseq [{:keys [text delimiter position expected msg]} examples]
        (testing (str "split part: " msg)
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))])
                          (lib/expression "SPLITPART" (lib/split-part text delimiter position))
                          (lib/limit 1))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (= :type/Text (-> cols last :base_type)))
            (doseq [[_id split-string] rows]
              (is (string? split-string))
              (is (= expected split-string)
                  (str "Full field: " (pr-str text) ", Delimiter: " (pr-str delimiter) ", position: " position "; " msg)))))))))

(deftest ^:parallel split-part-test-corner-cases
  (mt/test-drivers (mt/normal-drivers-with-feature :split-part)
    (let [mp (mt/metadata-provider)]
      (testing "split part: empty delimiter should be empty string"
        (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                        (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))])
                        (lib/expression "SPLITPART" (lib/split-part "ABC-123-XYZ" "-" (lib/- 0 1)))
                        (lib/limit 1))
              result (-> query qp/process-query)
              cols (mt/cols result)
              rows (mt/rows result)]
          (is (= :type/Text (-> cols last :base_type)))
          (doseq [[_id split-string] rows]
            (is (string? split-string))
            (is (= "" split-string))))))))
