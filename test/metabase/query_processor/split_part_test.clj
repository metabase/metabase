(ns ^:mb/driver-tests metabase.query-processor.split-part-test
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
          delimiters [" "]
          indexes [(fn [] (lib/+ 0 1))]]
      (doseq [main-string main-strings
              delimiter delimiters
              index indexes]
        (testing "split part"
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                          (lib/with-fields [main-string])
                          (lib/expression "INDEX" (index))
                          (lib/expression "SPLITPART" (lib/split-part main-string delimiter (index)))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (= :type/Text (-> cols last :base_type)))
            (doseq [[main-string index split-string] rows]
              (is (string? split-string))
              (is (= (-> main-string
                         (str/split (re-pattern delimiter))
                         (get (dec (long index)) ""))
                     split-string)
                  (str "String: " (pr-str main-string) " Delimiter: " (pr-str delimiter) " Index: " index)))))))))

(deftest ^:parallel split-part-test-examples
  (mt/test-drivers (mt/normal-drivers-with-feature :split-part)
    (let [mp (mt/metadata-provider)
          examples [{:text "ABC-123" :delimiter "-" :position 1 :expected "ABC" :msg "Easy case."}
                    {:text "ABC-123" :delimiter "-" :position 2 :expected "123" :msg "Easy case."}
                    {:text "ABC-123" :delimiter "-" :position 3 :expected ""    :msg "Position too high."}

                    {:text "John Doe" :delimiter " " :position 1 :expected "John" :msg "Single space delimiter."}

                    {:text "/ABC/123/" :delimiter "/" :position 1 :expected ""    :msg "Empty part when delimiter is first char."}
                    {:text "/ABC/123/" :delimiter "/" :position 2 :expected "ABC" :msg "First part of path."}
                    {:text "/ABC/123/" :delimiter "/" :position 3 :expected "123" :msg "Second part of path."}
                    {:text "/ABC/123/" :delimiter "/" :position 4 :expected ""    :msg "Empty part when delimiter is last char."}
                    {:text "/ABC/123/" :delimiter "/" :position 9 :expected ""    :msg "Empty part when position out of bounds."}

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
    (let [mp (mt/metadata-provider)
          examples [{:position (lib/- 0 1) :msg "negative position should be empty string"}
                    {:position (lib/- 0 0) :msg "zero position should be empty string"}]]
      (doseq [{:keys [position msg]} examples]
        (testing (str "split part: " msg)
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))])
                          (lib/expression "SPLITPART" (lib/split-part "ABC-123-XYZ" "-" position))
                          (lib/limit 1))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (= :type/Text (-> cols last :base_type)))
            (doseq [[_id split-string] rows]
              (is (string? split-string))
              (is (= "" split-string)))))))))

(deftest ^:parallel split-part-test-illegal
  (mt/test-drivers (mt/normal-drivers-with-feature :split-part)
    (let [mp (mt/metadata-provider)
          examples [{:text "" :delimiter "" :position 1 :msg "Empty delimiter"}
                    {:text "" :delimiter (lib/concat "" "j") :position 1 :msg "expression delimiter"}
                    {:text "" :delimiter (lib.metadata/field mp (mt/id :people :id)) :position 1 :msg "field delimiter"}

                    {:text "John Doe" :delimiter " " :position 0 :msg "Zero position."}
                    {:text "John Doe" :delimiter " " :position -1 :msg "Negative position."}]]
      (doseq [{:keys [text delimiter position msg]} examples]
        (testing (str "split part: " msg)
          (is (thrown? Exception
                       (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                           (lib/with-fields [(lib.metadata/field mp (mt/id :people :id))])
                           (lib/expression "SPLITPART" (lib/split-part text delimiter position))
                           (lib/limit 1)))
              msg))))))
