(ns metabase.queries.models.stored-result
  "Cached query result snapshots. A `stored_result` row holds the serialized bytes a worker
  produced for one execution of a `dataset_query`, plus the bookkeeping the read path needs
  (`creator_id`, `database_id`, `dataset_query`) to gate cached-read permissions. Lives in the
  queries module because the snapshot is tied to a query/card, not to any one feature that
  produced it."
  (:require
   [clojure.edn :as edn]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResult [_model] :stored_result)

(defn- data-access-token-in
  "Serialize the effective-data-access token as EDN. JSON can't be used: the token is keyed by
  integer table-id / database-id, and JSON mangles non-string map keys. `nil` is stored as SQL
  NULL rather than the string \"nil\"."
  [v]
  (when (some? v)
    (pr-str v)))

(defn- data-access-token-out
  "Read the EDN token back. An unreadable blob decodes to `nil`, which the read gate
  ([[metabase.queries.cached-result]]) denies to everyone but superusers — fail closed, never
  widen access on a parse error. The write path never persists a token-less snapshot, so an
  unreadable one here is a bug: logged at ERROR, like the denial it leads to."
  [s]
  (when (string? s)
    (try
      (edn/read-string {:readers {} :default (fn [_tag v] v)} s)
      (catch Throwable e
        (log/error e "Failed to parse stored_result.data_access_token; the read gate will deny non-admins")
        nil))))

(t2/deftransforms :model/StoredResult
  {:result_data       mi/transform-secret-value
   :dataset_query     mi/transform-json
   :data_access_token {:in data-access-token-in :out data-access-token-out}})

(doto :model/StoredResult
  (derive :metabase/model)
  (derive :hook/timestamped?))
