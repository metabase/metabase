(ns metabase.types
  "The Metabase Hierarchical Type System (MHTS). This is a hierarchy where types derive from one or more parent types,
  which in turn derive from their own parents. This makes it possible to add new types without needing to add
  corresponding mappings in the frontend or other places. For example, a Database may want a type called something
  like `:type/PostgresCaseInsensitiveText`; we can add this type as a derivative of `:type/Text` and everywhere else can
  continue to treat it as such until further notice.

  There are a few different keyword hierarchies below:

  ### Data (Base/Effective) Types -- types starting with `:type/`

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

  ### :Semantic Types -- types starting with `:Semantic/`

  These types represent the semantic meaning/interpretation/purpose of a column in the data warehouse, for example
  `:Semantic/UpdatedTimestamp`. This affects things like how we display this column or how we generate automagic
  dashboards. How is this different from Base/Effective type? Suppose we have an `updated_at` `TIMESTAMP` column; its
  data type is `TIMESTAMP` and thus its base type would be `:type/DateTime`. There is no such thing as an
  `UPDATED_AT_TIMESTAMP` data type; the fact that this column is used to record update timestamps is purely a semantic
  one.

  :Semantic types descend from Effective type(s) that are allowed to have this semantic type. For example,
  `:Semantic/UpdatedTimestamp` descends from `:type/DateTime`, which means a column with an effective type of
  `:type/DateTime` can have a semantic type of`:Semantic/UpdatedTimestamp`; however a `:type/Boolean` cannot -- this
  would make no sense. (Unless maybe `false` meant `1970-01-01T00:00:00Z` and `true` meant `1970-01-01T00:00:01Z`, but
  I think we can agree that's dumb.)

  ### Relation Type -- types starting with `:Relation/`

  Types that have to do with whether this column is a primary key or foreign key. These are currently stored in the
  `semantic_type` column, but we'll split them out into a separate `relation_type` column in the future.

  ### Entity Types -- keys starting with `:entity/`

  These are used to record the semantic purpose of a Table."
  (:require [metabase.shared.util :as shared.u]))

;;; Table (entity) Types

(derive :entity/GenericTable :entity/*)
(derive :entity/UserTable :entity/GenericTable)
(derive :entity/CompanyTable :entity/GenericTable)
(derive :entity/TransactionTable :entity/GenericTable)
(derive :entity/ProductTable :entity/GenericTable)
(derive :entity/SubscriptionTable :entity/GenericTable)
(derive :entity/EventTable :entity/GenericTable)
(derive :entity/GoogleAnalyticsTable :entity/GenericTable)


;;; Numeric Types

(derive :type/Number :type/*)

(derive :type/Integer :type/Number)
(derive :type/BigInteger :type/Integer)

(derive :Semantic/Quantity :Semantic/*)
(derive :Semantic/Quantity :type/Integer)

;; `:type/Float` means any number with a decimal place! It doesn't explicitly mean a 32-bit or 64-bit floating-point
;; number. That's why there's no `:type/Double`.
(derive :type/Float :type/Number)
;; `:type/Decimal` means a column that is actually stored as an arbitrary-precision decimal type, e.g. `BigDecimal` or
;; `DECIMAL`. For fixed-precision columns, just use `:type/Float`
(derive :type/Decimal :type/Float)

(derive :Semantic/Share :Semantic/*)
(derive :Semantic/Share :type/Float)

;; `:type/Currency` -- an actual currency data type, for example Postgres `money`.
;; `:Semantic/Currency` -- a column that should be interpreted as money.
;;
;; `money` (base type `:type/Currency`) columns will likely have a semantic type `:Semantic/Currency` or a descendant
;; thereof like `:Semantic/Income`, but other floating-point data type columns can be interpreted as currency as well;
;; a `DECIMAL` (base type `:type/Decimal`) column can also have a semantic type `:Semantic/Currency`.
(derive :type/Currency :type/Decimal)
(derive :Semantic/Currency :Semantic/*)
(derive :Semantic/Currency :type/Float)
(derive :Semantic/Income :Semantic/Currency)
(derive :Semantic/Discount :Semantic/Currency)
(derive :Semantic/Price :Semantic/Currency)
(derive :Semantic/GrossMargin :Semantic/Currency)
(derive :Semantic/Cost :Semantic/Currency)

;; :Semantic/Location -- anything having to do with a location, e.g. country, city, or coordinates.
(derive :Semantic/Location :Semantic/*)
(derive :Semantic/Coordinate :Semantic/Location)
(derive :Semantic/Coordinate :type/Float)
(derive :Semantic/Latitude :Semantic/Coordinate)
(derive :Semantic/Longitude :Semantic/Coordinate)

(derive :Semantic/Score :Semantic/*)
(derive :Semantic/Score :type/Number)

(derive :Semantic/Duration :Semantic/*)
(derive :Semantic/Duration :type/Number)

;;; Text Types

(derive :type/Text :type/*)

(derive :type/UUID :type/Text)

(derive :Semantic/URL :Semantic/*)
(derive :Semantic/URL :type/Text)
(derive :Semantic/ImageURL :Semantic/URL)
(derive :Semantic/AvatarURL :Semantic/ImageURL)

(derive :Semantic/Email :Semantic/*)
(derive :Semantic/Email :type/Text)

;; Semantic types deriving from `:Semantic/Category` should be marked as 'category' Fields during sync, i.e. they
;; should have their FieldValues cached and synced. See
;; `metabase.sync.analyze.classifiers.category/field-should-be-category?`
(derive :Semantic/Category :Semantic/*)
(derive :Semantic/Enum :Semantic/*)

(derive :Semantic/Address :Semantic/Location)

(derive :Semantic/City :Semantic/Address)
(derive :Semantic/City :Semantic/Category)
(derive :Semantic/City :type/Text)

(derive :Semantic/State :Semantic/Address)
(derive :Semantic/State :Semantic/Category)
(derive :Semantic/State :type/Text)

(derive :Semantic/Country :Semantic/Address)
(derive :Semantic/Country :Semantic/Category)
(derive :Semantic/Country :type/Text)

(derive :Semantic/ZipCode :Semantic/Address)
;;  ZIP code might be stored as text, or maybe as an integer.
(derive :Semantic/ZipCode :type/Text)
(derive :Semantic/ZipCode :type/Integer)

(derive :Semantic/Name :Semantic/Category)
(derive :Semantic/Name :type/Text)
(derive :Semantic/Title :Semantic/Category)
(derive :Semantic/Title :type/Text)

(derive :Semantic/Description :Semantic/*)
(derive :Semantic/Description :type/Text)
(derive :Semantic/Comment :Semantic/*)
(derive :Semantic/Comment :type/Text)

(derive :type/PostgresEnum :type/Text)

;;; DateTime Types

(derive :type/Temporal :type/*)

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

(derive :Semantic/CreationTemporal :Semantic/*)
(derive :Semantic/CreationTimestamp :Semantic/CreationTemporal)
(derive :Semantic/CreationTimestamp :type/DateTime)
(derive :Semantic/CreationTime :Semantic/CreationTemporal)
(derive :Semantic/CreationTime :type/Time)
(derive :Semantic/CreationDate :Semantic/CreationTemporal)
(derive :Semantic/CreationDate :type/Date)

(derive :Semantic/JoinTemporal :Semantic/*)
(derive :Semantic/JoinTimestamp :Semantic/JoinTemporal)
(derive :Semantic/JoinTimestamp :type/DateTime)
(derive :Semantic/JoinTime :Semantic/JoinTemporal)
(derive :Semantic/JoinTime :type/Time)
(derive :Semantic/JoinDate :Semantic/JoinTemporal)
(derive :Semantic/JoinDate :type/Date)

(derive :Semantic/CancelationTemporal :Semantic/*)
(derive :Semantic/CancelationTimestamp :Semantic/CancelationTemporal)
(derive :Semantic/CancelationTimestamp :type/DateTime)
(derive :Semantic/CancelationTime :Semantic/CancelationTemporal)
(derive :Semantic/CancelationTime :type/Date)
(derive :Semantic/CancelationDate :Semantic/CancelationTemporal)
(derive :Semantic/CancelationDate :type/Date)

(derive :Semantic/DeletionTemporal :Semantic/*)
(derive :Semantic/DeletionTimestamp :Semantic/DeletionTemporal)
(derive :Semantic/DeletionTimestamp :type/DateTime)
(derive :Semantic/DeletionTime :Semantic/DeletionTemporal)
(derive :Semantic/DeletionTime :type/Time)
(derive :Semantic/DeletionDate :Semantic/DeletionTemporal)
(derive :Semantic/DeletionDate :type/Date)

(derive :Semantic/UpdatedTemporal :Semantic/*)
(derive :Semantic/UpdatedTimestamp :Semantic/UpdatedTemporal)
(derive :Semantic/UpdatedTimestamp :type/DateTime)
(derive :Semantic/UpdatedTime :Semantic/UpdatedTemporal)
(derive :Semantic/UpdatedTime :type/Time)
(derive :Semantic/UpdatedDate :Semantic/UpdatedTemporal)
(derive :Semantic/UpdatedDate :type/Date)

(derive :Semantic/Birthdate :Semantic/*)
(derive :Semantic/Birthdate :type/Date)


;;; Other

(derive :type/Boolean :type/*)
(derive :type/DruidHyperUnique :type/*)

;;; Text-Like Types: Things that should be displayed as text for most purposes but that *shouldn't* support advanced
;;; filter options like starts with / contains

(derive :type/TextLike :type/*)
(derive :type/IPAddress :type/TextLike)
(derive :type/MongoBSONID :type/TextLike)

;; data type `:type/IPAddress` = something like a Postgres `inet` column.
;; semantic type `:Semantic/IPAddress` = a text or `inet` column that should be displayed as an IP address
(derive :Semantic/IPAddress :Semantic/*)
(derive :Semantic/IPAddress :type/Text)
(derive :Semantic/IPAddress :type/IPAddress)

;;; Structured/Collections

(derive :type/Collection :type/*)

(derive :type/Dictionary :type/Collection)
(derive :type/Array :type/Collection)

;; `:type/JSON` currently means a column that is JSON data, e.g. a Postgres JSON column
(derive :type/JSON :type/Collection)

;; `:type/XML` -- an actual native XML data column
(derive :type/XML :type/Collection)

;; `:Semantic/Structured` columns are ones that are stored as text, but should be treated as a `:type/Collection`
;; column (e.g. JSON or XML). These should probably be coercion strategies instead, e.g.
;;
;;    base type         = :type/Text
;;    coercion strategy = :Coercion/SerializedJSON
;;    effective type    = :type/JSON
;;
;; but for the time being we'll have to live with these being "weird" semantic types.
(derive :Semantic/Structured :Semantic/*)
(derive :Semantic/Structured :type/Text)

(derive :Semantic/SerializedJSON :Semantic/Structured)
(derive :Semantic/XML :Semantic/Structured)

;; Other

(derive :Semantic/User :Semantic/*)
(derive :Semantic/Author :Semantic/User)
(derive :Semantic/Owner :Semantic/User)

(derive :Semantic/Product :Semantic/Category)
(derive :Semantic/Company :Semantic/Category)
(derive :Semantic/Subscription :Semantic/Category)

(derive :Semantic/Source :Semantic/Category)

;;; Relation types

(derive :Relation/FK :Relation/*)
(derive :Relation/PK :Relation/*)

;;; Coercion strategies

(derive :Coercion/String->Temporal :Coercion/*)
(derive :Coercion/ISO8601->Temporal :Coercion/String->Temporal)
(derive :Coercion/ISO8601->DateTime :Coercion/ISO8601->Temporal)
(derive :Coercion/ISO8601->Time :Coercion/ISO8601->Temporal)
(derive :Coercion/ISO8601->Date :Coercion/ISO8601->Temporal)

(derive :Coercion/Number->Temporal :Coercion/*)
(derive :Coercion/UNIXTime->Temporal :Coercion/Number->Temporal)
(derive :Coercion/UNIXSeconds->DateTime :Coercion/UNIXTime->Temporal)
(derive :Coercion/UNIXMilliSeconds->DateTime :Coercion/UNIXTime->Temporal)
(derive :Coercion/UNIXMicroSeconds->DateTime :Coercion/UNIXTime->Temporal)

;;; ---------------------------------------------------- Util Fns ----------------------------------------------------

(defn- types->parents
  "Return a map of various types to their parent types.

  This is intended for export to the frontend as part of `MetabaseBootstrap` so it can build its own implementation of
  `isa?`."
  ([] (types->parents :type/*))
  ([root]
   (into {} (for [t (descendants root)]
              {t (parents t)}))))

(defn temporal-field?
  "True if a Metabase `Field` instance has a temporal base or semantic type, i.e. if this Field represents a value
  relating to a moment in time."
  {:arglists '([field])}
  [{base-type :base_type, effective-type :effective_type}]
  (some #(isa? % :type/Temporal) [base-type effective-type]))

(def ^:private coercions
  "A map from types to maps of conversions to resulting effective types:

  eg:
  {:type/Text   {:Coercion/ISO8601->Date     :type/Date
                 :Coercion/ISO8601->DateTime :type/DateTime
                 :Coercion/ISO8601->Time     :type/Time}}"
  ;; Decimal seems out of place but that's the type that oracle uses Number which we map to Decimal. Not sure if
  ;; that's an intentional mapping or not. But it does mean that lots of extra columns will be offered a conversion
  ;; (think Price being offerred to be interpreted as a date)
  (let [numeric-types [:type/BigInteger :type/Integer :type/Decimal]]
    (reduce #(assoc %1 %2 {:Coercion/UNIXMicroSeconds->DateTime :type/Instant
                           :Coercion/UNIXMilliSeconds->DateTime :type/Instant
                           :Coercion/UNIXSeconds->DateTime      :type/Instant})
            {:type/Text   {:Coercion/ISO8601->Date     :type/Date
                           :Coercion/ISO8601->DateTime :type/DateTime
                           :Coercion/ISO8601->Time     :type/Time}}
            numeric-types)))

(defn ^:export is_coerceable
  "Returns a boolean of whether a field base-type has any coercion strategies available."
  [base-type]
  (boolean (contains? coercions (keyword base-type))))

(defn ^:export effective_type_for_coercion
  "The effective type resulting from a coercion."
  [coercion]
  ;;todo: unify this with the coercions map above
  (get {:Coercion/ISO8601->Date              :type/Date
        :Coercion/ISO8601->DateTime          :type/DateTime
        :Coercion/ISO8601->Time              :type/Time
        :Coercion/UNIXMicroSeconds->DateTime :type/Instant
        :Coercion/UNIXMilliSeconds->DateTime :type/Instant
        :Coercion/UNIXSeconds->DateTime      :type/Instant}
       (keyword coercion)))

(defn ^:export coercions-for-type
  "Coercions available for a type. In cljs will return a js array of strings like [\"Coercion/ISO8601->Time\" ...]. In
  clojure will return a sequence of keywords."
   [base-type]
   (let [applicable (keys (get coercions (keyword base-type)))]
     #?(:cljs
        (clj->js (map (fn [kw] (str (namespace kw) "/" (name kw)))
                      applicable))
        :clj
        applicable)))

#?(:cljs
   (defn ^:export isa
     "Is `x` the same as, or a descendant type of, `y`?"
     [x y]
     (isa? (keyword x) (keyword y))))

#?(:cljs
   (def ^:export TYPE
     "A map of Type name (as string, without `:type/` namespace) -> qualified type name as string

         {\"Temporal\" \"type/Temporal\", ...}"
     (clj->js (into {} (for [tyype (descendants :type/*)]
                         [(name tyype) (shared.u/qualified-name tyype)])))))
