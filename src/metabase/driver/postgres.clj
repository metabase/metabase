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

(defn is-legacy-conn-details?
  "Is DETAILS-MAP a legacy map (i.e., does it only contain `conn_str`)?"
  [details-map]
  {:pre [(map? details-map)]}
  (not (:dbname details-map)))

(defn parse-legacy-conn-str
  "Parse a legacy `database.details.conn_str` CONNECTION-STRING and return a new-style map."
  [connection-string]
  {:pre [(string? connection-string)]}
  (let [{:keys [port] :as details} (-<>> connection-string
                                         (s/split <> #" ")                       ; split into k=v pairs
                                         (map (fn [pair]                          ; convert to {:k v} pairs
                                                (let [[k v] (s/split pair #"=")]
                                                  {(keyword k) v})))
                                         (reduce conj {}))]
    (cond-> details
      (string? port) (update-in :port (Integer/parseInt port)))))

(defn- database->connection-details [{:keys [details]}]
  (let [{:keys [host port] :as details} (if (is-legacy-conn-details? details) (parse-legacy-conn-str (:conn_str details))
                                            details)]
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


;; ## DRIVER

(def ^:const driver
  (generic-sql/map->SqlDriver
   {:column->base-type                   column->base-type
    :connection-details->connection-spec connection-details->connection-spec
    :database->connection-details        database->connection-details
    :sql-string-length-fn                :CHAR_LENGTH
    :timezone->set-timezone-sql          timezone->set-timezone-sql}))
