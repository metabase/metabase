(ns metabase.api-keys.models.api-key-usage-log
  (:require
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ApiKeyUsageLog [_model] :api_key_usage_log)

(doto :model/ApiKeyUsageLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-api-key-usage-logs!
  "Insert the ApiKeyUsageLog `rows` in one transaction."
  [rows :- [:sequential ::api-keys.schema/api-key-usage-log.create]]
  (when (seq rows)
    (t2/with-transaction [_conn]
      (run! (comp api-keys.db/insert-api-key-usage-logs! vec) (partition-all mdb/create-partition-size rows)))))

(mu/defn delete-api-key-usage-logs! :- :nil
  "Delete the ApiKeyUsageLogs with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/ApiKeyUsageLog ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ApiKeyUsageLog [_model]
  {:skip? true})
