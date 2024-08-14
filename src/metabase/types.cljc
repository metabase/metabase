(ns metabase.types
  "The Metabase Hierarchical Type System (MHTS). This is a hierarchy where types derive from one or more parent types,
  which in turn derive from their own parents. This makes it possible to add new types without needing to add
  corresponding mappings in the frontend or other places. For example, a Database may want a type called something
  like `:type/CaseInsensitiveText`; we can add this type as a derivative of `:type/Text` and everywhere else can
  continue to treat it as such until further notice.

  There are a few different keyword hierarchies below:

  ### Data (Base/Effective) Types -- keys starting with `:type/` and deriving from `:type/*`, but not `:Semantic/*` or `:Relation/*`

  The 'base type' represents the actual data type of the column in the data warehouse. The 'effective type' is the
  data type we treat this column as; it may be the same as base type or something different if the column has a
  coercion strategy (see below). Example: a `VARCHAR` column might have a base type of `:type/Text`, but store
  ISO-8601 timestamps; we might choose to interpret this column as a timestamp column by giving it an effective type
  of `:type/DateTime` and the coercion strategy `:Coercion/ISO8601->DateTime`

  ### Coercion Strategies -- keys starting with `:Coercion/`

  These strategies tell us how to coerce a column from its base type to it effective type when the two differ. For
  example, `:Coercion/ISO8601->DateTime` can be used to tell us how to interpret a `VARCHAR` column (base type =
  `:type/Text`) as a `:type/DateTime` column (effective type). This depends of the database, but we might do something
  like using a `parse_timestamp()` function whenever we fetch this column.

  ### Semantic Types -- types starting with `:type/*` and deriving from `:Semantic/*`

  NOTE: In the near future we plan to rename the semantic types so they start with `:Semantic/` rather than `:type/`.

  These types represent the semantic meaning/interpretation/purpose of a column in the data warehouse, for example
  `:type/UpdatedTimestamp`. This affects things like how we display this column or how we generate Automagic
  Dashboards. How is this different from Base/Effective type? Suppose we have an `updated_at` `TIMESTAMP` column; its
  data type is `TIMESTAMP` and thus its base type would be `:type/DateTime`. There is no such thing as an
  `UPDATED_AT_TIMESTAMP` data type; the fact that this column is used to record update timestamps is purely a semantic
  one.

  :Semantic types descend from data type(s) that are allowed to have this semantic type. For example,
  `:type/UpdatedTimestamp` descends from `:type/DateTime`, which means a column with an effective type of
  `:type/DateTime` can have a semantic type of`:type/UpdatedTimestamp`; however a `:type/Boolean` cannot -- this
  would make no sense. (Unless maybe `false` meant `1970-01-01T00:00:00Z` and `true` meant `1970-01-01T00:00:01Z`, but
  I think we can agree that's dumb.)

  ### Relation Type -- types starting with `:type/*` and deriving from `:Relation/*`

  NOTE: As with Semantic types, in the near future we'll change the relation types so they all start with `:Relation/`.

  Types that have to do with whether this column is a primary key or foreign key. These are currently stored in the
  `semantic_type` column, but we'll split them out into a separate `relation_type` column in the future.

  ### Entity Types -- keys starting with `:entity/`

  These are used to record the semantic purpose of a Table."
  (:require
   [clojure.set :as set]
   [metabase.types.coercion-hierarchies :as coercion-hierarchies]
   [metabase.util.malli :as mu]
   #?@(:cljs
       [[metabase.util :as u]])))

;;; Table (entity) Types

(derive :entity/GenericTable :entity/*)
(derive :entity/UserTable :entity/GenericTable)
(derive :entity/CompanyTable :entity/GenericTable)
(derive :entity/TransactionTable :entity/GenericTable)
(derive :entity/ProductTable :entity/GenericTable)
(derive :entity/SubscriptionTable :entity/GenericTable)
(derive :entity/EventTable :entity/GenericTable)

;;; Modifier Types

;; `:type/field-values-unsupported` enables driver developers to opt out of field values calculation for specific
;; fields. For more details see the `driver-changelog.yml`, section `Metabase 0.50.0`.
(derive :type/field-values-unsupported :type/*)

;; `:type/fingerprint-unsupported` enables driver developers to opt out of fingerprinting for specific
;; fields.
(derive :type/fingerprint-unsupported :type/*)

;; `:type/Large` enables driver developers to signal that the field values can be relatively large and can use a lot of
;; memory. These types will be excluded from scanning and fingerprinting, and possibly other features in the future.
(derive :type/Large :type/field-values-unsupported)
(derive :type/Large :type/fingerprint-unsupported)

;;; Numeric Types

(derive :type/Number :type/*)

(derive :type/Integer :type/Number)
(derive :type/BigInteger :type/Integer)

(derive :type/Quantity :Semantic/*)
(derive :type/Quantity :type/Integer)

;; `:type/Float` means any number with a decimal place! It doesn't explicitly mean a 32-bit or 64-bit floating-point
;; number. That's why there's no `:type/Double`.
(derive :type/Float :type/Number)
;; `:type/Decimal` means a column that is actually stored as an arbitrary-precision decimal type, e.g. `BigDecimal` or
;; `DECIMAL`. For fixed-precision columns, just use `:type/Float`
(derive :type/Decimal :type/Float)

(derive :type/Share :Semantic/*)
(derive :type/Share :type/Float)

;; A percent value (generally 0-100)

(derive :type/Percentage :Semantic/*)
(derive :type/Percentage :type/Decimal)

;; `:type/Currency` -- an actual currency data type, for example Postgres `money`.
;; `:type/Currency` -- a column that should be interpreted as money.
;;
;; `money` (base type `:type/Currency`) columns will likely have a semantic type `:type/Currency` or a descendant
;; thereof like `:type/Income`, but other floating-point data type columns can be interpreted as currency as well;
;; a `DECIMAL` (base type `:type/Decimal`) column can also have a semantic type `:type/Currency`.
(derive :type/Currency :type/Decimal)
(derive :type/Currency :Semantic/*)
(derive :type/Income :type/Currency)
(derive :type/Discount :type/Currency)
(derive :type/Price :type/Currency)
(derive :type/GrossMargin :type/Currency)
(derive :type/Cost :type/Currency)

;; :type/Location -- anything having to do with a location, e.g. country, city, or coordinates.
(derive :type/Location :Semantic/*)
(derive :type/Coordinate :type/Location)
(derive :type/Coordinate :type/Float)
(derive :type/Latitude :type/Coordinate)
(derive :type/Longitude :type/Coordinate)

(derive :type/Score :Semantic/*)
(derive :type/Score :type/Number)

(derive :type/Duration :Semantic/*)
(derive :type/Duration :type/Number)

;;; Text Types

(derive :type/Text :type/*)

(derive :type/UUID :type/Text)

(derive :type/URL :Semantic/*)
(derive :type/URL :type/Text)
(derive :type/ImageURL :type/URL)
(derive :type/AvatarURL :type/ImageURL)

(derive :type/Email :Semantic/*)
(derive :type/Email :type/Text)

;; Semantic types deriving from `:type/Category` should be marked as 'category' Fields during sync, i.e. they
;; should have their FieldValues cached and synced. See
;; `metabase.analyze.classifiers.category/field-should-be-category?`
(derive :type/Category :Semantic/*)
(derive :type/Enum :Semantic/*)

(derive :type/Address :type/Location)

(derive :type/City :type/Address)
(derive :type/City :type/Category)
(derive :type/City :type/Text)

(derive :type/State :type/Address)
(derive :type/State :type/Category)
(derive :type/State :type/Text)

(derive :type/Country :type/Address)
(derive :type/Country :type/Category)
(derive :type/Country :type/Text)

(derive :type/ZipCode :type/Address)
(derive :type/ZipCode :type/Text)

(derive :type/Name :type/Category)
(derive :type/Name :type/Text)
(derive :type/Title :type/Category)
(derive :type/Title :type/Text)

(derive :type/Description :Semantic/*)
(derive :type/Description :type/Text)
(derive :type/Comment :Semantic/*)
(derive :type/Comment :type/Text)

(derive :type/PostgresEnum :type/Text)

(derive :type/OracleCLOB :type/Text)
(derive :type/OracleCLOB :type/Large)

;;; DateTime Types

(derive :type/Temporal :type/*)
(derive :type/Temporal :type/field-values-unsupported)

(derive :type/Date :type/Temporal)
;; You could have Dates with TZ info but it's not supported by JSR-310 so we'll not worry about that for now.

(derive :type/Time :type/Temporal)
(derive :type/TimeWithTZ :type/Time)
(derive :type/TimeWithLocalTZ :type/TimeWithTZ)    ; a column that is timezone-aware, but normalized to UTC or another offset at rest.
(derive :type/TimeWithZoneOffset :type/TimeWithTZ) ; a column that stores its timezone offset

(derive :type/DateTime :type/Temporal)
(derive :type/DateTimeWithTZ :type/DateTime)
(derive :type/DateTimeWithLocalTZ :type/DateTimeWithTZ)    ; a column that is timezone-aware, but normalized to UTC or another offset at rest.
(derive :type/DateTimeWithZoneOffset :type/DateTimeWithTZ) ; a column that stores its timezone offset, e.g. `-08:00`
(derive :type/DateTimeWithZoneID :type/DateTimeWithTZ)     ; a column that stores its timezone ID, e.g. `US/Pacific`

;; An `Instant` is a timestamp in (milli-)seconds since the epoch, UTC. Since it doesn't store TZ information, but is
;; normalized to UTC, it is a DateTimeWithLocalTZ
;;
;; `Instant` if differentiated from other `DateTimeWithLocalTZ` columns in the same way `java.time.Instant` is
;; different from `java.time.OffsetDateTime`;
(derive :type/Instant :type/DateTimeWithLocalTZ)


;; TODO -- shouldn't we have a `:type/LocalDateTime` as well?

(derive :type/CreationTemporal :Semantic/*)
(derive :type/CreationTimestamp :type/CreationTemporal)
(derive :type/CreationTimestamp :type/DateTime)
(derive :type/CreationTime :type/CreationTemporal)
(derive :type/CreationTime :type/Time)
(derive :type/CreationDate :type/CreationTemporal)
(derive :type/CreationDate :type/Date)

(derive :type/JoinTemporal :Semantic/*)
(derive :type/JoinTimestamp :type/JoinTemporal)
(derive :type/JoinTimestamp :type/DateTime)
(derive :type/JoinTime :type/JoinTemporal)
(derive :type/JoinTime :type/Time)
(derive :type/JoinDate :type/JoinTemporal)
(derive :type/JoinDate :type/Date)

(derive :type/CancelationTemporal :Semantic/*)
(derive :type/CancelationTimestamp :type/CancelationTemporal)
(derive :type/CancelationTimestamp :type/DateTime)
(derive :type/CancelationTime :type/CancelationTemporal)
(derive :type/CancelationTime :type/Date)
(derive :type/CancelationDate :type/CancelationTemporal)
(derive :type/CancelationDate :type/Date)

(derive :type/DeletionTemporal :Semantic/*)
(derive :type/DeletionTimestamp :type/DeletionTemporal)
(derive :type/DeletionTimestamp :type/DateTime)
(derive :type/DeletionTime :type/DeletionTemporal)
(derive :type/DeletionTime :type/Time)
(derive :type/DeletionDate :type/DeletionTemporal)
(derive :type/DeletionDate :type/Date)

(derive :type/UpdatedTemporal :Semantic/*)
(derive :type/UpdatedTimestamp :type/UpdatedTemporal)
(derive :type/UpdatedTimestamp :type/DateTime)
(derive :type/UpdatedTime :type/UpdatedTemporal)
(derive :type/UpdatedTime :type/Time)
(derive :type/UpdatedDate :type/UpdatedTemporal)
(derive :type/UpdatedDate :type/Date)

(derive :type/Birthdate :Semantic/*)
(derive :type/Birthdate :type/Date)

(derive :type/Interval :type/Temporal)

;;; Other

(derive :type/Boolean :type/*)
(derive :type/DruidHyperUnique :type/*)
(derive :type/DruidHyperUnique :type/field-values-unsupported)

;;; The Snowflake `VARIANT` type is allowed to be anything, so just mark it as deriving from the core root types so
;;; we're allowed to use any sort of filter with it (whether it makes sense or not). See
;;; https://docs.snowflake.com/en/sql-reference/data-types-semistructured
(doseq [t [:type/Number
           :type/Text
           :type/Temporal
           :type/Boolean
           :type/Collection]]
  (derive :type/SnowflakeVariant t))

;;; Text-Like Types: Things that should be displayed as text for most purposes but that *shouldn't* support advanced
;;; filter options like starts with / contains

(derive :type/TextLike :type/*)
(derive :type/MongoBSONID :type/TextLike)
(derive :type/MySQLEnum :type/Text)
;; IP address can be either a data type e.g. Postgres `inet` or a semantic type e.g. a `text` column that has IP
;; addresses
(derive :type/IPAddress :type/TextLike)
(derive :type/IPAddress :Semantic/*)

;;; Structured/Collections

(derive :type/Collection :type/*)
(derive :type/Collection :type/Large)
(derive :type/Structured :type/*)
(derive :type/Structured :type/Large)

(derive :type/Dictionary :type/Collection)
(derive :type/Array :type/Collection)

;; `:type/JSON` currently means a column that is JSON data, e.g. a Postgres JSON column
(derive :type/JSON :type/Structured)
(derive :type/JSON :type/Collection)

(derive :type/DruidJSON :type/JSON)

;; `:type/XML` -- an actual native XML data column
(derive :type/XML :type/Structured)
(derive :type/XML :type/Collection)

;; `:type/Structured` columns are ones that are stored as text, but should be treated as a `:type/Collection`
;; column (e.g. JSON or XML). These should probably be coercion strategies instead, e.g.
;;
;;    base type         = :type/Text
;;    coercion strategy = :Coercion/SerializedJSON
;;    effective type    = :type/JSON
;;
;; but for the time being we'll have to live with these being "weird" semantic types.
(derive :type/Structured :Semantic/*)

(derive :type/SerializedJSON :type/Structured)
(derive :type/XML :type/Structured)

;; Other

(derive :type/User :Semantic/*)
(derive :type/Author :type/User)
(derive :type/Owner :type/User)

(derive :type/Product :type/Category)
(derive :type/Company :type/Category)
(derive :type/Subscription :type/Category)

(derive :type/Source :type/Category)

;;; Relation types

(derive :type/FK :Relation/*)
(derive :type/PK :Relation/*)

;;; Coercion strategies

(derive :Coercion/String->Temporal :Coercion/*)
(derive :Coercion/ISO8601->Temporal :Coercion/String->Temporal)
(derive :Coercion/ISO8601->DateTime :Coercion/ISO8601->Temporal)
(derive :Coercion/ISO8601->Time :Coercion/ISO8601->Temporal)
(derive :Coercion/ISO8601->Date :Coercion/ISO8601->Temporal)

(derive :Coercion/YYYYMMDDHHMMSSString->Temporal :Coercion/String->Temporal)

(derive :Coercion/Bytes->Temporal :Coercion/*)
(derive :Coercion/YYYYMMDDHHMMSSBytes->Temporal :Coercion/Bytes->Temporal)

(derive :Coercion/Number->Temporal :Coercion/*)
(derive :Coercion/UNIXTime->Temporal :Coercion/Number->Temporal)
(derive :Coercion/UNIXSeconds->DateTime :Coercion/UNIXTime->Temporal)
(derive :Coercion/UNIXMilliSeconds->DateTime :Coercion/UNIXTime->Temporal)
(derive :Coercion/UNIXMicroSeconds->DateTime :Coercion/UNIXTime->Temporal)
(derive :Coercion/UNIXNanoSeconds->DateTime :Coercion/UNIXTime->Temporal)

;;; ---------------------------------------------------- Util Fns ----------------------------------------------------

(def ^:private SnakeCasedField
  "E.g. the version coming back from the app DB as opposed to MLv2 metadata. This should eventually be considered
  deprecated."
  [:map
   [:base_type :any]])

(mu/defn field-is-type?
  "True if a Metabase `Field` instance has a temporal base or semantic type, i.e. if this Field represents a value
  relating to a moment in time."
  [tyype                                                  :- :keyword
   {base-type :base_type, effective-type :effective_type} :- SnakeCasedField]
  (some #(isa? % tyype) [base-type effective-type]))

(mu/defn temporal-field?
  "True if a Metabase `Field` instance has a temporal base or semantic type, i.e. if this Field represents a value
  relating to a moment in time."
  [field :- SnakeCasedField]
  (field-is-type? :type/Temporal field))

(def ^:private assignable-hierarchy
  (make-hierarchy))

(defn declare-assignable
  "Declare that a value of type `x` assignable to a variable of type `y`."
  [x y]
  #?(:clj (alter-var-root #'assignable-hierarchy derive x y)
     :cljs (set! assignable-hierarchy (derive assignable-hierarchy x y))))

(declare-assignable :type/Integer :type/Decimal)

(declare assignable?)

(defn- assignable?* [x y]
  (or (isa? assignable-hierarchy x y)
      (boolean (some #(assignable? x %) (descendants y)))
      (boolean (some #(assignable? % y) (parents x)))))

(def assignable?
  "Is a value of type `x` assignable to a variable of type `y`?

  When deciding assignability, We also consider the type hierarchy.
  If x is assignable to z and z is a y, then x is also assignable to y.
  Also, if z is assignable to y and x is an z, then x is assignable to y."
  (memoize assignable?*))

(defn- most-specific-common-ancestor*
  "Impl for [[most-specific-common-ancestor]]."
  [x y]
  (cond
    (= x :type/*)     nil
    (= y :type/*)     nil
    (assignable? x y) y
    (assignable? y x) x
    ;; if we haven't had a match yet, recursively try using parent types.
    :else
    (some (fn [x']
            (some (fn [y']
                    (when-not (= [x' y'] [x y])
                      (most-specific-common-ancestor* x' y')))
                  (cons y (parents y))))
          (cons x (parents x)))))

(defn most-specific-common-ancestor
  "Return the most-specific type that is an ancestor of both `x` and `y`.

    (most-specific-common-ancestor :type/BigInteger :type/Decimal) => :type/Number"
  [x y]
  (or (most-specific-common-ancestor* x y)
      :type/*))

#?(:cljs
   (defn ^:export isa
     "Is `x` the same as, or a descendant type of, `y`?"
     [x y]
     (isa? (keyword x) (keyword y))))

#?(:cljs
   (def ^:export TYPE
     "A map of Type name (as string, without `:type/` namespace) -> qualified type name as string

         {\"Temporal\" \"type/Temporal\", ...}"
     (clj->js (into {} (for [tyype (distinct (mapcat descendants [:type/* :Semantic/* :Relation/*]))]
                         [(name tyype) (u/qualified-name tyype)])))))

(coercion-hierarchies/define-types! :Coercion/UNIXNanoSeconds->DateTime #{:type/Integer :type/Decimal} :type/Instant)
(coercion-hierarchies/define-types! :Coercion/UNIXMicroSeconds->DateTime #{:type/Integer :type/Decimal} :type/Instant)
(coercion-hierarchies/define-types! :Coercion/UNIXMilliSeconds->DateTime #{:type/Integer :type/Decimal} :type/Instant)
(coercion-hierarchies/define-types! :Coercion/UNIXSeconds->DateTime      #{:type/Integer :type/Decimal} :type/Instant)
(coercion-hierarchies/define-types! :Coercion/ISO8601->Date              :type/Text                     :type/Date)
(coercion-hierarchies/define-types! :Coercion/ISO8601->DateTime          :type/Text                     :type/DateTime)
(coercion-hierarchies/define-types! :Coercion/ISO8601->Time              :type/Text                     :type/Time)

(coercion-hierarchies/define-types! :Coercion/YYYYMMDDHHMMSSString->Temporal :type/Text                 :type/DateTime)

(coercion-hierarchies/define-non-inheritable-type! :Coercion/YYYYMMDDHHMMSSBytes->Temporal :type/* :type/DateTime)

(defn is-coercible-from?
  "Whether `coercion-strategy` is allowed for `base-type`."
  [coercion-strategy base-type]
  (or (isa? (coercion-hierarchies/base-type-hierarchy) base-type coercion-strategy)
      (boolean (some-> (coercion-hierarchies/non-descending-strategies)
                       (get base-type)
                       (contains? coercion-strategy)))))

(defn is-coercible-to?
  "Whether `coercion-strategy` coerces to `effective-type` or some subtype thereof."
  [coercion-strategy effective-type]
  (isa? (coercion-hierarchies/effective-type-hierarchy) coercion-strategy effective-type))

(defn is-coercible?
  "Whether `coercion-strategy` is allowed for `base-type` and coerces to `effective-type` or some subtype thereof."
  [coercion-strategy base-type effective-type]
  (and (is-coercible-from? coercion-strategy base-type)
       (is-coercible-to? coercion-strategy effective-type)))

(defn coercion-possibilities
  "Possible coercions for a base type, returned as a map of `effective-type -> #{coercion-strategy}`"
  [base-type]
  (let [base-type-hierarchy      (coercion-hierarchies/base-type-hierarchy)
        effective-type-hierarchy (coercion-hierarchies/effective-type-hierarchy)]
    (->> (for [strategy       (ancestors base-type-hierarchy base-type)
               :when          (isa? strategy :Coercion/*)
               :let           [effective-types (parents effective-type-hierarchy strategy)]
               effective-type effective-types
               :when          (not (isa? effective-type :Coercion/*))]
           {effective-type #{strategy}})
         (reduce (partial merge-with set/union)
                 (select-keys (coercion-hierarchies/non-descending-strategies) [base-type]))
         not-empty)))

(defn ^:export is_coerceable
  "Returns a boolean of whether a field base-type has any coercion strategies available."
  [base-type]
  (boolean (not-empty (coercion-possibilities (keyword base-type)))))

(defn effective-type-for-coercion
  "The effective type resulting from a coercion."
  [coercion]
  (coercion-hierarchies/effective-type-for-strategy coercion))

(defn ^:export coercions_for_type
  "Coercions available for a type. In cljs will return a js array of strings like [\"Coercion/ISO8601->Time\" ...]. In
  clojure will return a sequence of keywords."
   [base-type]
  (let [applicable (into () (comp (distinct) cat)
                         (vals (coercion-possibilities (keyword base-type))))]
     #?(:cljs
        (clj->js (map (fn [kw] (str (namespace kw) "/" (name kw)))
                      applicable))
        :clj
        applicable)))
