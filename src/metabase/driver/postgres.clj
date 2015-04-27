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
  {:ssl true
   :sslmode "require"
   :sslfactory "org.postgresql.ssl.NonValidatingFactory"}) ; HACK Why enable SSL if we disable certificate validation?

(def ^:dynamic ^:private *is-determining-ssl-support*
  "Keep track of whether we're doing an SSL support check, so we don't do infinitely recursion within `ssl-supported?`."
  false)

(def ^:private ssl-supported?
  "Determine wheter we can make an SSL connection.
   Do that by checking whether we can connect with SSL params assoced with DETAILS-MAP.
  This call is memoized."
  (memoize
   (fn [details-map]
     (binding [*is-determining-ssl-support* true]
       (log/info "Checking SSL support...")
       (try (i/can-connect-with-details? driver (merge details-map ssl-params)) ; only calls connection-details->connection-spec
            (log/info "SSL supported.")
            true
            (catch Throwable _
              (log/info "SSL is *not* supported.")
              false))))))

(defn- connection-details->connection-spec
  ([details-map]
   (-> details-map
       (rename-keys {:dbname :db})                            ; not sure we need to do this since it's being done in database->connection-details (?)
       (merge (when (or (config/config-bool :mb-postgres-ssl)
                        (and (not *is-determining-ssl-support*)
                             (ssl-supported? details-map)))
                ssl-params))
       kdb/postgres)))

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
               :db-type :postgres
               :port (Integer/parseInt port))                 ; convert :port to an Integer
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
