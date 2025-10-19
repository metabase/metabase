(ns metabase.lib-be.hash
  "Code for hashing a query."
  (:require
   [buddy.core.hash :as buddy-hash]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib-be.models.transforms :as lib-be.models.transforms]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- encoder* []
  (mc/encoder
   ::lib.schema/query
   (mtx/transformer
    {:name :for-hashing}
    ;; remove Lib UUID from anywhere that might still have it
    {:encoders {:map (fn [m]
                       (cond-> m
                         (:lib/uuid m) (dissoc :lib/uuid)))}}
    ;; convert anything that's not a sorted map to one
    {:encoders {:map (fn [m]
                       (when (map? m)
                         (if (sorted? m)
                           m
                           (into (lib.schema.common/unfussy-sorted-map) m))))}})))

(defn- encoder []
  (mr/cached ::encoder ::lib.schema/query encoder*))

(mu/defn comparable-query :- :map
  "Return `query` normalized in such a way that two instances of the same query compare equal."
  [query :- :map]
  ((encoder) (dissoc query :lib/metadata)))

(mu/defn query-hash :- bytes?
  "Return a 256-bit SHA3 hash of `query` as a key for the cache. (This is returned as a byte array.)"
  ^bytes [query :- :map]
  (-> query
      (cond-> (not= (keyword (:type query)) :internal) lib-be.models.transforms/normalize-query)
      comparable-query
      json/encode
      buddy-hash/sha3-256))
