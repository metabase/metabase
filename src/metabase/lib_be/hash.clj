(ns metabase.lib-be.hash
  "Code for hashing a query."
  (:require
   [buddy.core.hash :as buddy-hash]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib-be.models.transforms :as lib-be.models.transforms]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- encoder* []
  (mc/encoder
   ::lib.schema/query
   (mtx/transformer
    {:name :for-hashing})))

(defn- encoder []
  (mr/cached ::encoder ::lib.schema/query encoder*))

(defn- encode [query]
  ;; First apply Malli schema-based encoders (e.g. for parameters, aggregation refs).
  ;; Then use remove-lib-uuids and sorted-maps as generic post-processing steps.
  ;; The post-processing is necessary because Malli encoders only apply to values
  ;; that match specific schemas. Values typed as :any (like args to :+ clauses)
  ;; pass through without encoding, so nested maps with :lib/uuid keys won't have
  ;; them stripped and won't be converted to sorted maps.
  (-> query
      ((encoder))
      lib.schema.util/remove-lib-uuids
      (lib.schema.util/sorted-maps lib.schema.common/unfussy-sorted-map)))

(mu/defn query->hash-input :- :map
  "Normalize and strip `query` to the canonical form used for hashing."
  [query :- :map]
  (-> query
      (cond-> (not= (keyword (:type query)) :internal)
        (as-> $query (lib-be.models.transforms/normalize-query nil $query {:strict? true})))
      encode))

(mu/defn query-hash :- bytes?
  "Return a 256-bit SHA3 hash of `query` as a key for the cache. (This is returned as a byte array.)"
  ^bytes [query :- :map]
  (-> query
      query->hash-input
      json/encode
      buddy-hash/sha3-256))
