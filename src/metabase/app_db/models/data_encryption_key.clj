(ns metabase.app-db.models.data-encryption-key
  "A model for the `data_encryption_key` table: one row per wrapped DEK generation used by local envelope encryption.

  This model exists mainly so the table participates in the `dump-to-h2` / `load-from-h2` copy walk (see
  `metabase.cmd.copy`): a dump of an encrypted database must carry its wrapped DEK rows, or its v2-format values would
  be unreadable on the target. All cryptography lives in `metabase.util.encryption.dek`; the app-DB store adapter is
  `metabase.app-db.dek-store`."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataEncryptionKey [_model] :data_encryption_key)

(doto :model/DataEncryptionKey
  (derive :metabase/model))
