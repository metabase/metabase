(ns metabase-enterprise.serialization.specs
  "Shared specs for serialization related code."
  (:require [clojure.spec.alpha :as s]))

;; a structure that represents items that can be loaded
;; (s/def ::load-items (s/cat ::context map? ::model some? ::entity-dir string? ::entity-names (s/+ string?)))

;; a structure that represents some items having failed to load; items are fully qualified entity names
(s/def ::failed-name-resolution (s/map-of string? (s/+ string?)))
