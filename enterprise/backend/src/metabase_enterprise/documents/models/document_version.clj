(ns metabase-enterprise.documents.models.document-version
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DocumentVersion [_model] :document_version)

(doto :model/DocumentVersion
  (derive :metabase/model)
  (derive :hook/timestamped?))
