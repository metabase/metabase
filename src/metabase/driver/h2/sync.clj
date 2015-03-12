(ns metabase.driver.h2.sync
  "Implementation of `sync-tables` for H2."
  (:require [metabase.driver.generic-sql.sync :as generic]
            [metabase.driver :refer [sync-tables]]))

(def column->base-type
  "Map of H2 Column types -> Field base types. (Add more mappings here as needed)"
  {:BIGINT :BigIntegerField
   :DATE :DateField
   :DOUBLE :FloatField
   :INTEGER :IntegerField
   :TIMESTAMP :DateTimeField
   :VARCHAR :TextField})

(defmethod sync-tables :h2 [database]
  (binding [generic/*column->base-type* column->base-type]
    (generic/sync-tables database)))
