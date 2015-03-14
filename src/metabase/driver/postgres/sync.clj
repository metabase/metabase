(ns metabase.driver.postgres.sync
  "Implementation of `sync-tables` for Postgres."
  (:require [metabase.driver.generic-sql.sync :as generic]
            [metabase.driver :refer [sync-tables]]))

(def column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:bool :BooleanField
   :bytea :UnknownField
   :date :DateField
   :float8 :FloatField
   :geometry :UnknownField
   :inet :TextField             ; This was `GenericIPAddressField` in some places in the Django code but not others ...
   :int2 :IntegerField
   :int4 :IntegerField
   :int8 :BigIntegerField
   :json :TextField
   :numeric :DecimalField
   :serial :IntegerField
   :text :TextField
   :time :TimeField
   :timestamp :DateTimeField
   :timestamptz :DateTimeField
   :varchar :TextField})

(defmethod sync-tables :postgres [database]
  (binding [generic/*column->base-type* column->base-type]
    (generic/sync-tables database)))
