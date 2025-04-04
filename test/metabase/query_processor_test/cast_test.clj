(ns ^:mb/driver-tests metabase.query-processor-test.cast-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.types :as types]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; integer()

;; we test that it's a :type/Number because some databases return:
;;  * :type/BigInteger
;;  * :type/Integer
;;  * :type/Number

(deftest ^:parallel integer-cast-table-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip :db-type "TEXT"}]]]
                {:keys [field db-type]} fields]
          (testing (str "casting " table "." field "(" db-type ") to integer")
            (let [field-md (lib.metadata/field mp (mt/id table field))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/with-fields [field-md])
                            (lib/expression "INTCAST" (lib/integer field-md))
                            (lib/limit 100))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Number (last cols)))
              (doseq [[uncasted-value casted-value] rows]
                (is (= (biginteger (Long/parseLong uncasted-value))
                       (biginteger casted-value)))))))))))

(deftest ^:parallel integer-cast-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]]
                {:keys [expression db-type]} expressions]
          (testing (str "Casting " db-type " to integer")
            (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                            (lib/expression "UNCASTED" expression)
                            (as-> q
                                  (lib/expression q "INTCAST" (lib/integer (lib/expression-ref q "UNCASTED"))))
                            (lib/limit 10))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Number (last cols)))
              (doseq [[_ uncasted-value casted-value] rows]
                (is (= (biginteger (Long/parseLong uncasted-value))
                       (biginteger casted-value)))))))))))

(deftest ^:parallel integer-cast-nested-native-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [{:keys [expression db-type]} [{:expression "'123'"  :db-type "TEXT"}
                                              {:expression "'-123'" :db-type "TEXT"}]]
          (testing (str "Casting " db-type " to integer from native query")
            (let [native-query (mt/native-query {:query (str "SELECT " expression " AS UNCASTED")})]
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query native-query)]
                (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [])
                                (as-> q
                                      (lib/expression q "UNCAST" (->> q lib/visible-columns (filter #(= "uncasted" (u/lower-case-en (:name %)))) first)))
                                (as-> q
                                      (lib/expression q "INTCAST" (lib/integer (->> q lib/visible-columns (filter #(= "uncasted" (u/lower-case-en (:name %)))) first)))))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (types/field-is-type? :type/Number (last cols)))
                  (doseq [[_ uncasted-value casted-value] rows]
                    (is (= (biginteger (Long/parseLong uncasted-value))
                           (biginteger casted-value)))))))))))))

(deftest ^:parallel integer-cast-nested-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip :db-type "TEXT"}]]]
                {:keys [field db-type]} fields]
          (let [nested-query (lib/query mp (lib.metadata/table mp (mt/id table)))]
            (testing (str "Casting " db-type " to integer")
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query nested-query)]
                (let [field-md (lib.metadata/field mp (mt/id table field))
                      query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [field-md])
                                (as-> q
                                      (lib/expression q "INTCAST" (lib/integer field-md)))
                                (lib/limit 100))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (types/field-is-type? :type/Number (last cols)))
                  (doseq [[uncasted-value casted-value] rows]
                    (is (= (biginteger (Long/parseLong uncasted-value))
                           (biginteger casted-value)))))))))))))

(deftest ^:parallel integer-cast-nested-query-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]]
                {:keys [expression db-type]} expressions]
          (let [nested-query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                                 (lib/with-fields [])
                                 (lib/expression "UNCASTED" expression)
                                 (lib/limit 10))]
            (testing (str "Casting " db-type " to integer")
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query nested-query)]
                (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                                (as-> q
                                      (lib/expression q "UNCAST" (->> q lib/visible-columns (filter #(= "UNCASTED" (:name %))) first)))
                                (as-> q
                                      (lib/expression q "INTCAST" (lib/integer (->> q lib/visible-columns (filter #(= "UNCASTED" (:name %))) first))))
                                (lib/limit 10))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (types/field-is-type? :type/Number (last cols)))
                  (doseq [[_ uncasted-value casted-value] rows]
                    (is (= (biginteger (Long/parseLong uncasted-value))
                           (biginteger casted-value)))))))))))))

(deftest ^:parallel integer-cast-nested-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (fn []
                                                              (lib/concat
                                                               (lib.metadata/field mp (mt/id :people :id))
                                                               (lib.metadata/field mp (mt/id :people :zip))))}]]]
                {ex :expression} expressions]
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                          (lib/expression "UNCASTED" (ex))
                          (lib/expression "INTCAST" (lib/integer (ex)))
                          (lib/limit 10))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Number (last cols)))
            (doseq [[_ uncasted-value casted-value] rows]
              (is (= (biginteger (Long/parseLong uncasted-value))
                     (biginteger casted-value))))))))))

(deftest ^:parallel integer-cast-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip}]]]
                {:keys [field]} fields]
          (testing (str "aggregating " table "." field " and casting to integer")
            (let [field-md (lib.metadata/field mp (mt/id table field))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/aggregate (lib/max field-md))
                            (lib/aggregate (lib/max (lib/integer field-md))))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Number (last cols)))
              (doseq [[uncasted-value casted-value] rows]
                (is (= (biginteger (Long/parseLong uncasted-value))
                       (biginteger casted-value)))))))))))

(deftest ^:parallel integer-cast-examples
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)
            examples [{:original "123" :value 123 :msg "Easy case."}
                      {:original "+123" :value 123 :msg "Initial + sign."}
                      {:original "00123" :value 123 :msg "Initial zeros."}
                      {:original "-123" :value -123 :msg "Negative sign."}
                      {:original (pr-str Long/MAX_VALUE) :value Long/MAX_VALUE :msg "Big number."}
                      {:original (pr-str Long/MIN_VALUE) :value Long/MIN_VALUE :msg "Big number."}]]
        (doseq [{:keys [original value msg]} examples]
          (testing (str "integer cast: " msg)
            (let [field-md (lib.metadata/field mp (mt/id :people :id))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                            (lib/with-fields [field-md])
                            (lib/expression "INTCAST" (lib/integer original))
                            (lib/limit 1))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Number (last cols)))
              (doseq [[_id casted-value] rows]
                (is (= (biginteger value)
                       (biginteger casted-value))
                    msg)))))))))

;; date()

(deftest ^:parallel date-parse-table-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/date)
    (let [mp (mt/metadata-provider)]
      (doseq [[table fields] [[:people [{:field :birth_date}]]]
              {:keys [field]} fields]
        (testing (str "casting " table "." field " to date")
          (let [field-md (lib.metadata/field mp (mt/id table field))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [field-md])
                          (lib/expression "DATECAST" (lib/date (lib/text field-md)))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Date (last cols)))
            (doseq [[uncasted-value casted-value] rows]
              (let [cd (-> casted-value java.time.Instant/parse)
                    ud (-> uncasted-value java.time.Instant/parse)]
                (is (= ud cd))))))))))

(deftest ^:parallel date-parse-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/date)
    (let [mp (mt/metadata-provider)]
      (doseq [[table exprs] [[:people [(fn [] (lib/concat "2010" "-" "10" "-" "02"))]]]
              ef exprs]
        (testing "casting custom expression to date"
          (let [field-md (lib.metadata/field mp (mt/id table :id))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [field-md])
                          (lib/expression "CUSTOMEXPR" (ef))
                          (lib/expression "DATECAST" (lib/date (ef)))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Date (last cols)))
            (doseq [[_ uncasted-value casted-value] rows]
              (let [cd (-> casted-value java.time.Instant/parse)
                    ud (-> uncasted-value
                           java.time.LocalDate/parse
                           (.atStartOfDay (java.time.ZoneId/of "UTC"))
                           .toInstant)]
                (is (= ud cd))))))))))

(deftest ^:parallel date-parse-table-fields-aggregation
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/date)
    (let [mp (mt/metadata-provider)]
      (doseq [[table fields] [[:people [{:field :birth_date}]]]
              {:keys [field]} fields]
        (testing (str "casting " table "." field " to date in aggregation")
          (let [field-md (lib.metadata/field mp (mt/id table field))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [field-md])
                          (lib/aggregate (lib/max field-md))
                          (lib/aggregate (lib/max (lib/date (lib/text field-md))))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Date (last cols)))
            (doseq [[uncasted-value casted-value] rows]
              (let [cd (-> casted-value java.time.Instant/parse)
                    ud (-> uncasted-value java.time.Instant/parse)]
                (is (= ud cd))))))))))

;; text()

(deftest ^:parallel text-cast-examples
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table fields] [[:people [{:value 10 :expected "10" :msg "integer"}
                                        {:value 10.4 :expected "10.4" :msg "float"}
                                        {:value "Hello!" :expected "Hello!" :msg "text"}
                                        {:value (lib/date "2025-04-02") :expected "2025-04-02" :msg "text"}]]]
              {:keys [value expected msg]} fields]
        (testing (str "casting " (pr-str value) "(" msg ") to text")
          (let [field-md (lib.metadata/field mp (mt/id table :id))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [field-md])
                          (lib/expression "TEXTCAST" (lib/text value))
                          (lib/limit 1))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Text (last cols)))
            (doseq [[_id casted-value] rows]
              (is (string? casted-value))
              (is (= expected casted-value) (str "Not equal for " msg)))))))))

(deftest ^:parallel text-cast-table-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table fields] [[:people [{:field :birth_date :db-type "DATE"}
                                        {:field :name :db-type "TEXT"}]]
                              [:orders [{:field :user_id :db-type "INTEGER"}
                                        {:field :subtotal :db-type "FLOAT"}
                                        {:field :created_at :db-type "TIMESTAMPTZ"}]]]
              {:keys [field db-type]} fields]
        (testing (str "casting " table "." field "(" db-type ") to text")
          (let [field-md (lib.metadata/field mp (mt/id table field))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [field-md])
                          (lib/expression "TEXTCAST" (lib/text field-md))
                          (lib/limit 100))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Text (last cols)))
            (doseq [[_field casted-value] rows]
              (is (string? casted-value)))))))))

(deftest ^:parallel text-cast-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                           (lib.metadata/field mp (mt/id :people :name))
                                                           (lib.metadata/field mp (mt/id :people :name)))
                                              :db-type "TEXT"}
                                             {:expression (lib/get-day-of-week
                                                           (lib.metadata/field mp (mt/id :people :birth_date)))
                                              :db-type "INTEGER"}]]]
              {:keys [expression db-type]} expressions]
        (testing (str "Casting " db-type " to text")
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                          (lib/expression "UNCASTED" expression)
                          (as-> q
                                (lib/expression q "TEXTCAST" (lib/text (lib/expression-ref q "UNCASTED"))))
                          (lib/limit 10))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Text (last cols)))
            (doseq [[_id _uncasted casted-value] rows]
              (is (string? casted-value)))))))))

(deftest ^:parallel text-cast-nested-native-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[_table expressions] [[:people [{:expression 1 :db-type "INTEGER"}
                                              {:expression "''" :db-type "TEXT"}
                                              {:expression "'abc'" :db-type "TEXT"}
                                              {:expression "DATE('2020-10-10')" :db-type "DATE"}
                                              {:expression 4.5 :db-type "DECIMAL"}]]]
              {:keys [expression db-type]} expressions]
        (testing (str "Casting " db-type " to text from native query")
          (let [native-query (mt/native-query {:query (str "SELECT " expression " AS UNCASTED")})]
            (mt/with-temp
              [:model/Card
               {card-id :id}
               (mt/card-with-source-metadata-for-query native-query)]
              (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                              (as-> q
                                    (lib/expression q "TEXTCAST" (lib/text (->> q lib/visible-columns (filter #(= "uncasted" (u/lower-case-en (:name %)))) first)))))
                    result (-> query qp/process-query)
                    cols (mt/cols result)
                    rows (mt/rows result)]
                (is (types/field-is-type? :type/Text (last cols)))
                (doseq [[_expression casted-value] rows]
                  (is (string? casted-value)))))))))))

(deftest ^:parallel text-cast-nested-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table fields] [[:people [{:field :birth_date :db-type "DATE"}
                                        {:field :name :db-type "TEXT"}]]
                              [:orders [{:field :user_id :db-type "INTEGER"}
                                        {:field :subtotal :db-type "FLOAT"}
                                        {:field :created_at :db-type "TIMESTAMPTZ"}]]]
              {:keys [field db-type]} fields]
        (let [nested-query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                               (lib/with-fields [(lib.metadata/field mp (mt/id table field))]))]
          (testing (str "Casting " db-type " to text")
            (mt/with-temp
              [:model/Card
               {card-id :id}
               (mt/card-with-source-metadata-for-query nested-query)]
              (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                              (as-> q
                                    (lib/expression q "TEXTCAST" (lib/text (lib.metadata/field mp (mt/id table field)))))
                              (lib/limit 10))
                    result (-> query qp/process-query)
                    cols (mt/cols result)
                    rows (mt/rows result)]
                (is (types/field-is-type? :type/Text (last cols)))
                (doseq [[_uncasted-value casted-value] rows]
                  (is (string? casted-value)))))))))))

(deftest ^:parallel text-cast-nested-query-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                           (lib.metadata/field mp (mt/id :people :name))
                                                           (lib.metadata/field mp (mt/id :people :name)))
                                              :db-type "TEXT"}
                                             {:expression (lib/get-day-of-week
                                                           (lib.metadata/field mp (mt/id :people :birth_date)))
                                              :db-type "INTEGER"}]]]
              {:keys [expression db-type]} expressions]
        (let [nested-query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                               (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                               (lib/expression "UNCASTED" expression)
                               (lib/limit 10))]
          (testing (str "Casting " db-type " to text")
            (mt/with-temp
              [:model/Card
               {card-id :id}
               (mt/card-with-source-metadata-for-query nested-query)]
              (let [query (-> (lib/query mp (lib.metadata/card mp card-id))
                              (as-> q
                                    (lib/expression q "TEXTCAST" (lib/text (->> q lib/visible-columns (filter #(= "UNCASTED" (:name %))) first))))
                              (lib/limit 10))
                    result (-> query qp/process-query)
                    cols (mt/cols result)
                    rows (mt/rows result)]
                (is (types/field-is-type? :type/Text (last cols)))
                (doseq [[_id _uncasted casted-value] rows]
                  (is (string? casted-value)))))))))))

(deftest ^:parallel text-cast-nested-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table expressions] [[:people [{:expression (fn []
                                                            (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :name))
                                                             (lib.metadata/field mp (mt/id :people :name))))
                                              :db-type "TEXT"}
                                             {:expression (fn []
                                                            (lib/get-day-of-week
                                                             (lib.metadata/field mp (mt/id :people :birth_date))))
                                              :db-type "INTEGER"}]]]
              {:keys [expression]} expressions]
        (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                        (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                        (lib/expression "UNCASTED" (expression))
                        (lib/expression "TEXTCAST" (lib/text (expression)))
                        (lib/limit 10))
              result (-> query qp/process-query)
              cols (mt/cols result)
              rows (mt/rows result)]
          (is (types/field-is-type? :type/Text (last cols)))
          (doseq [[_id _uncasted casted-value] rows]
            (is (string? casted-value))))))))

(deftest ^:parallel text-cast-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/text)
    (let [mp (mt/metadata-provider)]
      (doseq [[table fields] [[:people [{:field :birth_date :db-type "DATE"}
                                        {:field :name :db-type "TEXT"}]]
                              [:orders [{:field :user_id :db-type "INTEGER"}
                                        {:field :subtotal :db-type "FLOAT"}
                                        {:field :created_at :db-type "TIMESTAMPTZ"}]]]
              {:keys [field db-type]} fields]
        (testing (str "aggregating " table "." field "(" db-type ") and casting to text")
          (let [field-md (lib.metadata/field mp (mt/id table field))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/aggregate (lib/max field-md))
                          (lib/aggregate (lib/max (lib/text field-md))))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Text (last cols)))
            (doseq [[_uncasted-value casted-value] rows]
              (is (string? casted-value)))))))))
