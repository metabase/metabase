(ns metabase.driver.postgres
  (:require [clojure.tools.logging :as log]
            (clojure [set :refer [rename-keys]]
                     [string :as s])
            [korma.db :as kdb]
            [swiss.arrows :refer :all]
            [metabase.config :as config]
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
   :uuid          :TextField
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

(defn- connection-details->connection-spec [details-map]
  (kdb/postgres (rename-keys details-map {:dbname :db})))

(def ^:private ^:const ssl-params
  {:ssl true
   :sslmode "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"}) ; HACK Why enable SSL if we disable certificate validation?

(def ^:private ssl-supported?
  "Determine wheter we can make an SSL connection.
   Do that by checking whether we can connect with SSL params assoced with DETAILS-MAP.
   This call is memoized."
  (memoize
   (fn [details-map]
     (try (i/can-connect-with-details? driver (merge details-map ssl-params)) ; only calls connection-details->connection-spec
          true
          (catch Throwable e
            (log/info (.getMessage e))
            false)))))

(defn- database->connection-details [database]
  (let [details (-<>> database :details :conn_str             ; get conn str like "password=corvus user=corvus ..."
                      (s/split <> #" ")                       ; split into k=v pairs
                      (map (fn [pair]                          ; convert to {:k v} pairs
                             (let [[k v] (s/split pair #"=")]
                               {(keyword k) v})))
                      (reduce conj {}))                       ; combine into single dict
        {:keys [host dbname port host]} details
        details-map (-> details
                        (assoc :host host                    ; e.g. "localhost"
                               :make-pool? false
                               :db-type :postgres
                               :port (Integer/parseInt port))
                        (rename-keys {:dbname :db}))]       ; convert :port to an Integer

    ;; Determine whether we should use an SSL connection, and assoc relevant params if so.
    ;; If config option mb-postgres-ssl is true, the always use SSL;
    ;; otherwise, call ssl-supported? to try and see if we can make an SSL connection.
    (cond-> details-map
      (or (config/config-bool :mb-postgres-ssl)
          (ssl-supported? details-map)) (merge ssl-params))))


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
