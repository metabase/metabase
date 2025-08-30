(ns metabase-enterprise.bookmarks.models.bookmark
  "Enterprise DocumentBookmark model. Provides bookmarking functionality for documents."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DocumentBookmark [_model] :document_bookmark)

(doto :model/DocumentBookmark
  (derive :metabase/model))
