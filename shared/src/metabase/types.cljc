(ns metabase.types
  "The Metabase Hierarchical Type System (MHTS). This is a hierarchy where types derive from one or more parent types,
   which in turn derive from their own parents. This makes it possible to add new types without needing to add
   corresponding mappings in the frontend or other places. For example, a Database may want a type called something
   like `:type/CaseInsensitiveText`; we can add this type as a derivative of `:type/Text` and everywhere else can
   continue to treat it as such until further notice."
  (:require [metabase.shared.util :as shared.u]))

;; NOTE: be sure to update frontend/test/metabase-bootstrap.js when updating this

(derive :type/Collection :type/*)

(derive :type/Dictionary :type/Collection)
(derive :type/Array :type/Collection)


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
(derive :type/Quantity :type/Integer)

(derive :type/Float :type/Number)
(derive :type/Decimal :type/Float)
(derive :type/Share :type/Float)

(derive :type/Currency :type/Float)
(derive :type/Income :type/Currency)
(derive :type/Discount :type/Currency)
(derive :type/Price :type/Currency)
(derive :type/GrossMargin :type/Currency)
(derive :type/Cost :type/Currency)

(derive :type/Coordinate :type/Float)
(derive :type/Latitude :type/Coordinate)
(derive :type/Longitude :type/Coordinate)

(derive :type/Score :type/Number)
(derive :type/Duration :type/Number)

;;; Text Types

(derive :type/Text :type/*)

(derive :type/UUID :type/Text)

(derive :type/URL :type/Text)
(derive :type/ImageURL :type/URL)
(derive :type/AvatarURL :type/ImageURL)

(derive :type/Email :type/Text)

(derive :type/City :type/Text)
(derive :type/State :type/Text)
(derive :type/Country :type/Text)
(derive :type/ZipCode :type/Text)

(derive :type/Name :type/Text)
(derive :type/Title :type/Text)
(derive :type/Description :type/Text)
(derive :type/Comment :type/Text)

(derive :type/SerializedJSON :type/Text)
(derive :type/SerializedJSON :type/Collection)

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

(derive :type/CreationTimestamp :type/DateTime)
(derive :type/CreationTime :type/Time)
(derive :type/CreationTime :type/CreationTimestamp)
(derive :type/CreationDate :type/Date)
(derive :type/CreationDate :type/CreationTimestamp)

(derive :type/JoinTimestamp :type/DateTime)
(derive :type/JoinTime :type/Date) ; TODO - shouldn't this be derived from `:type/Time` ?
(derive :type/JoinTime :type/JoinTimestamp)
(derive :type/JoinDate :type/Date)
(derive :type/JoinDate :type/JoinTimestamp)

(derive :type/CancelationTimestamp :type/DateTime)
(derive :type/CancelationTime :type/Date)
(derive :type/CancelationTime :type/CancelationTimestamp)
(derive :type/CancelationDate :type/Date)
(derive :type/CancelationDate :type/CancelationTimestamp)

(derive :type/DeletionTimestamp :type/DateTime)
(derive :type/DeletionTime :type/Date)
(derive :type/DeletionTime :type/DeletionTimestamp)
(derive :type/DeletionDate :type/Date)
(derive :type/DeletionDate :type/DeletionTimestamp)

(derive :type/UpdatedTimestamp :type/DateTime)
(derive :type/UpdatedTime :type/Date)
(derive :type/UpdatedTime :type/UpdatedTimestamp)
(derive :type/UpdatedDate :type/Date)
(derive :type/UpdatedDate :type/UpdatedTimestamp)

(derive :type/Birthdate :type/Date)


;;; Other

(derive :type/Boolean :type/*)
(derive :type/Enum :type/*)
(derive :type/DruidHyperUnique :type/*)

;;; Text-Like Types: Things that should be displayed as text for most purposes but that *shouldn't* support advanced
;;; filter options like starts with / contains

(derive :type/TextLike :type/*)
(derive :type/IPAddress :type/TextLike)
(derive :type/MongoBSONID :type/TextLike)

;;; "Virtual" Types

(derive :type/Address :type/*)
(derive :type/City :type/Address)
(derive :type/State :type/Address)
(derive :type/Country :type/Address)
(derive :type/ZipCode :type/Address)

;;; Structured

(derive :type/Structured :type/*)
(derive :type/SerializedJSON :type/Structured)
(derive :type/XML :type/Structured)


;;; Legacy Semantic Types. These will hopefully be going away in the future when we add columns like `:is_pk` and
;;; `:cardinality`

(derive :type/Special :type/*)

(derive :type/FK :type/Special)
(derive :type/PK :type/Special)

(derive :type/Category :type/Special)

(derive :type/Name :type/Category)
(derive :type/Title :type/Category)

(derive :type/City :type/Category)
(derive :type/State :type/Category)
(derive :type/Country :type/Category)

(derive :type/User :type/*)
(derive :type/Author :type/User)
(derive :type/Owner :type/User)

(derive :type/Product :type/Category)
(derive :type/Company :type/Category)
(derive :type/Subscription :type/Category)

(derive :type/Source :type/Category)

(derive :type/Boolean :type/Category)
(derive :type/Enum :type/Category)

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
