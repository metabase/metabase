(ns metabase.types)

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
(derive :type/Latitude :type/Float)
(derive :type/Longitude :type/Float)


;;; Text Types

(derive :type/Text :type/*)

(derive :type/UUID :type/Text)

(derive :type/URL :type/Text)
(derive :type/AvatarURL :type/URL)
(derive :type/ImageURL :type/URL)

(derive :type/City :type/Text)
(derive :type/State :type/Text)
(derive :type/Country :type/Text)

(derive :type/Name :type/Text)
(derive :type/Description :type/Text)

(derive :type/SerializedJSON :type/Text)
(derive :type/SerializedJSON :type/Collection)

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


;;; Legacy Special Types. These will hopefully be going away in the future when we add columns like `:is_pk` and `:cardinality`

(derive :type/Special :type/*)

(derive :type/FK :type/Special)
(derive :type/PK :type/Special)

(derive :type/Category :type/Special)
(derive :type/City :type/Category)
(derive :type/State :type/Category)
(derive :type/Country :type/Category)
(derive :type/Name :type/Category)

(defn- describe-types []
  (into {} (for [t (descendants :type/*)]
             {t (parents t)})))
