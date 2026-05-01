(ns metabase-enterprise.workspaces.models.workspace-access-key
  "Per-workspace access key used for unauthenticated
   `/api/ee/workspace-public/:key` endpoints. The plaintext is a UUID generated
   at creation time and returned to the caller exactly once. Only its SHA-256
   hex hash is kept at rest in `key_hash`, which is uniquely indexed and
   serves as both the lookup discriminator and the verifier — the plaintext is
   never stored."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/WorkspaceAccessKey [_model] :workspace_access_key)

(doto :model/WorkspaceAccessKey
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn key-hash
  "Hex SHA-256 of `plaintext`. The stored `key_hash` is computed via this fn at
   insert time, and lookups recompute it on the incoming key to find a matching
   row in O(log n) via the unique index."
  ^String [^String plaintext]
  (let [bytes (.digest (MessageDigest/getInstance "SHA-256")
                       (.getBytes plaintext StandardCharsets/UTF_8))
        sb    (StringBuilder. (* 2 (alength bytes)))]
    (doseq [b bytes]
      (.append sb (format "%02x" b)))
    (str sb)))

(defn get-access-key
  "Look up an access-key row by its plaintext UUID. Hashes the incoming value
   and queries the indexed `key_hash` column — single read, no full scan, no
   in-memory verify step. Returns the row or nil."
  [^String plaintext]
  (t2/select-one :model/WorkspaceAccessKey :key_hash (key-hash plaintext)))
