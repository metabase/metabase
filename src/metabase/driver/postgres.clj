(ns metabase.driver.postgres
  (:require [clojure.set :refer [rename-keys]]
            [clojure.string :as s]
            [korma.db :as kdb]
            [swiss.arrows :refer :all]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as generic-sql]))

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

(defn- database->connection-details [database]
  (let [details (-<>> database :details :conn_str             ; get conn str like "password=corvus user=corvus ..."
                      (s/split <> #" ")                       ; split into k=v pairs
                      (map (fn [pair]                          ; convert to {:k v} pairs
                             (let [[k v] (s/split pair #"=")]
                               {(keyword k) v})))
                      (reduce conj {}))                       ; combine into single dict
        {:keys [host dbname port host]} details]
    (-> details
        (assoc :host host                                     ; e.g. "localhost"
               :make-pool? false
               :db-type :postgres                             ; HACK hardcoded to postgres for time being until API has a way to choose DB type !
               :port (Integer/parseInt port))                 ; convert :port to an Integer
        (cond-> (config/config-bool :mb-postgres-ssl) (assoc :ssl true :sslfactory "org.postgresql.ssl.NonValidatingFactory"))
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
