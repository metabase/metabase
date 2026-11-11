(ns metabase.api-keys.models.api-key-usage-log
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/ApiKeyUsageLog [_model] :api_key_usage_log)

(doto :model/ApiKeyUsageLog
  (derive :metabase/model))
