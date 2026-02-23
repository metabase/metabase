(ns metabase.lib-metric.types.isa-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.types.isa :as isa]))

;;; -------------------------------------------------- Test Fixtures --------------------------------------------------

(def ^:private temporal-dimension
  {:effective-type :type/DateTime
   :base-type      :type/DateTime})

(def ^:private date-dimension
  {:effective-type :type/Date
   :base-type      :type/Date})

(def ^:private time-dimension
  {:effective-type :type/Time
   :base-type      :type/Time})

(def ^:private numeric-dimension
  {:effective-type :type/Integer
   :base-type      :type/Integer})

(def ^:private float-dimension
  {:effective-type :type/Float
   :base-type      :type/Float})

(def ^:private boolean-dimension
  {:effective-type :type/Boolean
   :base-type      :type/Boolean})

(def ^:private string-dimension
  {:effective-type :type/Text
   :base-type      :type/Text})

(def ^:private string-like-dimension
  {:effective-type :type/IPAddress
   :base-type      :type/IPAddress})

(def ^:private coordinate-dimension
  {:effective-type :type/Float
   :base-type      :type/Float
   :semantic-type  :type/Coordinate})

(def ^:private latitude-dimension
  {:effective-type :type/Float
   :base-type      :type/Float
   :semantic-type  :type/Latitude})

(def ^:private longitude-dimension
  {:effective-type :type/Float
   :base-type      :type/Float
   :semantic-type  :type/Longitude})

(def ^:private location-dimension
  {:effective-type :type/Text
   :base-type      :type/Text
   :semantic-type  :type/Address})

(def ^:private city-dimension
  {:effective-type :type/Text
   :base-type      :type/Text
   :semantic-type  :type/City})

(def ^:private foreign-key-dimension
  {:effective-type :type/Integer
   :base-type      :type/Integer
   :semantic-type  :type/FK})

(def ^:private primary-key-dimension
  {:effective-type :type/Integer
   :base-type      :type/Integer
   :semantic-type  :type/PK})

(def ^:private base-type-only-dimension
  "Dimension with only :base-type, no :effective-type"
  {:base-type :type/Text})

;;; -------------------------------------------------- column-type tests --------------------------------------------------

(deftest ^:lib-metric-types column-type-test
  (testing "returns effective-type when present"
    (is (= :type/DateTime (isa/column-type temporal-dimension))))
  (testing "falls back to base-type when effective-type is nil"
    (is (= :type/Text (isa/column-type base-type-only-dimension))))
  (testing "returns nil for nil input"
    (is (nil? (isa/column-type nil)))))

;;; -------------------------------------------------- temporal? tests --------------------------------------------------

(deftest ^:lib-metric-types temporal?-test
  (testing "returns true for temporal types"
    (is (true? (isa/temporal? temporal-dimension)))
    (is (true? (isa/temporal? date-dimension)))
    (is (true? (isa/temporal? time-dimension))))
  (testing "returns false for non-temporal types"
    (is (false? (isa/temporal? numeric-dimension)))
    (is (false? (isa/temporal? string-dimension)))
    (is (false? (isa/temporal? boolean-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/temporal? nil)))))

;;; -------------------------------------------------- numeric? tests --------------------------------------------------

(deftest ^:lib-metric-types numeric?-test
  (testing "returns true for numeric types"
    (is (true? (isa/numeric? numeric-dimension)))
    (is (true? (isa/numeric? float-dimension))))
  (testing "returns false for non-numeric types"
    (is (false? (isa/numeric? string-dimension)))
    (is (false? (isa/numeric? temporal-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/numeric? nil)))))

;;; -------------------------------------------------- boolean? tests --------------------------------------------------

(deftest ^:lib-metric-types boolean?-test
  (testing "returns true for boolean types"
    (is (true? (isa/boolean? boolean-dimension))))
  (testing "returns false for non-boolean types"
    (is (false? (isa/boolean? string-dimension)))
    (is (false? (isa/boolean? numeric-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/boolean? nil)))))

;;; -------------------------------------------------- string? tests --------------------------------------------------

(deftest ^:lib-metric-types string?-test
  (testing "returns true for text types"
    (is (true? (isa/string? string-dimension))))
  (testing "returns false for non-string types"
    (is (false? (isa/string? numeric-dimension)))
    (is (false? (isa/string? boolean-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/string? nil)))))

;;; -------------------------------------------------- string-like? tests --------------------------------------------------

(deftest ^:lib-metric-types string-like?-test
  (testing "returns true for string-like types"
    (is (true? (isa/string-like? string-like-dimension))))
  (testing "returns false for plain strings"
    (is (false? (isa/string-like? string-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/string-like? nil)))))

;;; -------------------------------------------------- string-or-string-like? tests --------------------------------------------------

(deftest ^:lib-metric-types string-or-string-like?-test
  (testing "returns true for string types"
    (is (true? (isa/string-or-string-like? string-dimension))))
  (testing "returns true for string-like types"
    (is (true? (isa/string-or-string-like? string-like-dimension))))
  (testing "returns false for non-string types"
    (is (false? (isa/string-or-string-like? numeric-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/string-or-string-like? nil)))))

;;; -------------------------------------------------- coordinate? tests --------------------------------------------------

(deftest ^:lib-metric-types coordinate?-test
  (testing "returns true for coordinate semantic type"
    (is (true? (isa/coordinate? coordinate-dimension))))
  (testing "returns true for latitude (subtype of coordinate)"
    (is (true? (isa/coordinate? latitude-dimension))))
  (testing "returns true for longitude (subtype of coordinate)"
    (is (true? (isa/coordinate? longitude-dimension))))
  (testing "returns false for non-coordinate types"
    (is (false? (isa/coordinate? numeric-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/coordinate? nil)))))

;;; -------------------------------------------------- latitude? tests --------------------------------------------------

(deftest ^:lib-metric-types latitude?-test
  (testing "returns true for latitude semantic type"
    (is (true? (isa/latitude? latitude-dimension))))
  (testing "returns false for other coordinate types"
    (is (false? (isa/latitude? longitude-dimension)))
    (is (false? (isa/latitude? coordinate-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/latitude? nil)))))

;;; -------------------------------------------------- longitude? tests --------------------------------------------------

(deftest ^:lib-metric-types longitude?-test
  (testing "returns true for longitude semantic type"
    (is (true? (isa/longitude? longitude-dimension))))
  (testing "returns false for other coordinate types"
    (is (false? (isa/longitude? latitude-dimension)))
    (is (false? (isa/longitude? coordinate-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/longitude? nil)))))

;;; -------------------------------------------------- location? tests --------------------------------------------------

(deftest ^:lib-metric-types location?-test
  (testing "returns true for address semantic type"
    (is (true? (isa/location? location-dimension))))
  (testing "returns true for city (subtype of address)"
    (is (true? (isa/location? city-dimension))))
  (testing "returns false for non-location types"
    (is (false? (isa/location? string-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/location? nil)))))

;;; -------------------------------------------------- foreign-key? tests --------------------------------------------------

(deftest ^:lib-metric-types foreign-key?-test
  (testing "returns true for FK semantic type"
    (is (true? (isa/foreign-key? foreign-key-dimension))))
  (testing "returns false for non-FK types"
    (is (false? (isa/foreign-key? primary-key-dimension)))
    (is (false? (isa/foreign-key? numeric-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/foreign-key? nil)))))

;;; -------------------------------------------------- primary-key? tests --------------------------------------------------

(deftest ^:lib-metric-types primary-key?-test
  (testing "returns true for PK semantic type"
    (is (true? (isa/primary-key? primary-key-dimension))))
  (testing "returns false for non-PK types"
    (is (false? (isa/primary-key? foreign-key-dimension)))
    (is (false? (isa/primary-key? numeric-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/primary-key? nil)))))

;;; -------------------------------------------------- time? tests --------------------------------------------------

(deftest ^:lib-metric-types time?-test
  (testing "returns true for time types"
    (is (true? (isa/time? time-dimension))))
  (testing "returns false for date/datetime types"
    (is (false? (isa/time? date-dimension)))
    (is (false? (isa/time? temporal-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/time? nil)))))

;;; -------------------------------------------------- date-or-datetime? tests --------------------------------------------------

(deftest ^:lib-metric-types date-or-datetime?-test
  (testing "returns true for date types"
    (is (true? (isa/date-or-datetime? date-dimension))))
  (testing "returns true for datetime types"
    (is (true? (isa/date-or-datetime? temporal-dimension))))
  (testing "returns false for time-only types"
    (is (false? (isa/date-or-datetime? time-dimension))))
  (testing "handles nil gracefully"
    (is (false? (isa/date-or-datetime? nil)))))

;;; -------------------------------------------------- base-type fallback tests --------------------------------------------------

(deftest ^:lib-metric-types base-type-fallback-test
  (testing "predicates work with only base-type"
    (is (true? (isa/string? base-type-only-dimension)))
    (is (false? (isa/numeric? base-type-only-dimension)))))
