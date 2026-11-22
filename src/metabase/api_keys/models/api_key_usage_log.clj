(ns metabase.api-keys.models.api-key-usage-log
  (:require
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.schema :as api-keys.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ApiKeyUsageLog [_model] :api_key_usage_log)

(doto :model/ApiKeyUsageLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-api-key-usage-logs!
  "Insert the ApiKeyUsageLog `rows` as one batch."
  [rows :- [:sequential ::api-keys.schema/api-key-usage-log.create]]
  (api-keys.db/insert-api-key-usage-logs! rows))

(mu/defn delete-api-key-usage-logs-for-cleanup!
  "Delete the ApiKeyUsageLogs whose `occurred_at` is before `cutoff`, returning the number deleted."
  [cutoff :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (api-keys.db/delete-api-key-usage-logs-occurred-before! cutoff))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ApiKeyUsageLog [_model]
  {:skip? true})
