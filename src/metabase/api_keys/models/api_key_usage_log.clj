(ns metabase.api-keys.models.api-key-usage-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ApiKeyUsageLog [_model] :api_key_usage_log)

(doto :model/ApiKeyUsageLog
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/ApiKeyUsageLog [_model]
  {:skip? true})
