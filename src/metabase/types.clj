(ns metabase.types
  "The Metabase Hierarchical Type System (MHTS). This is a hierarchy where types derive from one or more parent types,
   which in turn derive from their own parents. This makes it possible to add new types without needing to add
   corresponding mappings in the frontend or other places. For example, a Database may want a type called something
   like `:type/CaseInsensitiveText`; we can add this type as a derivative of `:type/Text` and everywhere else can
   continue to treat it as such until further notice.")

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
;; different from `java.time.OffsetDateTime`
;;
;; TIMEZONE FIXME — not 100% sure this distinction is needed or makes sense.
(derive :type/Instant :type/DateTimeWithLocalTZ)

(derive :type/UNIXTimestamp :type/Instant)
(derive :type/UNIXTimestamp :type/Integer)
(derive :type/UNIXTimestampSeconds :type/UNIXTimestamp)
(derive :type/UNIXTimestampMilliseconds :type/UNIXTimestamp)

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


;;; Legacy Special Types. These will hopefully be going away in the future when we add columns like `:is_pk` and
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

;;; ---------------------------------------------------- Util Fns ----------------------------------------------------

(defn types->parents
  "Return a map of various types to their parent types.

  This is intended for export to the frontend as part of `MetabaseBootstrap` so it can build its own implementation of
  `isa?`."
  ([] (types->parents :type/*))
  ([root]
   (into {} (for [t (descendants root)]
              {t (parents t)}))))

(defn temporal-field?
  "True if a Metabase `Field` instance has a temporal base or special type, i.e. if this Field represents a value
  relating to a moment in time."
  {:arglists '([field])}
  [{base-type :base_type, special-type :special_type}]
  (some #(isa? % :type/Temporal) [base-type special-type]))
