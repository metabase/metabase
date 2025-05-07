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

(defn- ->integer [value]
  (cond
    (string? value)
    (Long/parseLong value)

    (float? value)
    (Math/round (double value))

    (int? value)
    value

    (instance? java.math.BigDecimal value)
    (Math/round (double value))

    :else
    (throw (ex-info (str "I don't know how to convert " (pr-str value) " to an integer.")
                    {:value value}))))

(deftest ^:parallel integer-cast-table-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip :db-type "TEXT"}]]
                                [:orders [{:field :total :db-type "FLOAT"}]]]
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
                (is (= (biginteger (->integer uncasted-value))
                       (biginteger casted-value))
                    (str "Casting " (pr-str uncasted-value)))))))))))

(deftest ^:parallel integer-cast-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]
                                     [:orders [{:expression (lib/- (lib.metadata/field mp (mt/id :orders :total))
                                                                   (lib.metadata/field mp (mt/id :orders :subtotal)))
                                                :db-type "FLOAT"}]]]
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
                (is (= (biginteger (->integer uncasted-value))
                       (biginteger casted-value))
                    (str "Casting " (pr-str uncasted-value)))))))))))

(deftest ^:parallel integer-cast-nested-native-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [{:keys [expression db-type]} [{:expression "'123'"  :db-type "TEXT"}
                                              {:expression "'-123'" :db-type "TEXT"}
                                              {:expression "1.4"    :db-type "FLOAT"}
                                              {:expression "-1.98"  :db-type "FLOAT"}
                                              {:expression "100.1"  :db-type "FLOAT"}]]
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
                    (is (= (biginteger (->integer uncasted-value))
                           (biginteger casted-value))
                        (str "Casting " (pr-str uncasted-value)))))))))))))

(deftest ^:parallel integer-cast-nested-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip :db-type "TEXT"}]]
                                [:orders [{:field :total :db-type "FLOAT"}]]]
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
                    (is (= (biginteger (->integer uncasted-value))
                           (biginteger casted-value))
                        (str "Casting " (pr-str uncasted-value)))))))))))))

(deftest ^:parallel integer-cast-nested-query-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]
                                     [:orders [{:expression (lib/- (lib.metadata/field mp (mt/id :orders :total))
                                                                   (lib.metadata/field mp (mt/id :orders :subtotal)))
                                                :db-type "FLOAT"}]]]
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
                    (is (= (biginteger (->integer uncasted-value))
                           (biginteger casted-value))
                        (str "Casting " (pr-str uncasted-value)))))))))))))

(deftest ^:parallel integer-cast-nested-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (fn []
                                                              (lib/concat
                                                               (lib.metadata/field mp (mt/id :people :id))
                                                               (lib.metadata/field mp (mt/id :people :zip))))
                                                :db-type "TEXT"}]]
                                     [:orders [{:expression (fn []
                                                              (lib/- (lib.metadata/field mp (mt/id :orders :total))
                                                                     (lib.metadata/field mp (mt/id :orders :subtotal))))
                                                :db-type "FLOAT"}]]]
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
              (is (= (biginteger (->integer uncasted-value))
                     (biginteger casted-value))
                  (str "Casting " (pr-str uncasted-value))))))))))

(deftest ^:parallel integer-cast-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip   :db-type "TEXT"}]]
                                [:orders [{:field :total :db-type "FLOAT"}]]]
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
                (is (= (biginteger (->integer uncasted-value))
                       (biginteger casted-value))
                    (str "Casting " (pr-str uncasted-value)))))))))))

;; Redshift seems to fail with the extreme (min/max) values. Postgres is fine.
(deftest ^:parallel integer-cast-examples
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/integer)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)
            examples [{:original "123" :value 123 :msg "Easy case."}
                      {:original "+123" :value 123 :msg "Initial + sign."}
                      {:original "00123" :value 123 :msg "Initial zeros."}
                      {:original "-123" :value -123 :msg "Negative sign."}
                      {:original (pr-str Integer/MAX_VALUE) :value Integer/MAX_VALUE :msg "Big number."}
                      {:original (pr-str Integer/MIN_VALUE) :value Integer/MIN_VALUE :msg "Small number."}
                      {:original 123.3 :value 123 :msg "Easy case."}
                      {:original -123.4 :value -123 :msg "Easy negative case."}
                      {:original 123.9 :value 124 :msg "Check for correct rounding."}]]
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
                    (str "Casting " (pr-str original) " " msg))))))))))

;; float()

;; compare with Double/parseDouble from Clojure
;; convert all values to double before comparing

(defn- float=
  ([a b] (float= a b 1e-9 1e-6)) ; default epsilon
  ([^double a ^double b ^double abs-eps ^double rel-eps]
   (let [diff (Math/abs (- a b))
         norm (Math/max (Math/abs a) (Math/abs b))]
     (or (<= diff abs-eps)
         (<= diff (* norm rel-eps))))))

(deftest ^:parallel float-cast-table-fields
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset string-nums-db
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:string_nums [{:field :float_col :db-type "TEXT"}
                                               {:field :int_col :db-type "TEXT"}
                                               {:field :mix_col :db-type "TEXT"}]]]
                {:keys [field db-type]} fields]
          (testing (str "casting " table "." field "(" db-type ") to float")
            (let [field-md (lib.metadata/field mp (mt/id table field))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/with-fields [field-md])
                            (lib/expression "FLOATCAST" (lib/float field-md))
                            (lib/limit 100))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Float (last cols)))
              (doseq [[uncasted-value casted-value] rows]
                (is (float= (double (Double/parseDouble uncasted-value))
                            (double casted-value))
                    (str "Text tested: " uncasted-value))))))))))

(deftest ^:parallel float-cast-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat "1" ".5")
                                                :db-type "TEXT"}
                                               {:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             "."
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}]]]
                {:keys [expression db-type]} expressions]
          (testing (str "Casting " db-type " to float")
            (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                            (lib/expression "UNCASTED" expression)
                            (as-> q
                                  (lib/expression q "FLOATCAST" (lib/float (lib/expression-ref q "UNCASTED"))))
                            (lib/limit 10))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Float (last cols)))
              (doseq [[_ uncasted-value casted-value] rows]
                (is (float= (double (Double/parseDouble uncasted-value))
                            (double casted-value))
                    (str "Text tested: " uncasted-value))))))))))

(deftest ^:parallel float-cast-nested-native-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [{:keys [expression db-type]} [{:expression "'123.7'"  :db-type "TEXT"}
                                              {:expression "'-123.1'" :db-type "TEXT"}]]
          (testing (str "Casting " db-type " to float from native query")
            (let [native-query (mt/native-query {:query (str "SELECT " expression " AS UNCASTED")})]
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query native-query)]
                (let [card-query (lib/query mp (lib.metadata/card mp card-id))
                      uncast-column (->> card-query
                                         lib/visible-columns
                                         (filter #(= "uncasted" (u/lower-case-en (:name %))))
                                         first)
                      query (-> card-query
                                (lib/expression "UNCAST"               uncast-column)
                                (lib/expression "FLOATCAST" (lib/float uncast-column)))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (types/field-is-type? :type/Number (last cols)))
                  (doseq [[_ uncasted-value casted-value] rows]
                    (is (float= (double (Double/parseDouble uncasted-value))
                                (double casted-value))
                        (str "Text tested: " uncasted-value))))))))))))

(deftest ^:parallel float-cast-nested-query
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset string-nums-db
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:string_nums [{:field :float_col :db-type "TEXT"}
                                               {:field :int_col :db-type "TEXT"}
                                               {:field :mix_col :db-type "TEXT"}]]]
                {:keys [field db-type]} fields]
          (let [nested-query (lib/query mp (lib.metadata/table mp (mt/id table)))]
            (testing (str "Casting " db-type " to float")
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query nested-query)]
                (let [field-md (lib.metadata/field mp (mt/id table field))
                      query (-> (lib/query mp (lib.metadata/card mp card-id))
                                (lib/with-fields [field-md])
                                (as-> q
                                      (lib/expression q "FLOATCAST" (lib/float field-md)))
                                (lib/limit 100))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (types/field-is-type? :type/Number (last cols)))
                  (doseq [[uncasted-value casted-value] rows]
                    (is (float= (double (Double/parseDouble uncasted-value))
                                (double casted-value))
                        (str "Text tested: " uncasted-value))))))))))))

(deftest ^:parallel float-cast-nested-query-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (lib/concat
                                                             (lib.metadata/field mp (mt/id :people :id))
                                                             "."
                                                             (lib.metadata/field mp (mt/id :people :zip)))
                                                :db-type "TEXT"}
                                               {:expression (lib/concat "1" ".5")
                                                :db-type "TEXT"}]]]
                {:keys [expression db-type]} expressions]
          (let [nested-query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                                 (lib/with-fields [])
                                 (lib/expression "UNCASTED" expression)
                                 (lib/limit 10))]
            (testing (str "Casting " db-type " to float")
              (mt/with-temp
                [:model/Card
                 {card-id :id}
                 (mt/card-with-source-metadata-for-query nested-query)]
                (let [card-query (lib/query mp (lib.metadata/card mp card-id))
                      uncast-column (->> card-query
                                         lib/visible-columns
                                         (filter #(= "uncasted" (u/lower-case-en (:name %))))
                                         first)
                      query (-> card-query
                                (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                                (lib/expression "UNCAST"               uncast-column)
                                (lib/expression "FLOATCAST" (lib/float uncast-column))
                                (lib/limit 10))
                      result (-> query qp/process-query)
                      cols (mt/cols result)
                      rows (mt/rows result)]
                  (is (types/field-is-type? :type/Number (last cols)))
                  (doseq [[_id uncasted-value casted-value] rows]
                    (is (float= (double (Double/parseDouble uncasted-value))
                                (double casted-value))
                        (str "Text tested: " uncasted-value))))))))))))

(deftest ^:parallel float-cast-nested-custom-expressions
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table expressions] [[:people [{:expression (fn []
                                                              (lib/concat
                                                               (lib.metadata/field mp (mt/id :people :id))
                                                               "."
                                                               (lib.metadata/field mp (mt/id :people :zip))))}
                                               {:expression (fn []
                                                              (lib/concat "1" ".5"))
                                                :db-type "TEXT"}]]]
                {ex :expression} expressions]
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                          (lib/with-fields [(lib.metadata/field mp (mt/id table :id))])
                          (lib/expression "UNCASTED" (ex))
                          (lib/expression "FLOATCAST" (lib/float (ex)))
                          (lib/limit 10))
                result (-> query qp/process-query)
                cols (mt/cols result)
                rows (mt/rows result)]
            (is (types/field-is-type? :type/Number (last cols)))
            (doseq [[_ uncasted-value casted-value] rows]
              (is (float= (double (Double/parseDouble uncasted-value))
                          (double casted-value))
                  (str "Text tested: " uncasted-value)))))))))

(deftest ^:parallel float-cast-aggregations
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (doseq [[table fields] [[:people [{:field :zip}]]]
                {:keys [field]} fields]
          (testing (str "aggregating " table "." field " and casting to float")
            (let [field-md (lib.metadata/field mp (mt/id table field))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
                            (lib/aggregate (lib/max field-md))
                            (lib/aggregate (lib/max (lib/float field-md))))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Number (last cols)))
              (doseq [[uncasted-value casted-value] rows]
                (is (float= (double (Double/parseDouble uncasted-value))
                            (double casted-value))
                    (str "Text tested: " uncasted-value))))))))))

(deftest ^:parallel float-cast-examples
  (mt/test-drivers (mt/normal-drivers-with-feature :expressions/float)
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)
            examples [{:original "123.0" :value 123.0 :msg "Easy case."}
                      {:original "+123.88" :value 123.88 :msg "Initial + sign."}
                      {:original "00123.34" :value 123.34 :msg "Initial zeros."}
                      {:original "-123.08" :value -123.08 :msg "Negative sign."}
                      {:original (pr-str Float/MAX_VALUE) :value Float/MAX_VALUE :msg "Big number."}
                      {:original (pr-str Float/MIN_VALUE) :value Float/MIN_VALUE :msg "Small number."}]]
        (doseq [{:keys [original value msg]} examples]
          (testing (str "float cast: " msg)
            (let [field-md (lib.metadata/field mp (mt/id :people :id))
                  query (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                            (lib/with-fields [field-md])
                            (lib/expression "FLOATCAST" (lib/float original))
                            (lib/limit 1))
                  result (-> query qp/process-query)
                  cols (mt/cols result)
                  rows (mt/rows result)]
              (is (types/field-is-type? :type/Number (last cols)))
              (doseq [[_id casted-value] rows]
                (is (float= (double value)
                            (double casted-value))
                    (str "Text tested: " original " " msg))))))))))

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
