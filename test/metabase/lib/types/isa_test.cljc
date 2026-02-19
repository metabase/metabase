(ns metabase.lib.types.isa-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.types.isa :as lib.types.isa]))

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
  (let [query (-> (lib.tu/venues-query)
                  (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id))))
        orderable-columns (lib/orderable-columns query)
        columns-of-type (fn [typ] (filter #(lib.types.isa/isa? % typ)
                                          orderable-columns))]
    (testing "effective type"
      (is (=? [{:name "NAME"
                :semantic-type :type/Name
                :effective-type :type/Text}
               {:name "NAME"
                :semantic-type :type/Name
                :effective-type :type/Text}]
              (columns-of-type :type/Text))))
    (testing "semantic type"
      (is (=? [{:name "ID"
                :semantic-type :type/PK
                :effective-type :type/BigInteger}
               {:name "CATEGORY_ID"
                :semantic-type :type/FK
                :effective-type :type/Integer}
               {:name "ID"
                :fk-field-id (meta/id :venues :category-id)
                :semantic-type :type/PK
                :effective-type :type/BigInteger}]
              (columns-of-type :Relation/*))))
    (testing "expressions"
      (is (=? [{:name "ID"
                :semantic-type :type/PK
                :effective-type :type/BigInteger}
               {:name "CATEGORY_ID"
                :semantic-type :type/FK
                :effective-type :type/Integer}
               {:name "LATITUDE"
                :semantic-type :type/Latitude
                :effective-type :type/Float}
               {:name "LONGITUDE"
                :semantic-type :type/Longitude
                :effective-type :type/Float}
               {:name "PRICE"
                :semantic-type :type/Category
                :effective-type :type/Integer}
               {:name "myadd"
                :effective-type :type/Integer}
               {:name "ID"
                :fk-field-id (meta/id :venues :category-id)
                :semantic-type :type/PK
                :effective-type :type/BigInteger}]
              (filter lib.types.isa/numeric? orderable-columns))))))

(deftest ^:parallel type-predicate-test
  (letfn [(column [x]
            (cond
              (map? x)             x
              (isa? x :Semantic/*) {:semantic-type x}
              (isa? x :Relation/*) {:semantic-type x}
              :else                {:effective-type x}))]
    (doseq [{:keys [pred positive negative]}
            [{:pred #'lib.types.isa/temporal?,           :positive :type/Date,              :negative :type/CreationDate}
             {:pred #'lib.types.isa/temporal?,           :positive :type/DateTime,          :negative :type/City}
             {:pred #'lib.types.isa/numeric?,            :positive :type/Integer,           :negative :type/FK}
             {:pred #'lib.types.isa/numeric?,            :positive :type/Float,             :negative :type/Price}
             {:pred #'lib.types.isa/boolean?,            :positive :type/Boolean,           :negative :type/PK}
             {:pred #'lib.types.isa/string?,             :positive :type/Text,              :negative :type/URL}
             {:pred #'lib.types.isa/string-like?,        :positive :type/TextLike,          :negative :type/Address}
             {:pred #'lib.types.isa/summable?,           :positive :type/Number,            :negative :type/Address}
             {:pred #'lib.types.isa/scope?,              :positive :type/Boolean,           :negative :type/Address}
             {:pred #'lib.types.isa/category?,           :positive :type/Category,          :negative :type/Boolean}
             {:pred #'lib.types.isa/category?,           :positive :type/Company,           :negative :type/URL}
             {:pred #'lib.types.isa/location?,           :positive :type/Address,           :negative :type/Number}
             {:pred #'lib.types.isa/location?,           :positive :type/Latitude           :negative :type/Category}
             {:pred #'lib.types.isa/description?,        :positive :type/Description,       :negative :type/City}
             {:pred #'lib.types.isa/foreign-key?,        :positive :type/FK,                :negative :type/ZipCode}
             {:pred #'lib.types.isa/primary-key?,        :positive :type/PK,                :negative :type/ZipCode}
             {:pred #'lib.types.isa/entity-name?,        :positive :type/Name,              :negative :type/Number}
             {:pred #'lib.types.isa/title?,              :positive :type/Title,             :negative :type/Name}
             {:pred #'lib.types.isa/any?,                :positive :type/*}
             {:pred #'lib.types.isa/date-or-datetime?,   :positive :type/Date,              :negative :type/Time}
             {:pred #'lib.types.isa/date-or-datetime?,   :positive :type/DateTime,          :negative :type/Interval}
             {:pred #'lib.types.isa/date-without-time?,  :positive :type/Date,              :negative :type/Time}
             {:pred #'lib.types.isa/creation-timestamp?, :positive :type/CreationTimestamp, :negative :type/CreationDate}
             {:pred #'lib.types.isa/creation-date?,      :positive :type/CreationDate,      :negative :type/CreationTimestamp}
             {:pred #'lib.types.isa/creation-time?,      :positive :type/CreationTime,      :negative :type/CreationTimestamp}
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
            (is (true? (pred (column positive))))))
        (when negative
          (testing negative
            (is (false? (pred (column negative))))))))))

(deftest ^:parallel string?-test
  (is (true? (lib.types.isa/string? {:effective-type :type/Text :semantic-type :type/SerializedJSON})))
  (is (false? (lib.types.isa/string? {:effective-type :type/JSON :semantic-type :type/SerializedJSON}))))

(deftest ^:parallel numeric?-test
  (is (true? (lib.types.isa/numeric? {:effective-type :type/Float :semantic-type nil})))
  (is (true? (lib.types.isa/numeric? {:effective-type :type/Float :semantic-type :type/Price})))
  (is (false? (lib.types.isa/numeric? {:effective-type :type/Text :semantic-type :type/Price}))))

(deftest ^:parallel valid-filter-for?-test
  #_{:clj-kondo/ignore [:equals-true]}
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

(deftest ^:parallel effective-type-fallback-test
  (are [expected predicate column] (= expected (predicate column))
    true lib.types.isa/date-or-datetime? {:base-type :type/DateTime}
    true lib.types.isa/date-or-datetime? {:effective-type :type/DateTime :base-type :type/String}

    true lib.types.isa/date-or-datetime? {:base-type :type/Date}
    true lib.types.isa/date-or-datetime? {:effective-type :type/Date :base-type :type/String}

    false lib.types.isa/date-or-datetime? {:base-type :type/String}
    false lib.types.isa/date-or-datetime? {:effective-type :type/Location :base-type :type/String}

    true lib.types.isa/date-without-time? {:base-type :type/Date}
    true lib.types.isa/date-or-datetime? {:effective-type :type/Date :base-type :type/String}

    false lib.types.isa/date-without-time? {:base-type :type/String}
    false lib.types.isa/date-without-time? {:base-type :type/DateTime}
    false lib.types.isa/date-without-time? {:effective-type :type/String :base-type :type/String}
    false lib.types.isa/date-without-time? {:effective-type :type/DateTime :base-type :type/String}

    true lib.types.isa/time? {:base-type :type/Time}
    true lib.types.isa/time? {:effective-type :type/Time :base-type :type/String}

    false lib.types.isa/time? {:base-type :type/String}
    false lib.types.isa/time? {:effective-type :type/String :base-type :type/String}))
