(ns metabase.product-analytics.core
  "Constants for the Product Analytics subsystem. Placed in OSS code so that permission checks
   and downgrade scenarios can reference them without requiring the EE module.")

;; NOTE: Constants like `product-analytics-db-id` and the collection entity IDs are placed in OSS code because
;; product analytics content may be loaded on an OSS build in the case of an EE->OSS downgrade. In these situations,
;; we still need access to identifiers in order to enforce permission checks properly.

(def product-analytics-db-id
  "ID of the Product Analytics virtual Database."
  13371338)

(def product-analytics-collection-entity-id
  "Entity ID for the Product Analytics collection."
  "pA7xR2k-QeeHWB8_58vno")
