(ns metabase.driver.postgres.sync
  "Implementation of `sync-tables` for Postgres."
  (:require [metabase.driver.generic-sql.sync :as generic]
            [metabase.driver.sync :as driver]))

(def column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:bool :BooleanField
   :date :DateField
   :float8 :FloatField
   :inet :TextField             ; This was `GenericIPAddressField` in some places in the Django code but not others ...
   :int2 :IntegerField
   :int4 :IntegerField
   :serial :IntegerField
   :text :TextField
   :timestamptz :DateTimeField
   :varchar :TextField})

(defmethod driver/sync-tables :postgres [database]
  (binding [generic/*column->base-type* column->base-type]
    (generic/sync-tables database)))
