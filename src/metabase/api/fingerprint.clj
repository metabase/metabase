(ns metabase.api.fingerprint
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.fingerprinting :as fingerprinting]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]]
                             [segment :refer [Segment]]
                             [card :refer [Card]])))

(api/defendpoint GET "/field/:id"
  "Get fingerprint for a `Field` with ID."
  [id]
  (->> id
       (api/read-check Field)
       fingerprinting/fingerprint))

(api/defendpoint GET "/table/:id"
  "Get fingerprint for a `Tield` with ID."
  [id]
  (->> id
       (api/read-check Table)
       fingerprinting/fingerprint))

(api/defendpoint GET "/segment/:id"
  "Get fingerprint for a `Segment` with ID."
  [id]
  (->> id
       (api/read-check Segment)
       fingerprinting/fingerprint))

(api/defendpoint GET "/card/:id"
  "Get fingerprint for a `Card` with ID."
  [id]
  (->> id
       (api/read-check Card)
       fingerprinting/fingerprint))

(api/defendpoint GET "/compare/fields/:id1/:id2"
  "Get comparison fingerprints for `Field`s with ID1 and ID2."
  [& ids]
  (->> ids
       vals
       (map (partial api/read-check Field))
       (apply fingerprinting/compare-fingerprints)))

(api/defendpoint GET "/compare/tables/:id1/:id2"
  "Get comparison fingerprints for `Table`s with ID1 and ID2."
  [& ids]
  (->> ids
       vals
       (map (partial api/read-check Table))
       (apply fingerprinting/compare-fingerprints)))

(api/defendpoint GET "/compare/cards/:id1/:id2"
  "Get comparison fingerprints for `Card`s with ID1 and ID2."
  [& ids]
  (->> ids
       vals
       (map (partial api/read-check Card))
       (apply fingerprinting/compare-fingerprints)))

(api/defendpoint GET "/compare/segments/:id1/:id2"
  "Get comparison fingerprints for `Segment`s with ID1 and ID2."
  [& ids]
  (->> ids
       vals
       (map (partial api/read-check Segment))
       (apply fingerprinting/compare-fingerprints)))

(api/define-routes)
