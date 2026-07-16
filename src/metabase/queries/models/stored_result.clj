(ns metabase.queries.models.stored-result
  "Cached query result snapshots. A `stored_result` row holds the serialized bytes a worker
  produced for one execution of a `dataset_query`, plus the bookkeeping the read path needs
  (`creator_id`, `database_id`, `dataset_query`) to gate cached-read permissions. Many
  `report_card` rows — one per `cardEmbed` in a document — can render against the same
  snapshot; the (card, stored_result) pairing lives on the `cardEmbed` node, not in any DB
  table. Lives in the queries module because the snapshot is tied to a query/card, not to
  any one feature that produced it."
  (:require
   [clojure.edn :as edn]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResult [_model] :stored_result)

(defn- data-access-token-in
  "Serialize the effective-data-access token as EDN. JSON can't be used: the token is keyed by
  integer table-id / database-id, and JSON mangles non-string map keys. `nil` (creator+admin-only)
  is stored as SQL NULL rather than the string \"nil\"."
  [v]
  (when (some? v)
    (pr-str v)))

(defn- data-access-token-out
  "Read the EDN token back. An unreadable blob decodes to `nil`, which the read gate treats as
  creator+admin-only — fail closed, never widen access on a parse error."
  [s]
  (when (string? s)
    (try
      (edn/read-string {:readers {} :default (fn [_tag v] v)} s)
      (catch Throwable e
        (log/warn e "Failed to parse stored_result.data_access_token; treating as creator+admin-only")
        nil))))

(t2/deftransforms :model/StoredResult
  {:result_data       mi/transform-secret-value
   :dataset_query     mi/transform-json
   :data_access_token {:in data-access-token-in :out data-access-token-out}})

(doto :model/StoredResult
  (derive :metabase/model)
  (derive :hook/timestamped?))
