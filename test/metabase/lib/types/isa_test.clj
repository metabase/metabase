(ns metabase.lib.types.isa-test
  (:require
   [clojure.test :refer [deftest is are testing]]
   [metabase.lib.types.isa :as lib.types.isa]))

(deftest ^:parallel basic-isa-test
  (testing "nil doesn't belong to any type"
    (are [typ] (false? (lib.types.isa/isa? nil typ))
      :type/* :Relation/* :Semantic/* :type/Text :type/Address))
  (testing "effective type passes"
    (is (lib.types.isa/isa?
         {:effective-type :type/Text, :semantic-type :type/Address}
         :type/Text)))
  (testing "semantic type passes"
    (is (lib.types.isa/isa?
         {:effective-type :type/Number, :semantic-type :type/ZipCode}
         :type/Text)))
  (testing "both effective type and semantic type pass"
    (is (lib.types.isa/isa?
         {:effective-type :type/Text, :semantic-type :type/City}
         :type/Text)))
  (testing "none of effective type and semantic type passes"
    (is (not (lib.types.isa/isa?
              {:effective-type :type/Number, :semantic-type :type/IPAddress}
              :type/Text)))))

(deftest ^:parallel field-type-test
  (testing "temporal"
    (are [typ] (= ::lib.types.isa/temporal (lib.types.isa/field-type {:effective-type typ}))
      :type/Date :type/DateTime :type/Time))
  (testing "numeric"
    (are [typ] (= ::lib.types.isa/number (lib.types.isa/field-type {:effective-type typ}))
      :type/BigInteger :type/Integer :type/Float :type/Decimal))
  (testing "string"
    (is (= ::lib.types.isa/string (lib.types.isa/field-type {:effective-type :type/Text}))))
  (testing "types of string"
    (are [typ] (= ::lib.types.isa/string (lib.types.isa/field-type {:effective-type :type/Text
                                                                          :semantic-type typ}))
      :type/Name :type/Description :type/UUID :type/URL))
  (testing "primary key"
    (is (= ::lib.types.isa/primary_key (lib.types.isa/field-type {:effective-type :type/Integer
                                                                        :semantic-type :type/PK}))))
  (testing "foreign key"
    (is (= ::lib.types.isa/foreign_key (lib.types.isa/field-type {:effective-type :type/Integer
                                                                        :semantic-type :type/FK}))))
  (testing "boolean"
    (is (= ::lib.types.isa/boolean (lib.types.isa/field-type {:effective-type :type/Boolean}))))
  (testing "location"
    (are [typ] (= ::lib.types.isa/location (lib.types.isa/field-type {:semantic-type typ}))
      :type/City :type/Country))
  (testing "coordinate"
    (are [typ] (= ::lib.types.isa/coordinate (lib.types.isa/field-type {:semantic-type typ}))
      :type/Latitude :type/Longitude))
  (testing "string like"
    (are [typ] (= ::lib.types.isa/string_like (lib.types.isa/field-type {:effective-type typ}))
      :type/TextLike :type/IPAddress))
  (testing "strings, regardless of the effective type is"
    (are [typ] (= ::lib.types.isa/string (lib.types.isa/field-type {:effective-type :type/Float
                                                                          :semantic-type typ}))
      :type/Name :type/Category))
  (testing "boolean, regardless of the semantic type"
    (is (= ::lib.types.isa/boolean (lib.types.isa/field-type {:effective-type :type/Boolean
                                                              :semantic-type :type/Category}))))
  (testing "unexpected things"
    (are [column] (nil? (lib.types.isa/field-type column))
      {:effective-type "DERP DERP DERP"}
      {:semantic-type "DERP DERP DERP"}
      {:effective-type nil}
      {:semantic-type nil}
      "DERP DERP DERP"
      :type/Category
      nil)))

(deftest ^:parallel type-predicate-test
  (letfn [(column [x]
            (cond
              (map? x)             x
              (isa? x :Semantic/*) {:semantic-type x}
              (isa? x :Relation/*) {:semantic-type x}
              :else                {:effective-type x}))]
    (doseq [{:keys [nom pred positive negative]}
            [{:nom "date?", :pred lib.types.isa/date?
              :positive :type/DateTime, :negative :type/City}
             {:nom "numeric?", :pred lib.types.isa/numeric?
              :positive :type/Integer, :negative :type/FK}]]
      (testing nom
        (when positive
          (testing positive
            (is (true?  (pred (column positive))))))
        (when negative
          (testing negative
            (is (false? (pred (column negative))))))))))
