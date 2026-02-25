(ns metabase-enterprise.product-analytics.storage.iceberg.schema
  "Iceberg Schema and PartitionSpec definitions for Product Analytics tables."
  (:import
   (org.apache.iceberg PartitionSpec Schema)
   (org.apache.iceberg.types Types$BooleanType Types$DoubleType Types$IntegerType Types$LongType
                             Types$NestedField Types$StringType Types$TimestampType)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Helpers ------------------------------------------------------

(defn- required-field
  ^Types$NestedField [^long id ^String name ^org.apache.iceberg.types.Type type]
  (Types$NestedField/required (int id) name type))

(defn- optional-field
  ^Types$NestedField [^long id ^String name ^org.apache.iceberg.types.Type type]
  (Types$NestedField/optional (int id) name type))

;;; ------------------------------------------------- pa_sites -----------------------------------------------------

(def sites-schema
  "Iceberg schema for the `pa_sites` table."
  (Schema.
   [(required-field 1 "id"              (Types$IntegerType/get))
    (required-field 2 "uuid"            (Types$StringType/get))
    (required-field 3 "name"            (Types$StringType/get))
    (optional-field 4 "allowed_domains" (Types$StringType/get))
    (required-field 5 "archived"        (Types$BooleanType/get))
    (required-field 6 "created_at"      (Types$TimestampType/withZone))
    (required-field 7 "updated_at"      (Types$TimestampType/withZone))]))

(def sites-partition-spec
  "Partition spec for `pa_sites` — unpartitioned (low cardinality)."
  (-> (PartitionSpec/builderFor sites-schema)
      (.build)))

;;; ------------------------------------------------- pa_events ----------------------------------------------------

(def events-schema
  "Iceberg schema for the `pa_events` table."
  (Schema.
   [(required-field  1 "event_id"           (Types$LongType/get))
    (required-field  2 "site_id"            (Types$IntegerType/get))
    (required-field  3 "session_id"         (Types$LongType/get))
    (required-field  4 "event_type"         (Types$IntegerType/get))
    (optional-field  5 "event_name"         (Types$StringType/get))
    (required-field  6 "url_path"           (Types$StringType/get))
    (optional-field  7 "url_query"          (Types$StringType/get))
    (optional-field  8 "referrer_domain"    (Types$StringType/get))
    (optional-field  9 "referrer_path"      (Types$StringType/get))
    (optional-field 10 "referrer_query"     (Types$StringType/get))
    (optional-field 11 "page_title"         (Types$StringType/get))
    (optional-field 12 "utm_source"         (Types$StringType/get))
    (optional-field 13 "utm_medium"         (Types$StringType/get))
    (optional-field 14 "utm_campaign"       (Types$StringType/get))
    (optional-field 15 "utm_term"           (Types$StringType/get))
    (optional-field 16 "utm_content"        (Types$StringType/get))
    (optional-field 17 "click_id_gclid"     (Types$StringType/get))
    (optional-field 18 "click_id_dclid"     (Types$StringType/get))
    (optional-field 19 "click_id_fbclid"    (Types$StringType/get))
    (optional-field 20 "click_id_msclkid"   (Types$StringType/get))
    (optional-field 21 "click_id_twclid"    (Types$StringType/get))
    (optional-field 22 "click_id_ttclid"    (Types$StringType/get))
    (required-field 23 "created_at"         (Types$TimestampType/withZone))]))

(def events-partition-spec
  "Partition spec for `pa_events` — unpartitioned for now (writer doesn't support partitioned writes yet)."
  (-> (PartitionSpec/builderFor events-schema)
      (.build)))

;;; ------------------------------------------------ pa_sessions ---------------------------------------------------

(def sessions-schema
  "Iceberg schema for the `pa_sessions` table."
  (Schema.
   [(required-field  1 "session_id"    (Types$LongType/get))
    (required-field  2 "session_uuid"  (Types$StringType/get))
    (required-field  3 "site_id"       (Types$IntegerType/get))
    (optional-field  4 "distinct_id"   (Types$StringType/get))
    (optional-field  5 "browser"       (Types$StringType/get))
    (optional-field  6 "os"            (Types$StringType/get))
    (optional-field  7 "device"        (Types$StringType/get))
    (optional-field  8 "screen"        (Types$StringType/get))
    (optional-field  9 "language"      (Types$StringType/get))
    (optional-field 10 "country"       (Types$StringType/get))
    (optional-field 11 "subdivision1"  (Types$StringType/get))
    (optional-field 12 "city"          (Types$StringType/get))
    (required-field 13 "created_at"    (Types$TimestampType/withZone))
    (required-field 14 "updated_at"    (Types$TimestampType/withZone))]))

(def sessions-partition-spec
  "Partition spec for `pa_sessions` — unpartitioned for now (writer doesn't support partitioned writes yet)."
  (-> (PartitionSpec/builderFor sessions-schema)
      (.build)))

(def sessions-equality-field-ids
  "Field IDs used for equality deletes on pa_sessions (session_uuid = field 2)."
  [2])

(def sessions-delete-schema
  "Schema for equality delete files — just the session_uuid column."
  (Schema.
   [(required-field 2 "session_uuid" (Types$StringType/get))]))

;;; ---------------------------------------------- pa_session_data -------------------------------------------------

(def session-data-schema
  "Iceberg schema for the `pa_session_data` table."
  (Schema.
   [(required-field 1 "session_id"    (Types$LongType/get))
    (required-field 2 "data_key"      (Types$StringType/get))
    (optional-field 3 "string_value"  (Types$StringType/get))
    (optional-field 4 "number_value"  (Types$DoubleType/get))
    (optional-field 5 "date_value"    (Types$TimestampType/withZone))
    (required-field 6 "data_type"     (Types$IntegerType/get))
    (required-field 7 "created_at"    (Types$TimestampType/withZone))]))

(def session-data-partition-spec
  "Partition spec for `pa_session_data` — unpartitioned for now (writer doesn't support partitioned writes yet)."
  (-> (PartitionSpec/builderFor session-data-schema)
      (.build)))

;;; ------------------------------------------------ Table registry ------------------------------------------------

(def table-definitions
  "Map of table name keyword to {:schema ... :partition-spec ...} for all PA tables."
  {:pa_sites        {:schema sites-schema        :partition-spec sites-partition-spec}
   :pa_events       {:schema events-schema       :partition-spec events-partition-spec}
   :pa_sessions     {:schema sessions-schema     :partition-spec sessions-partition-spec}
   :pa_session_data {:schema session-data-schema :partition-spec session-data-partition-spec}})
