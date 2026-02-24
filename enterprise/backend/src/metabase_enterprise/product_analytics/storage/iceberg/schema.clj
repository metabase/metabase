(ns metabase-enterprise.product-analytics.storage.iceberg.schema
  "Iceberg Schema and PartitionSpec definitions for Product Analytics tables."
  (:import
   (org.apache.iceberg PartitionSpec Schema)
   (org.apache.iceberg.types Types$NestedField)
   (org.apache.iceberg.types.Types BooleanType DoubleType IntegerType LongType
                                   MapType StringType TimestampType)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers ------------------------------------------------------

(defn- required-field
  ^Types$NestedField [^long id ^String name type]
  (Types$NestedField/required (int id) name type))

(defn- optional-field
  ^Types$NestedField [^long id ^String name type]
  (Types$NestedField/optional (int id) name type))

;;; ------------------------------------------------- pa_sites -----------------------------------------------------

(def sites-schema
  "Iceberg schema for the `pa_sites` table."
  (Schema.
   [(required-field 1 "id"              (IntegerType/get))
    (required-field 2 "uuid"            (StringType/get))
    (required-field 3 "name"            (StringType/get))
    (optional-field 4 "allowed_domains" (StringType/get))
    (required-field 5 "archived"        (BooleanType/get))
    (required-field 6 "created_at"      (TimestampType/withZone))
    (required-field 7 "updated_at"      (TimestampType/withZone))]))

(def sites-partition-spec
  "Partition spec for `pa_sites` — unpartitioned (low cardinality)."
  (-> (PartitionSpec/builderFor sites-schema)
      (.build)))

;;; ------------------------------------------------- pa_events ----------------------------------------------------

(def events-schema
  "Iceberg schema for the `pa_events` table."
  (Schema.
   [(required-field  1 "event_id"           (LongType/get))
    (required-field  2 "site_id"            (IntegerType/get))
    (required-field  3 "session_id"         (IntegerType/get))
    (required-field  4 "event_type"         (StringType/get))
    (optional-field  5 "event_name"         (StringType/get))
    (required-field  6 "url_path"           (StringType/get))
    (optional-field  7 "url_query"          (StringType/get))
    (optional-field  8 "referrer_domain"    (StringType/get))
    (optional-field  9 "referrer_path"      (StringType/get))
    (optional-field 10 "referrer_query"     (StringType/get))
    (optional-field 11 "page_title"         (StringType/get))
    (optional-field 12 "utm_source"         (StringType/get))
    (optional-field 13 "utm_medium"         (StringType/get))
    (optional-field 14 "utm_campaign"       (StringType/get))
    (optional-field 15 "utm_term"           (StringType/get))
    (optional-field 16 "utm_content"        (StringType/get))
    (optional-field 17 "click_id_gclid"     (StringType/get))
    (optional-field 18 "click_id_dclid"     (StringType/get))
    (optional-field 19 "click_id_fbclid"    (StringType/get))
    (optional-field 20 "click_id_msclkid"   (StringType/get))
    (optional-field 21 "click_id_twclid"    (StringType/get))
    (optional-field 22 "click_id_ttclid"    (StringType/get))
    (optional-field 23 "event_data"         (MapType/ofOptional
                                             (int 24) (int 25)
                                             (StringType/get)
                                             (StringType/get)))
    (required-field 26 "created_at"         (TimestampType/withZone))]))

(def events-partition-spec
  "Partition spec for `pa_events` — partitioned by day(created_at) and site_id."
  (-> (PartitionSpec/builderFor events-schema)
      (.day "created_at")
      (.identity "site_id")
      (.build)))

;;; ------------------------------------------------ pa_sessions ---------------------------------------------------

(def sessions-schema
  "Iceberg schema for the `pa_sessions` table."
  (Schema.
   [(required-field  1 "session_id"    (LongType/get))
    (required-field  2 "session_uuid"  (StringType/get))
    (required-field  3 "site_id"       (IntegerType/get))
    (optional-field  4 "distinct_id"   (StringType/get))
    (optional-field  5 "browser"       (StringType/get))
    (optional-field  6 "os"            (StringType/get))
    (optional-field  7 "device"        (StringType/get))
    (optional-field  8 "screen"        (StringType/get))
    (optional-field  9 "language"      (StringType/get))
    (optional-field 10 "country"       (StringType/get))
    (optional-field 11 "subdivision1"  (StringType/get))
    (optional-field 12 "city"          (StringType/get))
    (required-field 13 "created_at"    (TimestampType/withZone))
    (required-field 14 "updated_at"    (TimestampType/withZone))]))

(def sessions-partition-spec
  "Partition spec for `pa_sessions` — partitioned by day(created_at)."
  (-> (PartitionSpec/builderFor sessions-schema)
      (.day "created_at")
      (.build)))

;;; ---------------------------------------------- pa_session_data -------------------------------------------------

(def session-data-schema
  "Iceberg schema for the `pa_session_data` table."
  (Schema.
   [(required-field 1 "session_id"    (LongType/get))
    (required-field 2 "data_key"      (StringType/get))
    (optional-field 3 "string_value"  (StringType/get))
    (optional-field 4 "number_value"  (DoubleType/get))
    (optional-field 5 "date_value"    (TimestampType/withZone))
    (required-field 6 "data_type"     (StringType/get))
    (required-field 7 "created_at"    (TimestampType/withZone))]))

(def session-data-partition-spec
  "Partition spec for `pa_session_data` — partitioned by day(created_at)."
  (-> (PartitionSpec/builderFor session-data-schema)
      (.day "created_at")
      (.build)))

;;; ------------------------------------------------ Table registry ------------------------------------------------

(def table-definitions
  "Map of table name keyword to {:schema ... :partition-spec ...} for all PA tables."
  {:pa-sites        {:schema sites-schema        :partition-spec sites-partition-spec}
   :pa-events       {:schema events-schema       :partition-spec events-partition-spec}
   :pa-sessions     {:schema sessions-schema     :partition-spec sessions-partition-spec}
   :pa-session-data {:schema session-data-schema :partition-spec session-data-partition-spec}})
