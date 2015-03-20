(ns metabase.driver.postgres.sync
  "Implementation of `sync-tables` for Postgres."
  (:require [metabase.driver.generic-sql.sync :as generic]
            [metabase.driver :refer [sync-database]]))

(def column->base-type
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

(defmethod sync-database :postgres [database]
  (binding [generic/*column->base-type* column->base-type]
    (generic/sync-database database)))
