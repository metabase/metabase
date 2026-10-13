(ns metabase.api-keys.models.api-key-usage-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ApiKeyUsageLog [_model] :api_key_usage_log)

(doto :model/ApiKeyUsageLog
  (derive :metabase/model))
