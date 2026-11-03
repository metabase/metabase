(ns metabase-enterprise.monitor-relay.rows
  "App-DB rows as the Monitor's receiver takes them: timestamps as UTC ISO 8601 strings with milliseconds and `Z`, flags
  as booleans, text as stored, and the columns Metabase encrypts decrypted."
  (:require
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log])
  (:import
   (java.time Instant LocalDateTime OffsetDateTime ZonedDateTime ZoneOffset)
   (java.time.format DateTimeFormatter)
   (java.time.temporal TemporalAccessor)))

(set! *warn-on-reflection* true)

(def ^:private ^DateTimeFormatter utc-millis
  ;; A `LocalDateTime` has no instant, so the override zone reads it as UTC.
  (.withZone (DateTimeFormatter/ofPattern "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") ZoneOffset/UTC))

(def ^:private flag-columns
  "The columns of each stream and state kind that hold a flag. MySQL returns some of them as 0 or 1."
  {:execution           #{:is_native_flag :has_error :is_superuser :is_active :card_is_public :is_sandboxed
                          :is_impersonated :is_db_routed :cache_hit}
   :view                #{:has_access}
   :card                #{:archived}
   :dashboard           #{:archived}
   :field               #{:active}
   :field_user_settings #{:semantic_type_set}
   :table               #{:active}
   :notification        #{:active}
   :pulse_card          #{:include_csv :include_xls}
   :snippet             #{:archived}
   :user                #{:is_superuser :is_active}})

(def ^:private encrypted-columns
  "The columns of each state kind that Metabase can store encrypted with `MB_ENCRYPTION_SECRET_KEY`."
  {:card                   #{:public_uuid}
   :dashboard              #{:public_uuid}
   :notification_recipient #{:details}
   :pulse_channel          #{:details}})

(defn- timestamp? [v]
  (or (instance? OffsetDateTime v) (instance? ZonedDateTime v) (instance? Instant v) (instance? LocalDateTime v)))

(defn- json-value [v]
  (cond
    (timestamp? v)                                       (.format utc-millis ^TemporalAccessor v)
    (or (nil? v) (string? v) (number? v) (boolean? v))   v
    :else                                                (str v)))

(defn- flag [v]
  (if (number? v) (not (zero? (long v))) v))

(defn encode
  "`rows` of stream or state `kind` as the receiver takes them. A value that does not decrypt is sent as stored."
  [kind rows]
  (let [flags     (flag-columns kind #{})
        encrypted (encrypted-columns kind #{})
        failures  (volatile! 0)
        decrypt   (fn [v]
                    (try
                      (encryption/maybe-decrypt-accepting-plaintext v)
                      (catch Exception _
                        (vswap! failures inc)
                        v)))
        column    (fn [[k v]]
                    [k (cond
                         (nil? v)               nil
                         (contains? flags k)     (flag v)
                         (contains? encrypted k) (json-value (decrypt v))
                         :else                   (json-value v))])
        encoded   (mapv #(into {} (map column) %) rows)]
    (when (pos? @failures)
      (log/warnf "The Metabase Monitor relay could not decrypt %d %s values, and sends them as stored"
                 @failures (name kind)))
    encoded))
