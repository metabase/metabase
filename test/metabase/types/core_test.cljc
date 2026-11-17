(ns metabase.types.core-test
  (:require
   [clojure.test :refer [deftest is testing are]]
   [metabase.types.coercion-hierarchies :as coercion-hierarchies]
   [metabase.types.core :as types]))

(deftest ^:parallel assignable?-test
  (testing "assignability of numbers"
    (is (isa? :type/BigInteger :type/Integer))
    (is (types/assignable? :type/BigInteger :type/Integer))
    (is (types/assignable? :type/Integer :type/Decimal))
    (is (types/assignable? :type/BigInteger :type/Decimal)))
  (testing "assignability of texts"
    (is (isa? :type/Name :type/Text))
    (is (types/assignable? :type/Name :type/Text))))

(deftest ^:parallel mongo-bindata-fingerprint-unsupported-test
  (testing "binData holds large binary blobs, which must not be fingerprinted (sampling full values OOMs sync)"
    (is (isa? :type/MongoBinData :type/fingerprint-unsupported))))

(deftest ^:parallel most-specific-common-ancestor-test
  (are [x y expected] (= expected
                         (types/most-specific-common-ancestor x        y)
                         (types/most-specific-common-ancestor y        x)
                         (types/most-specific-common-ancestor x        expected)
                         (types/most-specific-common-ancestor y        expected)
                         (types/most-specific-common-ancestor expected x)
                         (types/most-specific-common-ancestor expected y))
    :type/Integer            :type/Integer                :type/Integer
    :type/Integer            :type/BigInteger             :type/Integer
    :type/Integer            :type/Float                  :type/Float
    :type/BigInteger         :type/Float                  :type/Float
    :type/Integer            :type/Decimal                :type/Decimal
    :type/BigInteger         :type/Decimal                :type/Decimal
    :type/Integer            :type/Text                   :type/*
    :type/DateTimeWithZoneID :type/DateTimeWithZoneOffset :type/DateTimeWithTZ
    :type/DateTimeWithZoneID :type/TimeWithZoneOffset     :type/HasTime
    nil                      :type/Integer                :type/*
    nil                      nil                          :type/*
    :type/*                  :type/*                      :type/*))

(derive ::Coerce-Int-To-Str :Coercion/*)
(coercion-hierarchies/define-types! ::Coerce-Int-To-Str :type/Integer :type/Text)

(deftest ^:parallel is-coercible?-test
  (is (true? (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/Text)))
  (testing "should be able to coerce from a subtype of base type"
    (is (types/is-coercible? ::Coerce-Int-To-Str :type/BigInteger :type/Text)))
  (testing "should NOT be able to coerce from a parent type of base type"
    (is (not (types/is-coercible? ::Coerce-Int-To-Str :type/Number :type/Text))))
  (testing "should be able to coerce to a parent type of effective type"
    (is (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/*)))
  (testing "should NOT be able to coerce to a subtype type of effective type"
    (is (not (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/UUID))))
  (testing "should be able to mix & match a bit."
    (is (types/is-coercible? ::Coerce-Int-To-Str :type/BigInteger :type/*))))

(derive ::Coerce-BigInteger-To-Instant :Coercion/*)
(coercion-hierarchies/define-types! ::Coerce-BigInteger-To-Instant :type/BigInteger :type/Instant)

(deftest ^:parallel coercion-possibilities-test
  (is (= {:type/Text    #{::Coerce-Int-To-Str}
          :type/Instant #{:Coercion/UNIXNanoSeconds->DateTime
                          :Coercion/UNIXMicroSeconds->DateTime
                          :Coercion/UNIXMilliSeconds->DateTime
                          :Coercion/UNIXSeconds->DateTime}}
         (types/coercion-possibilities :type/Integer)))
  (is (= {:type/Instant #{:Coercion/UNIXNanoSeconds->DateTime
                          :Coercion/UNIXMicroSeconds->DateTime
                          :Coercion/UNIXMilliSeconds->DateTime
                          :Coercion/UNIXSeconds->DateTime}}
         (types/coercion-possibilities :type/Decimal)))
  (testing "Should work for for subtypes of a the coercion base type(s)"
    (is (= {:type/Text    #{::Coerce-Int-To-Str}
            :type/Instant #{:Coercion/UNIXNanoSeconds->DateTime
                            :Coercion/UNIXMicroSeconds->DateTime
                            :Coercion/UNIXMilliSeconds->DateTime
                            :Coercion/UNIXSeconds->DateTime
                            ::Coerce-BigInteger-To-Instant}}
           (types/coercion-possibilities :type/BigInteger))))
  (testing "Should *not* work for ancestor types of the coercion base type(s)"
    (is (= nil
           (types/coercion-possibilities :type/Number))))
  (testing "Non-inheritable coercions"
    ;; type/* has a coercion :Coercion/YYYYMMDDHHMMSSBytes->Temporal
    (is (= {:type/* #{:Coercion/YYYYMMDDHHMMSSBytes->Temporal
                      :Coercion/ISO8601Bytes->Temporal}}
           (types/coercion-possibilities :type/*)))
    ;; a random type descendant of type/* should not have this coercion
    (is (= nil (types/coercion-possibilities :type/DruidHyperUnique)))))

(defn- keywords-in-namespace [keyword-namespace]
  (->> #?(:clj (var-get #'clojure.core/global-hierarchy)
          :cljs @(#'clojure.core/get-global-hierarchy))
       :parents
       keys
       (filter keyword?)
       (filter #(= (namespace %) (name keyword-namespace)))))

(defn- test-derived-from [a-type {:keys [required disallowed]}]
  (testing a-type
    (testing (str "should derive from one of" required)
      (is (some
           (partial isa? a-type)
           required)))
    (doseq [t disallowed]
      (testing (str "should NOT derive from " t)
        (is (not (isa? a-type t)))))))

(defn- test-keywords-in-namespace-derived-from [keyword-namespace options]
  (doseq [t (keywords-in-namespace keyword-namespace)]
    (test-derived-from t options)))

(deftest ^:parallel data-types-test
  (test-keywords-in-namespace-derived-from
   "type"
   {:required   [:type/* :Semantic/* :Relation/*]
    :disallowed [#_:Semantic/* :Coercion/* #_:Relation/* :entity/*]}))

(deftest ^:parallel semantic-types-test
  (test-keywords-in-namespace-derived-from
   "Semantic"
   {:required   [:Semantic/*]
    :disallowed [:Coercion/* :Relation/* :entity/*]}))

(deftest ^:parallel relation-types-test
  (test-keywords-in-namespace-derived-from
   "Relation"
   {:required   [:Relation/*]
    :disallowed [:type/* :Semantic/* :Coercion/* :entity/*]}))

(deftest ^:parallel coercion-strategies-test
  (test-keywords-in-namespace-derived-from
   "Coercion"
   {:required   [:Coercion/*]
    :disallowed [:type/* :Semantic/* :Relation/* :entity/*]}))

(deftest ^:parallel entity-types-test
  (test-keywords-in-namespace-derived-from
   "entity"
   {:required   [:entity/*]
    :disallowed [:type/* :Semantic/* :Relation/* :Coercion/*]}))

(defn- hierarchy-keywords [h]
  (into (set (keys (:parents h)))
        (mapcat val)
        (:parents h)))

(deftest ^:parallel entity-hierarchy-test
  (testing "every entity type derives from :entity/* and lives outside the global hierarchy"
    (doseq [t (disj (hierarchy-keywords types/entity-hierarchy) :entity/*)]
      (testing t
        (is (= "entity" (namespace t)))
        (is (isa? types/entity-hierarchy t :entity/GenericTable))
        (is (not (isa? t :entity/*))))))
  (testing "the subjects"
    (is (= #{:entity/GenericTable
             :entity/PersonTable :entity/UserTable :entity/ContactTable :entity/EmployeeTable :entity/CustomerTable
             :entity/CompanyTable :entity/OrganizationTable :entity/TransactionTable :entity/LineItemTable
             :entity/ProductTable :entity/SubscriptionTable :entity/EventTable :entity/MessageTable
             :entity/SessionTable :entity/CampaignTable :entity/OpportunityTable :entity/TicketTable
             :entity/ProjectTable :entity/LocationTable :entity/DeviceTable :entity/CalendarTable}
           (disj (hierarchy-keywords types/entity-hierarchy) :entity/*))))
  (testing "people subjects share a parent, and UserTable keeps GenericTable as an ancestor"
    (doseq [t [:entity/UserTable :entity/ContactTable :entity/EmployeeTable :entity/CustomerTable]]
      (is (isa? types/entity-hierarchy t :entity/PersonTable)))
    (is (isa? types/entity-hierarchy :entity/UserTable :entity/GenericTable))))

(deftest ^:parallel table-role-hierarchy-test
  (let [roles (disj (hierarchy-keywords types/table-role-hierarchy) :role/*)]
    (testing "every role derives from :role/* and lives outside the global and entity hierarchies"
      (is (= 36 (count roles)))
      (doseq [role roles]
        (testing role
          (is (= "role" (namespace role)))
          (is (isa? types/table-role-hierarchy role :role/*))
          (is (not (isa? role :role/*)))
          (is (not (isa? types/entity-hierarchy role :entity/*))))))
    (testing "role parents"
      (are [role parent] (isa? types/table-role-hierarchy role parent)
        :role/TransactionFact          :role/Fact
        :role/ActivityStream           :role/EventFact
        :role/SessionFact              :role/AggregateFact
        :role/UserDayFact              :role/PeriodicSnapshotFact
        :role/CohortSnapshot           :role/PeriodicSnapshotFact
        :role/HistoryDimension         :role/Dimension
        :role/LookupDimension          :role/Dimension
        :role/HierarchyBridge          :role/Bridge
        :role/ArrayChild               :role/Bridge))
    (testing "bridges and dimensions are not facts"
      (is (not (isa? types/table-role-hierarchy :role/ArrayChild :role/Fact)))
      (is (not (isa? types/table-role-hierarchy :role/HistoryDimension :role/Fact))))))

(deftest ^:parallel semantic-layer-types-test
  (testing "each new type derives from the existing type that consumers already check with isa?"
    (are [t parent] (isa? t parent)
      ;; keys and identity
      :type/SurrogateKey          :type/PK
      :type/HashKey               :type/SurrogateKey
      :type/NaturalKey            :Semantic/*
      :type/DurableKey            :type/NaturalKey
      :type/ExternalID            :type/NaturalKey
      :type/DegenerateDimension   :type/NaturalKey
      :type/TenantKey             :type/FK
      :type/ParentKey             :type/FK
      :type/PolymorphicKey        :type/FK
      :type/RoleKey               :type/FK
      :type/TypeDiscriminator     :type/Category
      :type/ArrayIndex            :Semantic/*
      :type/Version               :Semantic/*
      ;; time roles
      :type/EventTimestamp        :type/Temporal
      :type/MilestoneTimestamp    :type/Temporal
      :type/StartTimestamp        :type/MilestoneTimestamp
      :type/EndTimestamp          :type/MilestoneTimestamp
      :type/ValidFrom             :type/Temporal
      :type/ValidTo               :type/Temporal
      :type/PeriodKey             :type/Temporal
      :type/LoadTimestamp         :type/Temporal
      :type/LastActivityTimestamp :type/Temporal
      :type/TimeZone              :type/Category
      ;; measures
      :type/Balance               :type/Number
      :type/Rate                  :type/Share
      :type/UnitPrice             :type/Price
      :type/UnitPrice             :type/Currency
      :type/Count                 :type/Quantity
      :type/Weight                :type/Share
      :type/RangeBound            :type/Number
      :type/Bytes                 :type/Quantity
      :type/CurrencyCode          :type/Category
      :type/UnitOfMeasure         :type/Category
      ;; categories and enums
      :type/Status                :type/Category
      :type/Priority              :type/Category
      :type/Reason                :type/Category
      :type/Kind                  :type/Category
      :type/Channel               :type/Source
      :type/Locale                :type/Category
      :type/Color                 :type/Category
      :type/Tags                  :type/Text
      :type/Flag                  :type/Boolean
      :type/SoftDeleteFlag        :type/Flag
      :type/CurrentRowFlag        :type/Flag
      :type/TestDataFlag          :type/Flag
      :type/PrimaryFlag           :type/Flag
      ;; identity and contact text
      :type/Phone                 :type/Text
      :type/UserAgent             :type/Text
      :type/FilePath              :type/Text
      :type/Hash                  :type/Text
      ;; structure and lineage
      :type/SystemColumn          :Semantic/*
      :type/RowHash               :type/SystemColumn
      :type/CustomProperty        :Semantic/*
      :type/SourceSystem          :type/Category
      :type/HierarchyLevel        :Semantic/*
      :type/HierarchyPath         :type/Text
      :type/SortOrder             :Semantic/*)))

(deftest ^:parallel semantic-layer-key-types-test
  (testing "key types derived from PK and FK stay relations; natural keys are semantic"
    (is (isa? :type/SurrogateKey :Relation/*))
    (is (isa? :type/TenantKey :Relation/*))
    (is (not (isa? :type/NaturalKey :Relation/*)))))
