(ns metabase.lib.types.isa-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.types.constants :as lib.types.constants]
   [metabase.lib.types.isa :as lib.types.isa]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

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
  (let [query (-> lib.tu/venues-query
                  (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id))))
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
                (columns-of-type :Relation/*))))
      (testing "experssions"
        (is (=? [{:name "ID"
                  :lib/desired-column-alias "ID"
                  :semantic-type :type/PK
                  :effective-type :type/BigInteger}
                 {:name "CATEGORY_ID"
                  :lib/desired-column-alias "CATEGORY_ID"
                  :semantic-type :type/FK
                  :effective-type :type/Integer}
                 {:name "LATITUDE"
                  :lib/desired-column-alias "LATITUDE"
                  :semantic-type :type/Latitude
                  :effective-type :type/Float}
                 {:name "LONGITUDE"
                  :lib/desired-column-alias "LONGITUDE"
                  :semantic-type :type/Longitude
                  :effective-type :type/Float}
                 {:name "PRICE"
                  :lib/desired-column-alias "PRICE"
                  :semantic-type :type/Category
                  :effective-type :type/Integer}
                 {:name "myadd"
                  :lib/desired-column-alias "myadd"
                  :effective-type :type/Integer}
                 {:name "ID"
                  :lib/desired-column-alias "CATEGORIES__via__CATEGORY_ID__ID"
                  :semantic-type :type/PK
                  :effective-type :type/BigInteger}]
                (filter lib.types.isa/numeric? orderable-columns))))))

(deftest ^:parallel field-type-test
  ;; should fall back to `:base-type` if `:effective-type` isn't present.
  (doseq [base-or-effective-type-key [:effective-type :base-type]]
    (testing "temporal"
      (are [typ] (= ::lib.types.constants/temporal (lib.types.isa/field-type {base-or-effective-type-key typ}))
        :type/Date :type/DateTime :type/Time))
    (testing "numeric"
      (are [typ] (= ::lib.types.constants/number (lib.types.isa/field-type {base-or-effective-type-key typ}))
        :type/BigInteger :type/Integer :type/Float :type/Decimal))
    (testing "string"
      (are [typ] (= ::lib.types.constants/string (lib.types.isa/field-type {base-or-effective-type-key typ}))
        :type/Text :type/MySQLEnum))
    (testing "types of string"
      (are [typ] (= ::lib.types.constants/string (lib.types.isa/field-type {base-or-effective-type-key :type/Text
                                                                            :semantic-type typ}))
        :type/Name :type/Description :type/UUID :type/URL))
    (testing "primary key"
      (is (= ::lib.types.constants/primary_key (lib.types.isa/field-type {base-or-effective-type-key :type/Integer
                                                                          :semantic-type             :type/PK}))))
    (testing "foreign key"
      (is (= ::lib.types.constants/foreign_key (lib.types.isa/field-type {base-or-effective-type-key :type/Integer
                                                                          :semantic-type             :type/FK}))))
    (testing "boolean"
      (is (= ::lib.types.constants/boolean (lib.types.isa/field-type {base-or-effective-type-key :type/Boolean}))))
    (testing "location"
      (are [typ] (= ::lib.types.constants/location (lib.types.isa/field-type {:semantic-type typ}))
        :type/City :type/Country))
    (testing "coordinate"
      (are [typ] (= ::lib.types.constants/coordinate (lib.types.isa/field-type {:semantic-type typ}))
        :type/Latitude :type/Longitude))
    (testing "string like"
      (are [typ] (= ::lib.types.constants/string_like (lib.types.isa/field-type {base-or-effective-type-key typ}))
        :type/TextLike :type/IPAddress))
    (testing "strings, regardless of the effective type is"
      (are [typ] (= ::lib.types.constants/string (lib.types.isa/field-type {base-or-effective-type-key :type/Float
                                                                            :semantic-type typ}))
        :type/Name :type/Category))
    (testing "boolean, regardless of the semantic type"
      (is (= ::lib.types.constants/boolean (lib.types.isa/field-type {base-or-effective-type-key :type/Boolean
                                                                      :semantic-type             :type/Category})))))
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
    (doseq [{:keys [pred positive negative]}
            [{:pred #'lib.types.isa/temporal?,           :positive :type/DateTime,          :negative :type/City}
             {:pred #'lib.types.isa/numeric?,            :positive :type/Integer,           :negative :type/FK}
             {:pred #'lib.types.isa/boolean?,            :positive :type/Boolean,           :negative :type/PK}
             {:pred #'lib.types.isa/string?,             :positive :type/URL,               :negative :type/Address}
             {:pred #'lib.types.isa/summable?,           :positive :type/Number,            :negative :type/Address}
             {:pred #'lib.types.isa/scope?,              :positive :type/Time,              :negative :type/Address}
             {:pred #'lib.types.isa/category?,           :positive :type/Company,           :negative :type/URL}
             {:pred #'lib.types.isa/location?,           :positive :type/Address,           :negative :type/Number}
             {:pred #'lib.types.isa/description?,        :positive :type/Description,       :negative :type/City}
             {:pred #'lib.types.isa/dimension?,          :positive :type/City,              :negative :type/Description}
             {:pred #'lib.types.isa/metric?,             :positive :type/Number,            :negative :type/City}
             {:pred #'lib.types.isa/foreign-key?,        :positive :type/FK,                :negative :type/ZipCode}
             {:pred #'lib.types.isa/primary-key?,        :positive :type/PK,                :negative :type/ZipCode}
             {:pred #'lib.types.isa/entity-name?,        :positive :type/Name,              :negative :type/Number}
             {:pred #'lib.types.isa/title?,              :positive :type/Title,             :negative :type/Name}
             {:pred #'lib.types.isa/any?,                :positive :type/*}
             {:pred #'lib.types.isa/numeric-base-type?,  :positive :type/Integer,           :negative :type/String}
             {:pred #'lib.types.isa/date-without-time?,  :positive :type/Date,              :negative :type/Time}
             {:pred #'lib.types.isa/creation-timestamp?, :positive :type/CreationTimestamp, :negative :type/CreationDate}
             {:pred #'lib.types.isa/creation-date?,      :positive :type/CreationDate,      :negative :type/CreationTimestamp}
             {:pred #'lib.types.isa/creation-time?,      :positive :type/CreationTime,      :negative :type/CreationTimestamp}
             {:pred #'lib.types.isa/number?,             :positive :type/Number,            :negative :type/Text}
             {:pred #'lib.types.isa/time?,               :positive :type/Time,              :negative :type/Number}
             {:pred #'lib.types.isa/address?,            :positive :type/Address,           :negative :type/String}
             {:pred #'lib.types.isa/city?,               :positive :type/City,              :negative :type/ZipCode}
             {:pred #'lib.types.isa/state?,              :positive :type/State,             :negative :type/Text}
             {:pred #'lib.types.isa/zip-code?,           :positive :type/ZipCode,           :negative :type/City}
             {:pred #'lib.types.isa/country?,            :positive :type/Country,           :negative :type/City}
             {:pred #'lib.types.isa/coordinate?,         :positive :type/Coordinate         :negative :type/Double}
             {:pred #'lib.types.isa/latitude?,           :positive :type/Latitude,          :negative :type/Double}
             {:pred #'lib.types.isa/longitude?,          :positive :type/Longitude,         :negative :type/Double}
             {:pred #'lib.types.isa/currency?,           :positive :type/Currency,          :negative :type/Double}
             {:pred #'lib.types.isa/comment?,            :positive :type/Comment,           :negative :type/Text}
             {:pred #'lib.types.isa/id?,                 :positive :type/FK,                :negative :type/Integer}
             {:pred #'lib.types.isa/URL?,                :positive :type/URL,               :negative :type/Text}
             {:pred #'lib.types.isa/email?,              :positive :type/Email,             :negative :type/String}
             {:pred #'lib.types.isa/avatar-URL?,         :positive :type/AvatarURL,         :negative :type/URL}
             {:pred #'lib.types.isa/image-URL?,          :positive :type/ImageURL,          :negative :type/URL}]]
      (testing pred
        (when positive
          (testing positive
            (is (true?  (pred (column positive))))))
        (when negative
          (testing negative
            (is (false? (pred (column negative))))))))))

(deftest ^:parallel string?-test
  (are [exp column] (= exp (lib.types.isa/string? column))
       true  {:base-type :type/Text :semantic-type :type/SerializedJSON}
       false {:base-type :type/JSON :semantic-type :type/SerializedJSON}))

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

(deftest ^:parallel valid-filter-for?-test
  (are [exp base-lhs eff-lhs base-rhs eff-rhs] (= exp (lib.types.isa/valid-filter-for?
                                                        {:base-type      base-lhs
                                                         :effective-type eff-lhs}
                                                        {:base-type      base-rhs
                                                         :effective-type eff-rhs}))
    true  :type/String :type/Text    :type/String :type/Text
    true  :type/String :type/Text    :type/String :type/TextLike
    true  :type/String :type/Text    :type/String :type/Category

    true  :type/Float   :type/Number    :type/Float :type/Number
    true  :type/Float   :type/Price     :type/Float :type/Number
    true  :type/Integer :type/Quantity  :type/Float :type/Number
    true  :type/Float   :type/Number    :type/Float :type/Price

    true  :type/DateTime :type/Temporal :type/Time  :type/Temporal

    false :type/String   :type/Text      :type/Integer  :type/Number
    false :type/Integer  :type/Number    :type/String   :type/Text
    false :type/DateTime :type/Temporal  :type/String   :type/Text
    false :type/String   :type/Text      :type/DateTime :type/Temporal))
