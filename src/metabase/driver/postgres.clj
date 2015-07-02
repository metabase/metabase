(ns metabase.driver.postgres
  (:require [clojure.tools.logging :as log]
            (clojure [set :refer [rename-keys]]
                     [string :as s])
            [korma.db :as kdb]
            [swiss.arrows :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [generic-sql :as generic-sql]
                             [interface :as i])))

(declare driver)

;; ## SYNCING

(def ^:const column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:bigint        :BigIntegerField
   :bigserial     :BigIntegerField
   :bit           :UnknownField
   :bool          :BooleanField
   :boolean       :BooleanField
   :box           :UnknownField
   :bpchar        :CharField        ; "blank-padded char" is the internal name of "character"
   :bytea         :UnknownField     ; byte array
   :cidr          :TextField        ; IPv4/IPv6 network address
   :circle        :UnknownField
   :date          :DateField
   :decimal       :DecimalField
   :float4        :FloatField
   :float8        :FloatField
   :geometry      :UnknownField
   :inet          :TextField        ; This was `GenericIPAddressField` in some places in the Django code but not others ...
   :int           :IntegerField
   :int2          :IntegerField
   :int4          :IntegerField
   :int8          :BigIntegerField
   :interval      :UnknownField     ; time span
   :json          :TextField
   :jsonb         :TextField
   :line          :UnknownField
   :lseg          :UnknownField
   :macaddr       :TextField
   :money         :DecimalField
   :numeric       :DecimalField
   :path          :UnknownField
   :pg_lsn        :IntegerField     ; PG Log Sequence #
   :point         :UnknownField
   :real          :FloatField
   :serial        :IntegerField
   :serial2       :IntegerField
   :serial4       :IntegerField
   :serial8       :BigIntegerField
   :smallint      :IntegerField
   :smallserial   :IntegerField
   :text          :TextField
   :time          :TimeField
   :timetz        :TimeField
   :timestamp     :DateTimeField
   :timestamptz   :DateTimeField
   :tsquery       :UnknownField
   :tsvector      :UnknownField
   :txid_snapshot :UnknownField
   :uuid          :UnknownField
   :varbit        :UnknownField
   :varchar       :TextField
   :xml           :TextField
   (keyword "bit varying")                :UnknownField
   (keyword "character varying")          :TextField
   (keyword "double precision")           :FloatField
   (keyword "time with time zone")        :TimeField
   (keyword "time without time zone")     :TimeField
   (keyword "timestamp with timezone")    :DateTimeField
   (keyword "timestamp without timezone") :DateTimeField})


;; ## CONNECTION

(def ^:private ^:const ssl-params
  "Params to include in the JDBC connection spec for an SSL connection."
  {:ssl        true
   :sslmode    "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"})  ; HACK Why enable SSL if we disable certificate validation?

(defn- connection-details->connection-spec [{:keys [ssl] :as details-map}]
  (-> details-map
      (dissoc :ssl)                                           ; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
      (merge (when ssl                                        ; merging ssl-params will add :ssl back in if desirable
               ssl-params))
      (rename-keys {:dbname :db})
      kdb/postgres))


(defn- database->connection-details [{:keys [details]}]
  (let [{:keys [host port]} details]
    (-> details
        (assoc :host       host
               :make-pool? false
               :db-type    :postgres                          ; What purpose is this serving?
               :ssl        (:ssl details)
               :port       (if (string? port) (Integer/parseInt port)
                               port))
        (rename-keys {:dbname :db}))))


;; ## QP

(defn- timezone->set-timezone-sql [timezone]
  (format "SET LOCAL timezone TO '%s';" timezone))

(defn- cast-timestamp-seconds-field-to-date-fn [table-name field-name]
  {:pre [(string? table-name)
         (string? field-name)]}
  (format "(TIMESTAMP WITH TIME ZONE 'epoch' + (\"%s\".\"%s\" * INTERVAL '1 second'))::date" table-name field-name))

(defn- cast-timestamp-milliseconds-field-to-date-fn [table-name field-name]
  {:pre [(string? table-name)
         (string? field-name)]}
  (format "(TIMESTAMP WITH TIME ZONE 'epoch' + (\"%s\".\"%s\" * INTERVAL '1 millisecond'))::date" table-name field-name))

(def ^:private ^:const uncastify-timestamp-regex
  ;; TODO - this doesn't work
  #"TO_TIMESTAMP\([^.\s]+\.([^.\s]+)(?: / 1000)?\)::date")

;; ## DRIVER

(def ^:const driver
  (generic-sql/map->SqlDriver
   {:additional-supported-features                #{:set-timezone}
    :column->base-type                            column->base-type
    :connection-details->connection-spec          connection-details->connection-spec
    :database->connection-details                 database->connection-details
    :sql-string-length-fn                         :CHAR_LENGTH
    :timezone->set-timezone-sql                   timezone->set-timezone-sql
    :cast-timestamp-seconds-field-to-date-fn      cast-timestamp-seconds-field-to-date-fn
    :cast-timestamp-milliseconds-field-to-date-fn cast-timestamp-milliseconds-field-to-date-fn
    :uncastify-timestamp-regex                    uncastify-timestamp-regex}))
