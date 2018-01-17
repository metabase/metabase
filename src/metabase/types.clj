(ns metabase.types
  "The Metabase Hierarchical Type System (MHTS). This is a hierarchy where types derive from one or more parent types,
   which in turn derive from their own parents. This makes it possible to add new types without needing to add
   corresponding mappings in the frontend or other places. For example, a Database may want a type called something
   like `:type/CaseInsensitiveText`; we can add this type as a derivative of `:type/Text` and everywhere else can
   continue to treat it as such until further notice.")

(derive :type/Collection :type/*)

(derive :type/Dictionary :type/Collection)
(derive :type/Array :type/Collection)

;;; Numeric Types

(derive :type/Number :type/*)

(derive :type/Integer :type/Number)
(derive :type/BigInteger :type/Integer)
(derive :type/ZipCode :type/Integer)

(derive :type/Float :type/Number)
(derive :type/Decimal :type/Float)

(derive :type/Coordinate :type/Float)
(derive :type/Latitude :type/Coordinate)
(derive :type/Longitude :type/Coordinate)


;;; Text Types

(derive :type/Text :type/*)

(derive :type/UUID :type/Text)

(derive :type/URL :type/Text)
(derive :type/AvatarURL :type/URL)
(derive :type/ImageURL :type/URL)

(derive :type/Email :type/Text)

(derive :type/City :type/Text)
(derive :type/State :type/Text)
(derive :type/Country :type/Text)

(derive :type/Name :type/Text)
(derive :type/Description :type/Text)

(derive :type/SerializedJSON :type/Text)
(derive :type/SerializedJSON :type/Collection)

(derive :type/PostgresEnum :type/Text)

;;; DateTime Types

(derive :type/DateTime :type/*)

(derive :type/Time :type/DateTime)
(derive :type/Date :type/DateTime)

(derive :type/UNIXTimestamp :type/DateTime)
(derive :type/UNIXTimestamp :type/Integer)
(derive :type/UNIXTimestampSeconds :type/UNIXTimestamp)
(derive :type/UNIXTimestampMilliseconds :type/UNIXTimestamp)


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

(derive :type/City :type/Category)
(derive :type/State :type/Category)
(derive :type/Country :type/Category)
(derive :type/Name :type/Category)


;;; ---------------------------------------------------- Util Fns ----------------------------------------------------

(defn types->parents
  "Return a map of various types to their parent types. This is intended for export to the frontend as part of
  `MetabaseBootstrap` so it can build its own implementation of `isa?`."
  []
  (into {} (for [t (descendants :type/*)]
             {t (parents t)})))
