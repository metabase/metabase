(ns metabase.embedding.models.sdk-react-18-host
  "Model for the host apps that use the React embedding SDK with React 18."
  (:require
   [metabase.embedding.schema :as embedding.schema]
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/EmbeddingSdkReact18Host [_model] :embedding_sdk_react_18_host)

(doto :model/EmbeddingSdkReact18Host
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser)
  (derive :hook/created-at-timestamped?))

;; The middleware normalizes the host before it saves it; this rejects a new row whose host is not normalized.
(t2/define-before-insert :model/EmbeddingSdkReact18Host
  [{:keys [host], :as row}]
  (when-not (mr/validate ::embedding.schema/sdk-react-18-host.host host)
    (throw (ex-info (format "Invalid React 18 SDK host: %s" (pr-str host)) {:host host})))
  row)
