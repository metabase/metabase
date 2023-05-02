(ns metabase.lib.types.isa-test
  (:require
   [clojure.test :refer [deftest is are testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.types.constants :as lib.types.constants]
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

(deftest ^:parallel column-isa-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")
        orderable-columns (lib/orderable-columns query)
        columns-of-type (fn [typ] (filter #(lib.types.isa/isa? % typ)
                                         orderable-columns))]
      (testing "effective type"
        (is (=? [{:name "NAME"
                  :lib/desired-column-alias "NAME"
                  :semantic-type :type/Name
                  :effective-type :type/Text}
                 {:name "NAME"
                  :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__NAME"
                  :semantic-type :type/Name
                  :effective-type :type/Text}]
                (columns-of-type :type/Text))))
      (testing "semantic type"
        (is (=? [{:name "ID"
                  :lib/desired-column-alias "ID"
                  :semantic-type :type/PK
                  :effective-type :type/BigInteger}
                 {:name "CATEGORY_ID"
                  :lib/desired-column-alias "CATEGORY_ID"
                  :semantic-type :type/FK
                  :effective-type :type/Integer}
                 {:name "ID"
                  :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__ID"
                  :semantic-type :type/PK
                  :effective-type :type/BigInteger}]
                (columns-of-type :Relation/*))))))

(deftest ^:parallel field-type-test
  (testing "temporal"
    (are [typ] (= ::lib.types.constants/temporal (lib.types.isa/field-type {:effective-type typ}))
      :type/Date :type/DateTime :type/Time))
  (testing "numeric"
    (are [typ] (= ::lib.types.constants/number (lib.types.isa/field-type {:effective-type typ}))
      :type/BigInteger :type/Integer :type/Float :type/Decimal))
  (testing "string"
    (is (= ::lib.types.constants/string (lib.types.isa/field-type {:effective-type :type/Text}))))
  (testing "types of string"
    (are [typ] (= ::lib.types.constants/string (lib.types.isa/field-type {:effective-type :type/Text
                                                                          :semantic-type typ}))
      :type/Name :type/Description :type/UUID :type/URL))
  (testing "primary key"
    (is (= ::lib.types.constants/primary_key (lib.types.isa/field-type {:effective-type :type/Integer
                                                                        :semantic-type :type/PK}))))
  (testing "foreign key"
    (is (= ::lib.types.constants/foreign_key (lib.types.isa/field-type {:effective-type :type/Integer
                                                                        :semantic-type :type/FK}))))
  (testing "boolean"
    (is (= ::lib.types.constants/boolean (lib.types.isa/field-type {:effective-type :type/Boolean}))))
  (testing "location"
    (are [typ] (= ::lib.types.constants/location (lib.types.isa/field-type {:semantic-type typ}))
      :type/City :type/Country))
  (testing "coordinate"
    (are [typ] (= ::lib.types.constants/coordinate (lib.types.isa/field-type {:semantic-type typ}))
      :type/Latitude :type/Longitude))
  (testing "string like"
    (are [typ] (= ::lib.types.constants/string_like (lib.types.isa/field-type {:effective-type typ}))
      :type/TextLike :type/IPAddress))
  (testing "strings, regardless of the effective type is"
    (are [typ] (= ::lib.types.constants/string (lib.types.isa/field-type {:effective-type :type/Float
                                                                          :semantic-type typ}))
      :type/Name :type/Category))
  (testing "boolean, regardless of the semantic type"
    (is (= ::lib.types.constants/boolean (lib.types.isa/field-type {:effective-type :type/Boolean
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
              :positive :type/Integer, :negative :type/FK}
             {:nom "boolean?", :pred lib.types.isa/boolean?
              :positive :type/Boolean, :negative :type/PK}
             {:nom "string?", :pred lib.types.isa/string?
              :positive :type/URL, :negative :tpye/Address}
             {:nom "summable?", :pred lib.types.isa/summable?
              :positive :type/Number, :negative :type/Address}
             {:nom "scope?", :pred lib.types.isa/scope?
              :positive :type/Time, :negative :type/Address}
             {:nom "category?", :pred lib.types.isa/category?
              :positive :type/Company, :negative :type/URL}
             {:nom "location?", :pred lib.types.isa/location?
              :positive :type/Address, :negative :type/Number}
             {:nom "description?", :pred lib.types.isa/description?
              :positive :type/Description, :negative :type/City}
             {:nom "dimension?", :pred lib.types.isa/dimension?
              :positive :type/City, :negative :type/Description}
             {:nom "metric?", :pred lib.types.isa/metric?
              :positive :type/Number, :negative :type/City}
             {:nom "foreign-key?", :pred lib.types.isa/foreign-key?
              :positive :type/FK, :negative :type/ZipCode}
             {:nom "primary-key?", :pred lib.types.isa/primary-key?
              :positive :type/PK, :negative :type/ZipCode}
             {:nom "entity-name?", :pred lib.types.isa/entity-name?
              :positive :type/Name, :negative :type/Number}
             {:nom "any?", :pred lib.types.isa/any?
              :positive :type/*}
             {:nom "numeric-base-type?", :pred lib.types.isa/numeric-base-type?
              :positive :type/Integer, :negative :type/String}
             {:nom "date-without-time?", :pred lib.types.isa/date-without-time?
              :positive :type/Date, :negative :type/Time}
             {:nom "number?", :pred lib.types.isa/number?
              :positive :type/Number, :negative :type/Text}
             {:nom "time?", :pred lib.types.isa/time?
              :positive :type/Time, :negative :type/Number}
             {:nom "address?", :pred lib.types.isa/address?
              :positive :type/Address, :negative :type/String}
             {:nom "city?", :pred lib.types.isa/city?
              :positive :type/City, :negative :type/ZipCode}
             {:nom "state?", :pred lib.types.isa/state?
              :positive :type/State, :negative :type/Text}
             {:nom "zip-code?", :pred lib.types.isa/zip-code?
              :positive :type/ZipCode, :negative :type/City}
             {:nom "country?", :pred lib.types.isa/country?
              :positive :type/Country, :negative :type/City}
             {:nom "coordinate?", :pred lib.types.isa/coordinate?
              :positive :type/Coordinate, :negative :type/Double}
             {:nom "latitude?", :pred lib.types.isa/latitude?
              :positive :type/Latitude, :negative :type/Double}
             {:nom "longitude?", :pred lib.types.isa/longitude?
              :positive :type/Longitude, :negative :type/Double}
             {:nom "currency?", :pred lib.types.isa/currency?
              :positive :type/Currency, :negative :type/Double}
             {:nom "comment?", :pred lib.types.isa/comment?
              :positive :type/Comment, :negative :type/Text}
             {:nom "id?", :pred lib.types.isa/id?
              :positive :type/FK, :negative :type/Integer}
             {:nom "URL?", :pred lib.types.isa/URL?
              :positive :type/URL, :negative :type/Text}
             {:nom "email?", :pred lib.types.isa/email?
              :positive :type/Email, :negative :type/String}
             {:nom "avatar-URL?", :pred lib.types.isa/avatar-URL?
              :positive :type/AvatarURL, :negative :type/URL}
             {:nom "image-URL?", :pred lib.types.isa/image-URL?
              :positive :type/ImageURL, :negative :type/URL}]]
      (testing nom
        (when positive
          (testing positive
            (is (true?  (pred (column positive))))))
        (when negative
          (testing negative
            (is (false? (pred (column negative))))))))))

(deftest ^:parallel has-latitude-and-longitude?-test
  (is (true? (lib.types.isa/has-latitude-and-longitude?
              [{:semantic-type :type/Latitude} {:semantic-type :type/Longitude}])))
  (are [columns] (false? (lib.types.isa/has-latitude-and-longitude?
                          columns))
    [{:semantic-type :type/Latitude}]
    [{:semantic-type :type/Longitude}]
    [{:semantic-type :type/Longitude} {:semantic-type :type/Address}]
    []
    nil))

(deftest ^:parallel primary-key-pred-test
  (let [integer-table-id 1
        columns [{:semantic-type :type/PK, :table-id (inc integer-table-id), :name "column0"}
                 {:semantic-type :type/PK, :name "column1"}
                 {:semantic-type :type/PK, :table-id integer-table-id, :name "column2"}
                 {:semantic-type :type/Address, :name "column3"}]]
    (testing "with integer table-id :table-id has to match"
      (let [primary-key? (lib.types.isa/primary-key-pred integer-table-id)]
        (is (= ["column2"]
               (map :name (filter primary-key? columns))))))
    (testing "with string table-id all PK columns are returned"
      (let [primary-key? (lib.types.isa/primary-key-pred "card__1")]
        (is (= ["column0" "column1" "column2"]
               (map :name (filter primary-key? columns))))))))
