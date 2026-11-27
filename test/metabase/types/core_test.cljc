(ns metabase.types.core-test
  (:require
   [clojure.set :as set]
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

(defn- hierarchy-keywords [h]
  (into (set (keys (:parents h)))
        (mapcat val)
        (:parents h)))

(defn- keywords-in-namespace [keyword-namespace]
  (->> (hierarchy-keywords #?(:clj (var-get #'clojure.core/global-hierarchy)
                              :cljs @(#'clojure.core/get-global-hierarchy)))
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

(deftest ^:parallel entity-hierarchy-test
  (testing "every entity type derives from :entity/* and lives outside the global hierarchy"
    (doseq [t (disj (hierarchy-keywords types/entity-hierarchy) :entity/*)]
      (testing t
        (is (= "entity" (namespace t)))
        (is (isa? types/entity-hierarchy t :entity/GenericTable))
        (is (not (isa? t :entity/*))))))
  (testing "the subjects"
    (is (set/subset? #{:entity/GenericTable
                       :entity/PersonTable :entity/UserTable :entity/ContactTable :entity/EmployeeTable :entity/CustomerTable
                       :entity/CompanyTable :entity/OrganizationTable :entity/TransactionTable :entity/LineItemTable
                       :entity/ProductTable :entity/SubscriptionTable :entity/EventTable :entity/MessageTable
                       :entity/SessionTable :entity/CampaignTable :entity/OpportunityTable :entity/TicketTable
                       :entity/ProjectTable :entity/LocationTable :entity/DeviceTable :entity/CalendarTable}
                     (hierarchy-keywords types/entity-hierarchy))))
  (testing "people subjects share a parent"
    (doseq [t [:entity/ContactTable :entity/EmployeeTable :entity/CustomerTable]]
      (is (isa? types/entity-hierarchy t :entity/PersonTable))))
  (testing "UserTable keeps GenericTable as its parent, so x-ray template specificity does not change"
    (is (= #{:entity/GenericTable} (parents types/entity-hierarchy :entity/UserTable)))))

(deftest ^:parallel table-role-hierarchy-test
  (let [roles (disj (hierarchy-keywords types/table-role-hierarchy) :role/*)]
    (testing "every role derives from :role/* and lives outside the global and entity hierarchies"
      (doseq [role roles]
        (testing role
          (is (= "role" (namespace role)))
          (is (isa? types/table-role-hierarchy role :role/*))
          (is (not (isa? role :role/*)))
          (is (not (isa? types/entity-hierarchy role :entity/*))))))
    (testing "the roles"
      (is (set/subset? #{:role/Fact :role/TransactionFact :role/EventFact :role/ActivityStream
                         :role/PeriodicSnapshotFact :role/UserDayFact :role/CohortSnapshot
                         :role/AccumulatingSnapshotFact :role/FactlessFact :role/AggregateFact :role/SessionFact
                         :role/Dimension :role/EntityDimension :role/DateDimension :role/TimeDimension
                         :role/LookupDimension :role/HistoryDimension :role/MiniDimension :role/JunkDimension
                         :role/OutriggerDimension :role/Bridge :role/HierarchyBridge :role/ArrayChild
                         :role/CustomPropertyTable :role/TranslationTable :role/ConfigurationTable
                         :role/SystemTable :role/OneBigTable :role/Hub :role/Link :role/Satellite
                         :role/PointInTime :role/Anchor :role/Attribute :role/Tie :role/Knot}
                       roles)))
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

(deftest ^:parallel table-period-granularities-test
  (is (= [:day :week :month :quarter :year] types/table-period-granularities)))

(deftest ^:parallel table-mutabilities-test
  (is (= [:append_only :mutable :versioned :rebuilt_each_load] types/table-mutabilities)))

(deftest ^:parallel table-load-strategies-test
  (is (= [:full :incremental :merge :insert_only :cdc :snapshot] types/table-load-strategies)))

(deftest ^:parallel field-facet-keys-test
  (is (= [:time :key :structure :lifecycle] types/field-facet-keys)))

(deftest ^:parallel field-facet-types-test
  (testing "every facet key lists its types"
    (is (= (set types/field-facet-keys) (set (keys types/field-facet-types)))))
  (testing "every listed type is a semantic type"
    (doseq [[facet-key ts] types/field-facet-types
            t              ts]
      (testing (pr-str facet-key t)
        (is (isa? t :Semantic/*)))))
  (testing "no type is listed under two facet keys"
    (let [ts (mapcat val types/field-facet-types)]
      (is (= (count ts) (count (set ts)))))))

(deftest ^:parallel field-facet-type->key-test
  (is (= :time (types/field-facet-type->key :type/ValidFrom)))
  (is (= :structure (types/field-facet-type->key :type/CustomProperty)))
  (is (nil? (types/field-facet-type->key :type/PK)))
  (testing "every listed type maps back to the kind that lists it"
    (doseq [[facet-key ts] types/field-facet-types
            t              ts]
      (is (= facet-key (types/field-facet-type->key t))))))

(deftest ^:parallel semantic-layer-types-test
  (testing "semantic-layer types derive from the type consumers check with isa?"
    (are [t parent] (isa? t parent)
      ;; keys and identity
      :type/SurrogateKey          :Semantic/*
      :type/HashKey               :type/SurrogateKey
      :type/NaturalKey            :Semantic/*
      :type/DurableKey            :type/NaturalKey
      :type/ExternalID            :type/NaturalKey
      :type/DegenerateDimension   :type/NaturalKey
      :type/TenantKey             :Semantic/*
      :type/ParentKey             :Semantic/*
      :type/PolymorphicKey        :Semantic/*
      :type/RoleKey               :Semantic/*
      :type/TypeDiscriminator     :type/Category
      :type/ArrayIndex            :Semantic/*
      :type/Version               :Semantic/*
      ;; time roles
      :type/EventTimestamp        :type/DateTime
      :type/MilestoneTimestamp    :type/DateTime
      :type/StartTimestamp        :type/MilestoneTimestamp
      :type/EndTimestamp          :type/MilestoneTimestamp
      :type/ValidFrom             :type/DateTime
      :type/ValidTo               :type/DateTime
      :type/PeriodKey             :Semantic/*
      :type/LoadTimestamp         :type/DateTime
      :type/LastActivityTimestamp :type/DateTime
      :type/TimeZone              :type/Category
      ;; measures
      :type/Balance               :type/Number
      :type/Rate                  :type/Share
      :type/UnitPrice             :type/Price
      :type/UnitPrice             :type/Currency
      :type/Count                 :type/Number
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
      :type/Tags                  :Semantic/*
      :type/Flag                  :Semantic/*
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
  (testing "key types are semantic types, not relations, so code that checks `:type/PK` or `:type/FK` ignores them"
    (doseq [t [:type/SurrogateKey :type/HashKey :type/TenantKey :type/ParentKey :type/PolymorphicKey :type/RoleKey
               :type/NaturalKey]]
      (testing t
        (is (isa? t :Semantic/*))
        (is (not (isa? t :Relation/*)))))))

(deftest ^:parallel semantic-layer-types-without-data-type-test
  (testing "types stored in more than one data type have no data type parent"
    (doseq [t [:type/Flag :type/Tags :type/PeriodKey]]
      (testing t
        (is (not (isa? t :type/*)))))))
